/**
 * Member Repository - All Prisma queries for members.
 */

import { prisma } from '../prisma'

interface Row {
  [key: string]: any
}

// Helper: flatten Prisma member to Row
function flatMember(m: any): Row {
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    discipline: m.discipline,
    engagement: m.engagement,
    skills: m.skills,
    active: m.active,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
  }
}

/**
 * Get all members.
 */
export async function getAll(): Promise<Row[]> {
  const members = await prisma.member.findMany({
    orderBy: { name: 'asc' },
  })
  return members.map(flatMember)
}

/**
 * Get member by ID.
 */
export async function getById(id: number): Promise<Row | undefined> {
  const member = await prisma.member.findUnique({
    where: { id },
  })
  return member ? flatMember(member) : undefined
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
}): Promise<number> {
  const member = await prisma.member.create({
    data: {
      name: data.name,
      email: data.email,
      role: data.role,
      discipline: data.discipline || '',
      engagement: data.engagement || '',
    },
  })
  return member.id
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
): Promise<void> {
  const updateData: any = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.email !== undefined) updateData.email = data.email
  if (data.role !== undefined) updateData.role = data.role
  if (data.discipline !== undefined) updateData.discipline = data.discipline || ''
  if (data.engagement !== undefined) updateData.engagement = data.engagement || ''

  await prisma.member.update({
    where: { id },
    data: updateData,
  })
}

/**
 * Update member skills (JSONB field).
 */
export async function updateSkills(id: number, skills: unknown): Promise<void> {
  // Prisma expects JSON input type; cast is safe because `skills` is produced
  // by the app as plain JSON (arrays/objects/strings/numbers).
  await prisma.member.update({
    where: { id },
    data: { skills: skills as any },
  })
}



/**
 * Set member active/inactive status.
 */

export async function setActive(id: number, active: boolean): Promise<void> {
  await prisma.member.update({
    where: { id },
    data: { status: active ? 'active' : 'left' },
  })
}

/**
 * Delete a member (soft delete by inactivity or hard delete).
 */
export async function delete_(id: number): Promise<void> {
  // For now, hard delete. Could be changed to soft delete if needed.
  await prisma.member.delete({
    where: { id },
  })
}
