/**
 * Attachment Repository - Data access for attachments.
 */

import { prisma } from '../prisma'
import { fmtDate } from '../tables'

interface Row {
  [key: string]: any
}

function flatAttachment(a: {
  id: number
  entityType: string
  entityId: number
  filename: string
  storedPath: string
  description: string
  response: string
  importance: string
  createdAt: Date
}): Row {
  return {
    id: a.id,
    entity_type: a.entityType,
    entity_id: a.entityId,
    filename: a.filename,
    stored_path: a.storedPath,
    description: a.description,
    response: a.response,
    importance: a.importance,
    created_at: fmtDate(a.createdAt),
  }
}

export async function getByEntity(entityType: string, entityId: number): Promise<Row[]> {
  const attachments = await prisma.attachment.findMany({ where: { entityType, entityId } })
  return attachments.map(flatAttachment)
}

export async function getMany(entityType: string, ids: number[]): Promise<Row[]> {
  const attachments = await prisma.attachment.findMany({
    where: { entityType, entityId: { in: ids } },
  })
  return attachments.map(flatAttachment)
}

export async function getById(id: number): Promise<Row | undefined> {
  const a = await prisma.attachment.findUnique({ where: { id } })
  return a ? flatAttachment(a) : undefined
}

export async function add(entityType: string, entityId: number, filename: string, storedPath: string): Promise<Row> {
  const a = await prisma.attachment.create({
    data: { entityType, entityId, filename, storedPath },
  })
  return flatAttachment(a)
}

export async function updateDescription(id: number, description: string): Promise<void> {
  await prisma.attachment.update({ where: { id }, data: { description } })
}

export async function update(id: number, patch: Row): Promise<void> {
  const data: Row = {}
  for (const k of ['description', 'response', 'importance', 'filename', 'stored_path'] as const) {
    if (patch[k] !== undefined) {
      data[k === 'stored_path' ? 'storedPath' : k] = patch[k]
    }
  }
  await prisma.attachment.update({ where: { id }, data })
}

export async function delete_(id: number): Promise<Row | undefined> {
  const a = await prisma.attachment.findUnique({ where: { id } })
  if (!a) return undefined
  await prisma.attachment.delete({ where: { id } })
  return flatAttachment(a)
}
