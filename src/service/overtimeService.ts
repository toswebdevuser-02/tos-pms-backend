/**
 * Overtime Service - Business logic for overtime requests.
 */

import * as overtimeRepository from '../repository/overtimeRepository'
import { rankOf } from '../auth'

interface Row {
  [key: string]: any
}

export async function getAll(): Promise<Row[]> {
  return overtimeRepository.getAll()
}

export async function getForMember(memberId: number): Promise<Row[]> {
  return overtimeRepository.getForMember(memberId)
}

export async function getById(id: number): Promise<Row | undefined> {
  return overtimeRepository.getById(id)
}

export async function create(memberId: number, date: string, hours: number, reason: string): Promise<number> {
  return overtimeRepository.create(memberId, date, hours, reason)
}

export async function decide(id: number, status: string, decidedBy: string): Promise<void> {
  await overtimeRepository.decide(id, status, decidedBy)
}

/**
 * Pure two-stage approval transition.
 * Stage 1: a Project/Team Lead approves a 'pending' request → 'lead_approved'.
 * Stage 2: a Manager+ approves → 'approved' (only then do the hours reflect).
 * Either stage may reject. Returns the next status + the approver tag,
 * or an error when the actor's rank is too low / the request is already decided.
 */
export function transition(
  status: string,
  decision: string,
  rank: number
): { next: string; tag: 'lead' | 'mgr' | 'reject' } | { error: string } {
  const LEAD = rankOf('Project Lead')
  const MGR = rankOf('Manager')

  if (decision === 'reject') {
    if (status === 'pending') {
      if (rank < LEAD) return { error: 'Requires Project Lead or above' }
    } else if (status === 'lead_approved') {
      if (rank < MGR) return { error: 'Requires Manager or above' }
    } else {
      return { error: 'This request has already been decided' }
    }
    return { next: 'rejected', tag: 'reject' }
  }

  if (decision === 'approve') {
    if (status === 'pending') {
      if (rank < LEAD) return { error: 'Requires Project Lead or above' }
      return { next: 'lead_approved', tag: 'lead' }
    }
    if (status === 'lead_approved') {
      if (rank < MGR) return { error: 'Requires Manager or above' }
      return { next: 'approved', tag: 'mgr' }
    }
    if (status === 'approved') return { error: 'This request has already been fully approved' }
    return { error: 'This request has already been decided' }
  }

  return { error: 'Invalid decision' }
}
