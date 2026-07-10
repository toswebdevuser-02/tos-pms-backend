/**
 * Client Repository - Client registry.
 */

import { prisma } from '../prisma'

interface Row {
  [key: string]: any
}

function flatClient(c: any): Row {
  return {
    id: c.id,
    name: c.name,
    company: c.company,
    code: c.code,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }
}

export async function getAll(): Promise<Row[]> {
  const clients = await prisma.client.findMany({
    orderBy: { name: 'asc' },
  })
  return clients.map(flatClient)
}

export async function getById(id: number): Promise<Row | undefined> {
  const client = await prisma.client.findUnique({
    where: { id },
  })
  return client ? flatClient(client) : undefined
}

export async function create(data: {
  name: string
  company?: string
}): Promise<number> {
  // Generate code: next available code
  const maxCodeNum = await prisma.client.aggregate({
    _max: { code: true },
  })
  const nextNum = (parseInt(maxCodeNum._max.code?.replace('C', '') || '0') || 0) + 1
  const code = `C${String(nextNum).padStart(4, '0')}`

  const client = await prisma.client.create({
    data: {
      name: data.name,
      company: data.company,
      code,
    },
  })
  return client.id
}

export async function update(
  id: number,
  data: {
    name?: string
    company?: string
  }
): Promise<void> {
  const updateData: any = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.company !== undefined) updateData.company = data.company

  await prisma.client.update({
    where: { id },
    data: updateData,
  })
}

export async function delete_(id: number): Promise<void> {
  await prisma.client.delete({
    where: { id },
  })
}
