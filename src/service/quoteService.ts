/**
 * Quote Service - Business logic for standalone quotations.
 */

import * as quoteRepository from '../repository/quoteRepository'
import { broadcast } from '../ws'


interface Row {
  [key: string]: any
}

export async function getAll(): Promise<Row[]> {
  return quoteRepository.getAll()
}

export async function create(fields: Row, actor: string): Promise<number> {
  const id = await quoteRepository.create(fields, actor)
  await broadcast({
    entity: 'quote',
    action: 'create',
  })
  return id
}


export async function update(id: number, fields: Row, actor: string): Promise<void> {
  await quoteRepository.update(id, fields, actor)
  await broadcast({
    entity: 'quote',
    action: 'update',
  })
}


export async function delete_(id: number): Promise<void> {
  await quoteRepository.delete_(id)
  await broadcast({
    entity: 'quote',
    action: 'delete',
  })
}

