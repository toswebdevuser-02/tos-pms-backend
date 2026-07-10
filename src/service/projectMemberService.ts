/**
 * Project Member Service - Business logic for project<->member assignments.
 */

import * as projectMemberRepository from '../repository/projectMemberRepository'
import * as memberRepository from '../repository/memberRepository'
import * as projectRepository from '../repository/projectRepository'
import { broadcast } from '../ws'

interface Row {
  [key: string]: any
}

/**
 * Get all project<->member assignments.
 */
export async function getAll(): Promise<Row[]> {
  return projectMemberRepository.getAll()
}

/**
 * Get members assigned to a project.
 */
export async function getByProject(projectId: number): Promise<Row[]> {
  return projectMemberRepository.getByProject(projectId)
}

/**
 * Assign a member to a project.
 */
export async function assign(projectId: number, memberId: number): Promise<void> {
  // Verify project and member exist
  const project = await projectRepository.getById(projectId)
  if (!project) {
    throw new Error(`Project ${projectId} not found`)
  }

  const member = await memberRepository.getById(memberId)
  if (!member) {
    throw new Error(`Member ${memberId} not found`)
  }

  await projectMemberRepository.assign(projectId, memberId)

  await broadcast({
    entity: 'projectMember',
    action: 'create',
    projectId,
  })
}


/**
 * Unassign a member from a project.
 */
export async function unassign(projectId: number, memberId: number): Promise<void> {
  await projectMemberRepository.unassign(projectId, memberId)

  await broadcast({
    entity: 'projectMember',
    action: 'delete',
    projectId,
  })
}

