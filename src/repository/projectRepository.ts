/**
 * Project Repository - All Prisma queries for projects.
 * Repositories never contain business logic, only data access.
 * Assumption: service layer validates all input before calling repository.
 */

import { prisma } from '../prisma'

interface Row {
  [key: string]: any
}

// interface ProjectRow {
//   id: number
//   name: string
//   client: string
//   location: string
//   discipline: string
//   type: string
//   quotedHours: number
//   startDate: string
//   endDate: string
//   createdBy: string
//   updatedBy: string
//   deletedAt?: Date | null
//   archived: boolean
//   version: number
//   clientId?: number | null
// }

// Helper: flatten Prisma project to Row (legacy compatibility)
function flatProject(p: any): Row {
  return {
    id: p.id,
    name: p.name,
    client: p.client,
    location: p.location,
    discipline: p.discipline,
    type: p.type || '',
    quoted_hours: p.quotedHours,
    start_date: p.startDate,
    end_date: p.endDate,
    created_by: p.createdBy,
    updated_by: p.updatedBy,
    deleted_at: p.deletedAt,
    archived: p.archived,
    version: p.version,
    client_id: p.clientId,
  }
}

/**
 * Get all active (non-deleted) projects.
 * Ordered by newest first.
 */
export async function getAll(): Promise<Row[]> {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { id: 'desc' },
  })
  return projects.map(flatProject)
}

/**
 * Get all deleted projects (soft-deleted, in recycle bin).
 */
export async function getDeleted(): Promise<Row[]> {
  const projects = await prisma.project.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: 'desc' },
  })
  return projects.map(flatProject)
}

/**
 * Get single project by ID.
 */
export async function getById(id: number): Promise<Row | undefined> {
  const project = await prisma.project.findUnique({
    where: { id },
  })
  return project ? flatProject(project) : undefined
}

/**
 * Create a new project.
 * Returns the created project ID.
 */
export async function create(data: {
  name: string
  client: string
  location: string
  discipline: string
  type: string
  quotedHours: number
  startDate: string
  endDate: string
  clientId?: number | null
  createdBy: string
  updatedBy: string
}): Promise<number> {
  const project = await prisma.project.create({
    data: {
      name: data.name,
      client: data.client,
      location: data.location,
      discipline: data.discipline || '',
      type: data.type || '',
      quotedHours: data.quotedHours || 0,
      startDate: data.startDate || '',
      endDate: data.endDate || '',
      clientId: data.clientId ?? null,
      createdBy: data.createdBy,
      updatedBy: data.updatedBy,
    },
  })
  return project.id
}

/**
 * Update an existing project.
 */
export async function update(
  id: number,
  data: {
    name?: string
    client?: string
    location?: string
    discipline?: string
    type?: string
    quotedHours?: number
    startDate?: string
    endDate?: string
    clientId?: number | null
    updatedBy: string
  }
): Promise<void> {
  const updateData: any = { version: { increment: 1 }, updatedBy: data.updatedBy }

  if (data.name !== undefined) updateData.name = data.name
  if (data.client !== undefined) updateData.client = data.client
  if (data.location !== undefined) updateData.location = data.location
  if (data.discipline !== undefined) updateData.discipline = data.discipline || ''
  if (data.type !== undefined) updateData.type = data.type || ''
  if (data.quotedHours !== undefined) updateData.quotedHours = data.quotedHours || 0
  if (data.startDate !== undefined) updateData.startDate = data.startDate || ''
  if (data.endDate !== undefined) updateData.endDate = data.endDate || ''
  if (data.clientId !== undefined) updateData.clientId = data.clientId

  await prisma.project.update({
    where: { id },
    data: updateData,
  })
}

/**
 * Soft delete: move to recycle bin (restorable for 15 days).
 */
export async function softDelete(id: number, actor: string): Promise<void> {
  await prisma.project.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      updatedBy: actor,
      version: { increment: 1 },
    },
  })
}

/**
 * Restore a soft-deleted project from recycle bin.
 */
export async function restore(id: number, actor: string): Promise<void> {
  await prisma.project.update({
    where: { id },
    data: {
      deletedAt: null,
      updatedBy: actor,
      version: { increment: 1 },
    },
  })
}

/**
 * Permanently delete a project (hard delete).
 */
export async function purge(id: number): Promise<void> {
  await prisma.project.delete({
    where: { id },
    // Items and project members cascade delete
  })
}

/**
 * Purge projects that have been deleted for longer than specified days.
 */
export async function purgeExpired(days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const result = await prisma.project.deleteMany({
    where: {
      deletedAt: { not: null, lt: cutoff },
    },
  })
  return result.count
}

/**
 * Set project archived status.
 */

export async function setArchived(id: number, archived: boolean, actor: string): Promise<void> {
  await prisma.project.update({
    where: { id },
    data: { archived, updatedBy: actor, version: { increment: 1 } },
  })
}

