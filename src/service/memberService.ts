/**
 * Member Service - Business logic for members.
 */

import * as memberRepository from '../repository/memberRepository'
import { broadcast } from '../ws'
import { invalidateAuthCacheForMember } from '../auth'


interface Row {
  [key: string]: any
}

/**
 * Get all members.
 */
export async function getAll(): Promise<Row[]> {
  return memberRepository.getAll()
}

/**
 * Get member by ID.
 */
export async function getById(id: number): Promise<Row | undefined> {
  return memberRepository.getById(id)
}

/**
 * Create a new member.
 */
export async function create(data: {
  name: string
  email: string
  role: string
  discipline?: string
  engagement?: string
}): Promise<{ id: number }> {
  // Validation
  if (!data.name || !data.name.trim()) {
    throw new Error('Member name is required')
  }
  if (!data.email || !data.email.trim()) {
    throw new Error('Member email is required')
  }

  const id = await memberRepository.create({
    name: data.name,
    email: data.email,
    role: data.role,
    discipline: data.discipline,
    engagement: data.engagement,
  })

  await broadcast({
    entity: 'member',
    action: 'create',
  })

  return { id }
}

/**
 * Update a member.
 */
export async function update(
  id: number,
  data: {
    name?: string
    email?: string
    role?: string
    discipline?: string
    engagement?: string
  }
): Promise<{ id: number }> {
  // Verify exists
  const existing = await memberRepository.getById(id)
  if (!existing) {
    throw new Error(`Member ${id} not found`)
  }

  await memberRepository.update(id, data)
  await invalidateAuthCacheForMember(id)

  await broadcast({
    entity: 'member',
    action: 'update',
  })


  return { id }
}

/**
 * Update member skills.
 */
export async function updateSkills(id: number, skills: unknown): Promise<{ id: number }> {
  // Verify exists
  const existing = await memberRepository.getById(id)
  if (!existing) {
    throw new Error(`Member ${id} not found`)
  }

  await memberRepository.updateSkills(id, skills)

  await broadcast({
    entity: 'member',
    action: 'update',
  })

  return { id }
}

/**
 * Set member active/inactive.
 */
export async function setActive(id: number, active: boolean): Promise<{ id: number }> {
  // Verify exists
  const existing = await memberRepository.getById(id)
  if (!existing) {
    throw new Error(`Member ${id} not found`)
  }

  await memberRepository.setActive(id, active)
  await invalidateAuthCacheForMember(id)

  await broadcast({

    entity: 'member',
    action: 'update',
  })

  return { id }
}

/**
 * Delete a member.
 */
export async function delete_(id: number): Promise<{ id: number }> {
  // Verify exists
  const existing = await memberRepository.getById(id)
  if (!existing) {
    throw new Error(`Member ${id} not found`)
  }

  await invalidateAuthCacheForMember(id)
  await memberRepository.delete_(id)

  await broadcast({
    entity: 'member',
    action: 'delete',
  })

  return { id }
}

