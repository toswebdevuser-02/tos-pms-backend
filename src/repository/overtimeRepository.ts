/**
 * Overtime Repository - Data access for overtime requests.
 */

import { prisma } from '../prisma'
import { fmtDate } from '../tables'

interface Row {
  [key: string]: any
}

function flatOvertime(o: { id: number; memberId: number; date: string; hours: number; status: string; reason: string; requestedAt: Date; decidedBy: string }): Row {
  return {
    id: o.id,
    member_id: o.memberId,
    date: o.date,
    hours: o.hours,
    status: o.status,
    reason: o.reason,
    requested_at: fmtDate(o.requestedAt),
    decided_by: o.decidedBy,
  }
}

export async function getAll(): Promise<Row[]> {
  const requests = await prisma.overtimeRequest.findMany({ orderBy: { id: 'desc' } })
  return requests.map(flatOvertime)
}

export async function getForMember(memberId: number): Promise<Row[]> {
  const requests = await prisma.overtimeRequest.findMany({ where: { memberId }, orderBy: { id: 'desc' } })
  return requests.map(flatOvertime)
}

export async function getById(id: number): Promise<Row | undefined> {
  const o = await prisma.overtimeRequest.findUnique({ where: { id } })
  return o ? flatOvertime(o) : undefined
}

export async function create(memberId: number, date: string, hours: number, reason: string): Promise<number> {
  const o = await prisma.overtimeRequest.create({
    data: {
      memberId,
      date,
      hours: hours || 0,
      reason: reason || '',
      status: 'pending',
    },
  })
  return o.id
}

export async function decide(id: number, status: string, decidedBy: string): Promise<void> {
  await prisma.overtimeRequest.update({
    where: { id },
    data: { status, decidedBy },
  })
}
