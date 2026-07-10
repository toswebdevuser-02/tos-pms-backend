/**
 * Attachment Service - Business logic for attachments.
 */

import * as attachmentRepository from '../repository/attachmentRepository'
import * as itemRepository from '../repository/itemRepository'
import { broadcast } from '../ws'

interface Row {
  [key: string]: any
}

export async function getByEntity(entityType: string, entityId: number): Promise<Row[]> {
  return attachmentRepository.getByEntity(entityType, entityId)
}

export async function getMany(entityType: string, ids: number[]): Promise<Row[]> {
  return attachmentRepository.getMany(entityType, ids)
}

export async function getById(id: number): Promise<Row | undefined> {
  return attachmentRepository.getById(id)
}

export async function add(entityType: string, entityId: number, filename: string, storedPath: string): Promise<Row> {
  const row = await attachmentRepository.add(entityType, entityId, filename, storedPath)
  const projectId = await itemRepository.getProjectId(entityType, entityId).catch(() => undefined)
  await broadcast({
    entity: 'attachment',
    action: 'create',
    type: entityType,
    projectId,
  })
  return row
}

export async function updateDescription(id: number, description: string): Promise<void> {
  await attachmentRepository.updateDescription(id, description)
  const att = await attachmentRepository.getById(id)
  if (att) {
    const projectId = await itemRepository.getProjectId(String(att.entity_type), Number(att.entity_id)).catch(() => undefined)
    await broadcast({
      entity: 'attachment',
      action: 'update',
      type: String(att.entity_type),
      projectId,
    })
  }
}

export async function update(id: number, patch: Row): Promise<void> {
  await attachmentRepository.update(id, patch)
  const att = await attachmentRepository.getById(id)
  if (att) {
    const projectId = await itemRepository.getProjectId(String(att.entity_type), Number(att.entity_id)).catch(() => undefined)
    await broadcast({
      entity: 'attachment',
      action: 'update',
      type: String(att.entity_type),
      projectId,
    })
  }
}

export async function delete_(id: number): Promise<Row | undefined> {
  const att = await attachmentRepository.getById(id)
  if (!att) return undefined

  const projectId = await itemRepository.getProjectId(String(att.entity_type), Number(att.entity_id)).catch(() => undefined)
  const rec = await attachmentRepository.delete_(id)

  await broadcast({
    entity: 'attachment',
    action: 'delete',
    type: String(att.entity_type),
    projectId,
  })

  return rec
}

