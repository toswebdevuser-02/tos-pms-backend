/**
 * Server-side data operations. These mirror the desktop app's database.ts
 * function-for-function and RETURN THE SAME FLAT ROW SHAPES, so the existing
 * renderer needs no changes. Backed by Prisma/Postgres.
 */
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { ITEM_DELEGATES, isItemType, flattenItem, toItemColumns, fmtDate } from './tables'
import { rankOf } from './auth'

type Row = Record<string, unknown>

// ── flatteners ────────────────────────────────────────────────────────────────

function flatProject(p: {
  id: number; name: string; client: string; location: string; discipline: string; type?: string
  quotedHours: number; startDate?: string; endDate?: string; archived?: boolean; deletedAt?: Date | null; clientId?: number | null; createdAt: Date; updatedAt: Date; createdBy: string; updatedBy: string; version: number
}): Row {
  return {
    id: p.id, name: p.name, client: p.client, location: p.location, discipline: p.discipline, type: p.type ?? '',
    quoted_hours: p.quotedHours, start_date: p.startDate ?? '', end_date: p.endDate ?? '', archived: p.archived ?? false,
    deleted_at: p.deletedAt ? fmtDate(p.deletedAt) : '', client_id: p.clientId ?? null,
    created_at: fmtDate(p.createdAt), updated_at: fmtDate(p.updatedAt),
    created_by: p.createdBy, updated_by: p.updatedBy, version: p.version
  }
}

// ── Clients ───────────────────────────────────────────────────────────────────
function flatClient(c: {
  id: number; code: string; name: string; company?: string; contact: string; email: string; phone: string
  createdAt: Date; updatedAt: Date; createdBy: string; updatedBy: string; version: number
}): Row {
  return {
    id: c.id, code: c.code, name: c.name, company: c.company ?? '', contact: c.contact, email: c.email, phone: c.phone,
    created_at: fmtDate(c.createdAt), updated_at: fmtDate(c.updatedAt),
    created_by: c.createdBy, updated_by: c.updatedBy, version: c.version
  }
}
export async function clientsGetAll(): Promise<Row[]> {
  return (await prisma.client.findMany({ orderBy: { name: 'asc' } })).map(flatClient)
}
export async function clientById(id: number): Promise<Row | undefined> {
  const c = await prisma.client.findUnique({ where: { id } })
  return c ? flatClient(c) : undefined
}
// Next sequential code CL-0001 (gap-tolerant: max existing + 1).
export async function nextClientCode(): Promise<string> {
  const rows = await prisma.client.findMany({ select: { code: true } })
  let max = 0
  for (const r of rows) { const m = String(r.code).match(/(\d+)\s*$/); if (m) max = Math.max(max, parseInt(m[1], 10)) }
  return `CL-${String(max + 1).padStart(4, '0')}`
}
export async function clientCreate(fields: { name: string; company?: string }, actor = ''): Promise<number> {
  const name = String(fields.name ?? '').trim()
  if (!name) throw new Error('Client name is required')
  const code = await nextClientCode()
  const c = await prisma.client.create({
    data: { code, name, company: String(fields.company ?? ''), createdBy: actor, updatedBy: actor }
  })
  return c.id
}
export async function clientUpdate(id: number, fields: { name: string; company?: string }, actor = ''): Promise<void> {
  const name = String(fields.name ?? '').trim()
  if (!name) throw new Error('Client name is required')
  await prisma.client.update({
    where: { id },
    data: { name, company: String(fields.company ?? ''), updatedBy: actor, version: { increment: 1 } }
  })
  // Keep the denormalized project.client name in step so existing views/grouping stay correct.
  await prisma.project.updateMany({ where: { clientId: id }, data: { client: name } })
}
export async function clientDelete(id: number): Promise<void> {
  // Projects keep their text name; the FK is set null (see schema onDelete: SetNull).
  await prisma.client.delete({ where: { id } })
}

function flatMember(m: { id: number; name: string; email: string; role: string; discipline?: string; engagement?: string; skills?: unknown; status?: string; leftDate?: string; createdAt: Date }): Row {
  return {
    id: m.id, name: m.name, email: m.email, role: m.role, discipline: m.discipline ?? '', engagement: m.engagement ?? '',
    skills: Array.isArray(m.skills) ? m.skills : [], status: m.status ?? 'active', left_date: m.leftDate ?? '',
    created_at: fmtDate(m.createdAt)
  }
}

function flatStatus(s: {
  id: number; projectId: number; overall: string; notes: string; lastUpdated: Date
  createdBy: string; updatedBy: string; version: number
}): Row {
  return {
    id: s.id, project_id: s.projectId, overall: s.overall, notes: s.notes,
    last_updated: fmtDate(s.lastUpdated), created_by: s.createdBy, updated_by: s.updatedBy, version: s.version
  }
}

function flatAttachment(a: {
  id: number; entityType: string; entityId: number; filename: string; storedPath: string
  description: string; response: string; importance: string; createdAt: Date
}): Row {
  return {
    id: a.id, entity_type: a.entityType, entity_id: a.entityId, filename: a.filename,
    stored_path: a.storedPath, description: a.description, response: a.response,
    importance: a.importance, created_at: fmtDate(a.createdAt)
  }
}

function delegateFor(type: string) {
  if (!isItemType(type)) throw new Error(`Unknown item type: ${type}`)
  return ITEM_DELEGATES[type]
}

// ── Settings ──────────────────────────────────────────────────────────────────

const DEFAULT_SMTP = { host: '', port: 587, secure: false, user: '', pass: '', from: '' }
const DEFAULT_DIGEST = { enabled: false, frequency: 'weekly', dayOfWeek: 1, hour: 8, recipients: [], lastSent: '' }

export async function getSettings(): Promise<Row> {
  const row = await prisma.appSetting.findUnique({ where: { id: 1 } })
  const data = (row?.data ?? {}) as Row
  const smtp = { ...DEFAULT_SMTP, ...((data.smtp as Row) ?? {}) }
  const digest = { ...DEFAULT_DIGEST, ...((data.digest as Row) ?? {}) }
  return { current_member_id: (data.current_member_id as number) ?? null, smtp, digest }
}

export async function updateSettings(patch: Row): Promise<Row> {
  const existing = await prisma.appSetting.findUnique({ where: { id: 1 } })
  const cur = (existing?.data ?? {}) as Row
  const curSmtp = (cur.smtp as Row) ?? {}
  const curDigest = (cur.digest as Row) ?? {}
  const next = {
    ...cur, ...patch,
    smtp: { ...curSmtp, ...((patch.smtp as Row) ?? {}) },
    digest: { ...curDigest, ...((patch.digest as Row) ?? {}) }
  } as Prisma.InputJsonValue
  await prisma.appSetting.upsert({ where: { id: 1 }, create: { id: 1, data: next }, update: { data: next } })
  return getSettings()
}

// ── Members ───────────────────────────────────────────────────────────────────

export async function membersGetAll(): Promise<Row[]> {
  return (await prisma.member.findMany({ orderBy: { id: 'asc' } })).map(flatMember)
}
export async function memberCreate(name: string, email: string, role: string, discipline = '', engagement = ''): Promise<number> {
  const m = await prisma.member.create({ data: { name, email: email || '', role: role || 'Employee', discipline: discipline || '', engagement: engagement || '' } })
  return m.id
}
export async function memberUpdate(id: number, name: string, email: string, role: string, discipline = '', engagement = ''): Promise<void> {
  await prisma.member.update({ where: { id }, data: { name, email: email || '', role: role || 'Employee', discipline: discipline || '', engagement: engagement || '' } })
}
export async function memberUpdateSkills(id: number, skills: unknown): Promise<void> {
  const data = (Array.isArray(skills) ? skills : []) as Prisma.InputJsonValue
  await prisma.member.update({ where: { id }, data: { skills: data } })
}
export async function memberSetActive(id: number, active: boolean): Promise<void> {
  await prisma.member.update({
    where: { id },
    data: { status: active ? 'active' : 'left', leftDate: active ? '' : new Date().toISOString().slice(0, 10) }
  })
}
export async function memberDelete(id: number): Promise<void> {
  await prisma.member.delete({ where: { id } }) // project_members cascade via FK
}
export async function memberById(id: number): Promise<Row | undefined> {
  const m = await prisma.member.findUnique({ where: { id } })
  return m ? flatMember(m) : undefined
}

// ── Overtime requests ─────────────────────────────────────────────────────────
function flatOvertime(o: { id: number; memberId: number; date: string; hours: number; status: string; reason: string; requestedAt: Date; decidedBy: string }): Row {
  return {
    id: o.id, member_id: o.memberId, date: o.date, hours: o.hours, status: o.status,
    reason: o.reason, requested_at: fmtDate(o.requestedAt), decided_by: o.decidedBy
  }
}
export async function overtimeAll(): Promise<Row[]> {
  return (await prisma.overtimeRequest.findMany({ orderBy: { id: 'desc' } })).map(flatOvertime)
}
export async function overtimeForMember(memberId: number): Promise<Row[]> {
  return (await prisma.overtimeRequest.findMany({ where: { memberId }, orderBy: { id: 'desc' } })).map(flatOvertime)
}
export async function overtimeById(id: number): Promise<Row | undefined> {
  const o = await prisma.overtimeRequest.findUnique({ where: { id } })
  return o ? flatOvertime(o) : undefined
}
export async function overtimeCreate(memberId: number, date: string, hours: number, reason = ''): Promise<number> {
  const o = await prisma.overtimeRequest.create({ data: { memberId, date, hours: hours || 0, reason: reason || '', status: 'pending' } })
  return o.id
}
export async function overtimeDecide(id: number, status: string, decidedBy: string): Promise<void> {
  await prisma.overtimeRequest.update({ where: { id }, data: { status, decidedBy } })
}
// Pure two-stage approval transition. Stage 1: a Project/Team Lead approves a
// 'pending' request → 'lead_approved'. Stage 2: a Manager+ approves → 'approved'
// (only then do the hours reflect). Either stage may reject. Returns the next
// status + the approver tag, or an error when the actor's rank is too low / the
// request is already decided.
export function overtimeTransition(status: string, decision: string, rank: number):
  { next: string; tag: 'lead' | 'mgr' | 'reject' } | { error: string } {
  const LEAD = rankOf('Project Lead'), MGR = rankOf('Manager')
  if (decision === 'reject') {
    if (status === 'pending') { if (rank < LEAD) return { error: 'Requires Project Lead or above' } }
    else if (status === 'lead_approved') { if (rank < MGR) return { error: 'Requires Manager or above' } }
    else return { error: 'This request has already been decided' }
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

// ── Project ↔ Member ──────────────────────────────────────────────────────────

export async function projectMembersGet(projectId: number): Promise<Row[]> {
  const links = await prisma.projectMember.findMany({ where: { projectId }, include: { member: true } })
  return links.map((l) => flatMember(l.member))
}
export async function projectMembersAll(): Promise<Row[]> {
  const links = await prisma.projectMember.findMany()
  return links.map((l) => ({ id: l.id, project_id: l.projectId, member_id: l.memberId }))
}
export async function projectMemberAssign(projectId: number, memberId: number): Promise<void> {
  await prisma.projectMember.upsert({
    where: { projectId_memberId: { projectId, memberId } },
    create: { projectId, memberId },
    update: {}
  })
}
export async function projectMemberUnassign(projectId: number, memberId: number): Promise<void> {
  await prisma.projectMember.deleteMany({ where: { projectId, memberId } })
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function projectsGetAll(): Promise<Row[]> {
  // Active projects only — soft-deleted ones live in the recycle bin.
  const ps = await prisma.project.findMany({ where: { deletedAt: null }, orderBy: { id: 'desc' } })
  return ps.map(flatProject)
}
export async function projectsDeleted(): Promise<Row[]> {
  const ps = await prisma.project.findMany({ where: { deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' } })
  return ps.map(flatProject)
}
export async function projectById(id: number): Promise<Row | undefined> {
  const p = await prisma.project.findUnique({ where: { id } })
  return p ? flatProject(p) : undefined
}
export async function projectCreate(
  name: string, client: string, location: string, discipline: string, quotedHours: string, startDate = '', endDate = '', actor = '', type = '', clientId?: number | null
): Promise<number> {
  const p = await prisma.project.create({
    data: {
      name, client, location, discipline: discipline || '', type: type || '',
      quotedHours: parseFloat(quotedHours) || 0, startDate: startDate || '', endDate: endDate || '',
      clientId: clientId ?? null,
      createdBy: actor, updatedBy: actor
    }
  })
  return p.id
}
export async function projectUpdate(
  id: number, name: string, client: string, location: string, discipline: string, quotedHours: string, startDate = '', endDate = '', actor = '', type = '', clientId?: number | null
): Promise<void> {
  await prisma.project.update({
    where: { id },
    data: {
      name, client, location, discipline: discipline || '', type: type || '',
      quotedHours: parseFloat(quotedHours) || 0, startDate: startDate || '', endDate: endDate || '',
      // Only touch the client link when explicitly provided (preserve it on edits that omit it).
      ...(clientId !== undefined ? { clientId } : {}),
      updatedBy: actor, version: { increment: 1 }
    }
  })
}
// Soft delete → recycle bin (restorable for 15 days). Also decouples any quote
// that created this project so it reads "unapproved" and can be re-approved.
export async function projectSoftDelete(id: number, actor = ''): Promise<void> {
  await prisma.project.update({ where: { id }, data: { deletedAt: new Date(), updatedBy: actor, version: { increment: 1 } } })
  await unlinkQuotesForProject(id)
}
export async function projectRestore(id: number, actor = ''): Promise<void> {
  await prisma.project.update({ where: { id }, data: { deletedAt: null, updatedBy: actor, version: { increment: 1 } } })
}
export async function projectPurge(id: number): Promise<void> {
  await prisma.project.delete({ where: { id } }) // items + status + project_members cascade
}
// Permanently remove projects that have been in the recycle bin longer than `days`.
export async function projectsPurgeExpired(days = 15): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const res = await prisma.project.deleteMany({ where: { deletedAt: { not: null, lt: cutoff } } })
  return res.count
}
// Backwards-compatible alias.
export async function projectDelete(id: number): Promise<void> { await projectSoftDelete(id) }

// Quotes that point at a project (data.project_id) → clear the link + approval.
async function unlinkQuotesForProject(projectId: number): Promise<void> {
  const quotes = await prisma.quote.findMany()
  for (const q of quotes) {
    const data = (q.data ?? {}) as Row
    if (Number(data.project_id) === projectId) {
      const { project_id, approved, ...rest } = data
      void project_id; void approved
      await prisma.quote.update({ where: { id: q.id }, data: { data: rest as Prisma.InputJsonValue } })
    }
  }
}
export async function projectSetArchived(id: number, archived: boolean, actor = ''): Promise<void> {
  await prisma.project.update({
    where: { id },
    data: { archived, updatedBy: actor, version: { increment: 1 } }
  })
}

// ── Items (rfi/query/dispatch/wip/qc/timesheet/task/standard/scope/meeting/input + status) ──

export async function itemsGetByProject(projectId: number, type: string): Promise<Row[]> {
  if (type === 'status') {
    const rows = await prisma.projectStatus.findMany({ where: { projectId } })
    return rows.map(flatStatus)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (delegateFor(type) as any).findMany({ where: { projectId }, orderBy: { id: 'asc' } })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => flattenItem(r))
}

export async function itemCreate(type: string, fields: Row, actor = ''): Promise<number> {
  if (type === 'status') {
    const projectId = Number(fields.project_id)
    const s = await prisma.projectStatus.upsert({
      where: { projectId },
      create: { projectId, overall: String(fields.overall ?? ''), notes: String(fields.notes ?? ''), createdBy: actor, updatedBy: actor },
      update: { overall: String(fields.overall ?? ''), notes: String(fields.notes ?? ''), updatedBy: actor, lastUpdated: new Date(), version: { increment: 1 } }
    })
    return s.id
  }
  const { projectId, data } = toItemColumns(fields)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const created = await (delegateFor(type) as any).create({ data: { projectId, data, createdBy: actor, updatedBy: actor } })
  return created.id
}

export async function itemUpdate(type: string, id: number, fields: Row, actor = ''): Promise<void> {
  if (type === 'status') {
    await prisma.projectStatus.update({
      where: { id },
      data: { overall: String(fields.overall ?? ''), notes: String(fields.notes ?? ''), updatedBy: actor, lastUpdated: new Date(), version: { increment: 1 } }
    })
    return
  }
  const { data } = toItemColumns(fields)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (delegateFor(type) as any).update({ where: { id }, data: { data, updatedBy: actor, version: { increment: 1 } } })
}

export async function itemDelete(type: string, id: number): Promise<void> {
  if (type === 'status') {
    await prisma.projectStatus.delete({ where: { id } })
    return
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (delegateFor(type) as any).delete({ where: { id } })
  await prisma.attachment.deleteMany({ where: { entityType: type, entityId: id } })
}

export async function statusesGetAll(): Promise<Row[]> {
  return (await prisma.projectStatus.findMany()).map(flatStatus)
}

// ── Quotes (standalone quotations) ────────────────────────────────────────────

function flatQuote(q: { id: number; data: unknown; createdAt: Date; updatedAt: Date; createdBy: string; updatedBy: string; version: number }): Row {
  const data = (q.data ?? {}) as Row
  return {
    ...data, id: q.id,
    created_at: fmtDate(q.createdAt), updated_at: fmtDate(q.updatedAt),
    created_by: q.createdBy, updated_by: q.updatedBy, version: q.version
  }
}
export async function quotesGetAll(): Promise<Row[]> {
  return (await prisma.quote.findMany({ orderBy: { id: 'desc' } })).map(flatQuote)
}
export async function quoteCreate(fields: Row, actor = ''): Promise<number> {
  const { id, created_at, updated_at, created_by, updated_by, version, ...data } = fields
  void id; void created_at; void updated_at; void created_by; void updated_by; void version
  const q = await prisma.quote.create({ data: { data: data as Prisma.InputJsonValue, createdBy: actor, updatedBy: actor } })
  return q.id
}
export async function quoteUpdate(id: number, fields: Row, actor = ''): Promise<void> {
  const { id: _id, created_at, updated_at, created_by, updated_by, version, ...data } = fields
  void _id; void created_at; void updated_at; void created_by; void updated_by; void version
  await prisma.quote.update({ where: { id }, data: { data: data as Prisma.InputJsonValue, updatedBy: actor, version: { increment: 1 } } })
}
export async function quoteDelete(id: number): Promise<void> {
  await prisma.quote.delete({ where: { id } })
}

// ── Cross-cutting reads (reminders engine) ────────────────────────────────────

export async function allOpenWip(): Promise<Row[]> {
  return (await prisma.wipTask.findMany()).map(flattenItem)
}
export async function allDispatches(): Promise<Row[]> {
  return (await prisma.dispatch.findMany()).map(flattenItem)
}
export async function allTasks(): Promise<Row[]> {
  return (await prisma.task.findMany()).map(flattenItem)
}
export async function allTimesheets(): Promise<Row[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await (delegateFor('timesheet') as any).findMany()).map(flattenItem)
}
export async function allQc(): Promise<Row[]> {
  return (await prisma.qcItem.findMany()).map(flattenItem)
}
export async function allRfis(): Promise<Row[]> {
  return (await prisma.rfi.findMany()).map(flattenItem)
}

// ── Attachments (records; file bytes handled in Phase 5) ──────────────────────

export async function attachmentsGet(entityType: string, entityId: number): Promise<Row[]> {
  return (await prisma.attachment.findMany({ where: { entityType, entityId } })).map(flatAttachment)
}
export async function attachmentsGetMany(entityType: string, ids: number[]): Promise<Row[]> {
  return (await prisma.attachment.findMany({ where: { entityType, entityId: { in: ids } } })).map(flatAttachment)
}
export async function attachmentGet(id: number): Promise<Row | undefined> {
  const a = await prisma.attachment.findUnique({ where: { id } })
  return a ? flatAttachment(a) : undefined
}
export async function attachmentAdd(entityType: string, entityId: number, filename: string, storedPath: string): Promise<Row> {
  const a = await prisma.attachment.create({ data: { entityType, entityId, filename, storedPath } })
  return flatAttachment(a)
}
export async function attachmentUpdateDescription(id: number, description: string): Promise<void> {
  await prisma.attachment.update({ where: { id }, data: { description } })
}
export async function attachmentUpdate(id: number, patch: Row): Promise<void> {
  const data: Row = {}
  for (const k of ['description', 'response', 'importance', 'filename', 'stored_path'] as const) {
    if (patch[k] !== undefined) data[k === 'stored_path' ? 'storedPath' : k] = patch[k]
  }
  await prisma.attachment.update({ where: { id }, data })
}
export async function attachmentDelete(id: number): Promise<Row | undefined> {
  const a = await prisma.attachment.findUnique({ where: { id } })
  if (!a) return undefined
  await prisma.attachment.delete({ where: { id } })
  return flatAttachment(a)
}
