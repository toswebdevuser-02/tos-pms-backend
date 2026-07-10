/**
 * Project Member Repository - Handle project<->member assignments.
 */

import { prisma } from '../prisma'

interface Row {
  [key: string]: any
}

// Helper: flatten ProjectMember to Row
function flatProjectMember(pm: any): Row {
  return {
    project_id: pm.projectId,
    member_id: pm.memberId,
  }
}

/**
 * Get all project<->member assignments.
 */
export async function getAll(): Promise<Row[]> {
  const assignments = await prisma.projectMember.findMany()
  return assignments.map(flatProjectMember)
}

/**
 * Get all members assigned to a project.
 */
export async function getByProject(projectId: number): Promise<Row[]> {
  const assignments = await prisma.projectMember.findMany({
    where: { projectId },
  })
  return assignments.map(flatProjectMember)
}

/**
 * Assign a member to a project.
 */
export async function assign(projectId: number, memberId: number): Promise<void> {
  // Upsert: if already assigned, do nothing
  await prisma.projectMember.upsert({
    where: { projectId_memberId: { projectId, memberId } },
    create: { projectId, memberId },
    update: {}, // No-op if already exists
  })
}

/**
 * Unassign a member from a project.
 */
export async function unassign(projectId: number, memberId: number): Promise<void> {
  await prisma.projectMember.delete({
    where: { projectId_memberId: { projectId, memberId } },
  })
}
