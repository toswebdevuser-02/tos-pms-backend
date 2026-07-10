/**
 * Project Service - Business logic and orchestration.
 * Services never access HTTP objects, Prisma directly, or Redis directly.
 * They call repositories for data access and broadcast/publish events.
 */

import * as projectRepository from '../repository/projectRepository'
import { broadcast, ChangeEvent } from '../ws'

interface Row {
  [key: string]: any
}

/**
 * Get all active projects.
 */
export async function getAll(): Promise<Row[]> {
  return projectRepository.getAll()
}

/**
 * Get all deleted projects (recycle bin).
 */
export async function getDeleted(): Promise<Row[]> {
  return projectRepository.getDeleted()
}

/**
 * Get project by ID.
 */
export async function getById(id: number): Promise<Row | undefined> {
  return projectRepository.getById(id)
}

/**
 * Create a new project.
 * - Validates inputs
 * - Creates via repository
 * - Broadcasts WebSocket event
 * Returns: { id }
 */
export async function create(data: {
  name: string
  client: string
  location: string
  discipline: string
  type: string
  quotedHours: string
  startDate: string
  endDate: string
  clientId?: number | null
  createdBy: string
}): Promise<{ id: number }> {
  // Validation
  if (!data.name || !data.name.trim()) {
    throw new Error('Project name is required')
  }

  // Create via repository
  const id = await projectRepository.create({
    name: data.name,
    client: data.client,
    location: data.location,
    discipline: data.discipline,
    type: data.type,
    quotedHours: parseFloat(data.quotedHours) || 0,
    startDate: data.startDate,
    endDate: data.endDate,
    clientId: data.clientId,
    createdBy: data.createdBy,
    updatedBy: data.createdBy,
  })

  // Broadcast real-time event
  await broadcast({
    entity: 'project',
    action: 'create',
    projectId: id,
  })

  return { id }
}

/**
 * Update a project.
 * - Validates inputs
 * - Updates via repository
 * - Broadcasts WebSocket event
 */
export async function update(
  id: number,
  data: {
    name?: string
    client?: string
    location?: string
    discipline?: string
    type?: string
    quotedHours?: string
    startDate?: string
    endDate?: string
    clientId?: number | null
    updatedBy: string
  }
): Promise<{ id: number }> {
  // Verify project exists
  const existing = await projectRepository.getById(id)
  if (!existing) {
    throw new Error(`Project ${id} not found`)
  }

  // Update via repository
  await projectRepository.update(id, {
    name: data.name,
    client: data.client,
    location: data.location,
    discipline: data.discipline,
    type: data.type,
    quotedHours: data.quotedHours ? parseFloat(data.quotedHours) : undefined,
    startDate: data.startDate,
    endDate: data.endDate,
    clientId: data.clientId,
    updatedBy: data.updatedBy,
  })

  // Broadcast real-time event
  await broadcast({
    entity: 'project',
    action: 'update',
    projectId: id,
  })

  return { id }
}

/**
 * Soft delete a project (move to recycle bin).
 * - Soft deletes via repository
 * - Broadcasts WebSocket event
 */
export async function softDelete(id: number, actor: string): Promise<{ id: number }> {
  // Verify project exists
  const existing = await projectRepository.getById(id)
  if (!existing) {
    throw new Error(`Project ${id} not found`)
  }

  await projectRepository.softDelete(id, actor)

  await broadcast({
    entity: 'project',
    action: 'delete',
    projectId: id,
  })

  return { id }
}

/**
 * Restore a soft-deleted project from recycle bin.
 */
export async function restore(id: number, actor: string): Promise<{ id: number }> {
  await projectRepository.restore(id, actor)

  await broadcast({
    entity: 'project',
    action: 'update',
    projectId: id,
  })

  return { id }
}

/**
 * Permanently delete a project (hard delete).
 * Company Admin only operation.
 */
export async function purge(id: number): Promise<{ id: number }> {
  await projectRepository.purge(id)

  await broadcast({
    entity: 'project',
    action: 'delete',
    projectId: id,
  })

  return { id }
}

/**
 * Archive or unarchive a project.
 */
export async function setArchived(id: number, archived: boolean, actor: string): Promise<{ id: number }> {
  // Verify project exists
  const existing = await projectRepository.getById(id)
  if (!existing) {
    throw new Error(`Project ${id} not found`)
  }

  await projectRepository.setArchived(id, archived, actor)

  await broadcast({
    entity: 'project',
    action: 'update',
    projectId: id,
  })

  return { id }
}


/**
 * Assign a member to a project.
 * Called by routes after creating project, or by project member endpoint.
 * Note: Member assignment logic is in its own service.
 */

export async function assignMember(projectId: number, memberId: number): Promise<void> {
  // This will be delegated to memberService/projectMemberService
}

export async function purgeExpired(days: number): Promise<number> {
  return projectRepository.purgeExpired(days)
}
