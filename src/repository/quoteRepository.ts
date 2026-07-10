/**
 * Quote Repository - Data access for quotes.
 */

import { prisma } from '../prisma'
import { Prisma } from '@prisma/client'
import { fmtDate } from '../tables'

interface Row {
  [key: string]: any
}

function flatQuote(q: { id: number; data: unknown; createdAt: Date; updatedAt: Date; createdBy: string; updatedBy: string; version: number }): Row {
  const data = (q.data ?? {}) as Row
  return {
    ...data,
    id: q.id,
    created_at: fmtDate(q.createdAt),
    updated_at: fmtDate(q.updatedAt),
    created_by: q.createdBy,
    updated_by: q.updatedBy,
    version: q.version,
  }
}

export async function getAll(): Promise<Row[]> {
  const quotes = await prisma.quote.findMany({ orderBy: { id: 'desc' } })
  return quotes.map(flatQuote)
}

export async function create(fields: Row, actor: string): Promise<number> {
  const { id, created_at, updated_at, created_by, updated_by, version, ...data } = fields
  const q = await prisma.quote.create({
    data: {
      data: data as Prisma.InputJsonValue,
      createdBy: actor,
      updatedBy: actor,
    },
  })
  return q.id
}

export async function update(id: number, fields: Row, actor: string): Promise<void> {
  const { id: _id, created_at, updated_at, created_by, updated_by, version, ...data } = fields
  await prisma.quote.update({
    where: { id },
    data: {
      data: data as Prisma.InputJsonValue,
      updatedBy: actor,
      version: { increment: 1 },
    },
  })
}

export async function delete_(id: number): Promise<void> {
  await prisma.quote.delete({ where: { id } })
}
