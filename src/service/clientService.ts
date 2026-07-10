/**
 * Client Service - Client registry management.
 */

import * as clientRepository from '../repository/clientRepository'
import { broadcast } from '../ws'

interface Row {
  [key: string]: any
}

export async function getAll(): Promise<Row[]> {
  return clientRepository.getAll()
}

export async function getById(id: number): Promise<Row | undefined> {
  return clientRepository.getById(id)
}

export async function create(data: {
  name: string
  company?: string
}): Promise<{ id: number }> {
  if (!data.name || !data.name.trim()) {
    throw new Error('Client name is required')
  }

  const id = await clientRepository.create({
    name: data.name,
    company: data.company,
  })

  await broadcast({
    entity: 'client',
    action: 'create',
  })

  return { id }
}

export async function update(
  id: number,
  data: {
    name?: string
    company?: string
  }
): Promise<{ id: number }> {
  const existing = await clientRepository.getById(id)
  if (!existing) {
    throw new Error(`Client ${id} not found`)
  }

  await clientRepository.update(id, data)

  await broadcast({
    entity: 'client',
    action: 'update',
  })

  return { id }
}

export async function delete_(id: number): Promise<{ id: number }> {
  await clientRepository.delete_(id)

  await broadcast({
    entity: 'client',
    action: 'delete',
  })

  return { id }
}

