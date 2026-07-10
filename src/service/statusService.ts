/**
 * Status Service - Project status management.
 */

import * as statusRepository from '../repository/statusRepository'
import { broadcast } from '../ws'

interface Row {
  [key: string]: any
}

export async function getAll(): Promise<Row[]> {
  return statusRepository.getAll()
}

export async function getByProject(projectId: number): Promise<Row | undefined> {
  return statusRepository.getByProject(projectId)
}

export async function upsert(projectId: number, data: {
  status?: string
  overdueCount?: number
  overall?: string
  notes?: string
}): Promise<void> {
  await statusRepository.upsert(projectId, data)

  await broadcast({
    entity: 'status',
    action: 'update',
    projectId,
  })
}

