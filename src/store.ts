/**
 * Server-side data operations. These mirror the desktop app's database.ts
 * function-for-function and RETURN THE SAME FLAT ROW SHAPES, so the existing
 * renderer needs no changes. Backed by Prisma/Postgres.
 */
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { ITEM_DELEGATES, isItemType, flattenItem, toItemColumns, fmtDate } from './tables'

type Row = Record<string, unknown>

// ── flatteners ────────────────────────────────────────────────────────────────

function flatProject(p: {
  id: number; name: string; client: string; location: string; discipline: string
  quotedHours: number; startDate?: string; endDate?: string; archived?: boolean; createdAt: Date; updatedAt: Date; createdBy: string; updatedBy: string; version: number
}): Row {
  return {
    id: p.id, name: p.name, client: p.client, location: p.location, discipline: p.discipline,
    quoted_hours: p.quotedHours, start_date: p.startDate ?? '', end_date: p.endDate ?? '', archived: p.archived ?? false,
    created_at: fmtDate(p.createdAt), updated_at: fmtDate(p.updatedAt),
    created_by: p.createdBy, updated_by: p.updatedBy, version: p.version
  }
}

function flatMember(m: { id: number; name: string; email: string; role: string; discipline?: string; skills?: unknown; status?: string; leftDate?: string; createdAt: Date }): Row {
  return {
    id: m.id, name: m.name, email: m.email, role: m.role, discipline: m.discipline ?? '',
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

export async function getSettings(): Promise<Row> {
  const row = await prisma.appSetting.findUnique({ where: { id: 1 } })
  const data = (row?.data ?? {}) as Row
  const smtp = { ...DEFAULT_SMTP, ...((data.smtp as Row) ?? {}) }
  return { current_member_id: (data.current_member_id as number) ?? null, smtp }
}

export async function updateSettings(patch: Row): Promise<Row> {
  const existing = await prisma.appSetting.findUnique({ where: { id: 1 } })
  const cur = (existing?.data ?? {}) as Row
  const curSmtp = (cur.smtp as Row) ?? {}
  const next = { ...cur, ...patch, smtp: { ...curSmtp, ...((patch.smtp as Row) ?? {}) } } as Prisma.InputJsonValue
  await prisma.appSetting.upsert({ where: { id: 1 }, create: { id: 1, data: next }, update: { data: next } })
  return getSettings()
}

// ── Members ───────────────────────────────────────────────────────────────────

export async function membersGetAll(): Promise<Row[]> {
  return (await prisma.member.findMany({ orderBy: { id: 'asc' } })).map(flatMember)
}
export async function memberCreate(name: string, email: string, role: string, discipline = ''): Promise<number> {
  const m = await prisma.member.create({ data: { name, email: email || '', role: role || 'Employee', discipline: discipline || '' } })
  return m.id
}
export async function memberUpdate(id: number, name: string, email: string, role: string, discipline = ''): Promise<void> {
  await prisma.member.update({ where: { id }, data: { name, email: email || '', role: role || 'Employee', discipline: discipline || '' } })
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
  const ps = await prisma.project.findMany({ orderBy: { id: 'desc' } })
  return ps.map(flatProject)
}
export async function projectById(id: number): Promise<Row | undefined> {
  const p = await prisma.project.findUnique({ where: { id } })
  return p ? flatProject(p) : undefined
}
export async function projectCreate(
  name: string, client: string, location: string, discipline: string, quotedHours: string, startDate = '', endDate = '', actor = ''
): Promise<number> {
  const p = await prisma.project.create({
    data: {
      name, client, location, discipline: discipline || '',
      quotedHours: parseFloat(quotedHours) || 0, startDate: startDate || '', endDate: endDate || '',
      createdBy: actor, updatedBy: actor
    }
  })
  return p.id
}
export async function projectUpdate(
  id: number, name: string, client: string, location: string, discipline: string, quotedHours: string, startDate = '', endDate = '', actor = ''
): Promise<void> {
  await prisma.project.update({
    where: { id },
    data: {
      name, client, location, discipline: discipline || '',
      quotedHours: parseFloat(quotedHours) || 0, startDate: startDate || '', endDate: endDate || '',
      updatedBy: actor, version: { increment: 1 }
    }
  })
}
export async function projectDelete(id: number): Promise<void> {
  await prisma.project.delete({ where: { id } }) // items + status + project_members cascade
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
