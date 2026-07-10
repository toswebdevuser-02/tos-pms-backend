/**
 * Status Repository - Project status records.
 */

import { prisma } from '../prisma'

interface Row {
  [key: string]: any
}

function flatStatus(s: any): Row {
  return {
    id: s.id,
    project_id: s.projectId,
    overall: s.overall || '',
    notes: s.notes || '',
    last_updated: s.lastUpdated,
  }
}

export async function getAll(): Promise<Row[]> {
  const statuses = await prisma.projectStatus.findMany()
  return statuses.map(flatStatus)
}

export async function getByProject(projectId: number): Promise<Row | undefined> {
  const status = await prisma.projectStatus.findUnique({
    where: { projectId },
  })
  return status ? flatStatus(status) : undefined
}

export async function upsert(projectId: number, data: {
  status?: string
  overdueCount?: number
  overall?: string
  notes?: string
}): Promise<void> {
  await prisma.projectStatus.upsert({
    where: { projectId },
    create: {
      projectId,
      overall: data.overall || '',
      notes: data.notes || '',
    },
    update: {
      ...(data.overall !== undefined && { overall: data.overall }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  })
}
