/**
 * REST routes mirroring the desktop app's window.api / IPC channels.
 * Every response uses the same { ok, data, error } envelope the renderer expects.
 *
 * Authorization is enforced HERE on the server (the renderer's role checks are
 * now just UX). Identity for created_by/updated_by comes from the JWT (req.user),
 * never from the client.
 */
import { Router, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import * as store from './store'
import { prisma } from './prisma'
import { env } from './env'
import { requireRole, rankOf } from './auth'
import { ITEM_DELEGATES, isItemType } from './tables'
import { broadcast, ChangeEvent } from './ws'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

// Resolve a stored_path safely under STORAGE_DIR (block traversal / absolute paths).
function safeStoragePath(rel: string): string | null {
  const abs = path.resolve(env.storageDir, rel)
  return abs.startsWith(path.resolve(env.storageDir)) ? abs : null
}

// Run the op, broadcast a real-time change event on success, then respond.
function send(res: Response, fn: () => Promise<unknown>, event?: ChangeEvent | ((data: unknown) => ChangeEvent)): void {
  fn()
    .then((data) => {
      if (event) broadcast(typeof event === 'function' ? event(data) : event)
      res.json({ ok: true, data })
    })
    .catch((e) => res.status(400).json({ ok: false, error: String(e?.message ?? e) }))
}

// Resolve the owning projectId of an item row (for targeting refreshes).
async function itemProjectId(type: string, id: number): Promise<number | undefined> {
  if (type === 'status') return (await prisma.projectStatus.findUnique({ where: { id }, select: { projectId: true } }))?.projectId
  if (!isItemType(type)) return undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (ITEM_DELEGATES[type] as any).findUnique({ where: { id }, select: { projectId: true } })
  return row?.projectId
}
const itemEntity = (type: string): ChangeEvent['entity'] => (type === 'status' ? 'status' : 'item')

// Project writes: Manager+ required; Managers are scoped to their own discipline,
// Company Admin may act on any project.
async function projectGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const r = rankOf(req.user?.role ?? '')
  if (r < rankOf('Manager')) { res.status(403).json({ ok: false, error: 'Requires Manager role' }); return }
  if (r >= rankOf('Company Admin')) { next(); return }
  try {
    const me = req.user?.mid ? await prisma.member.findUnique({ where: { id: req.user.mid } }) : null
    const myDisc = me?.discipline ?? ''
    let targetDisc = ''
    if (req.method === 'POST') targetDisc = String(req.body.discipline ?? '')
    else {
      const p = await prisma.project.findUnique({ where: { id: int(req.params.id) }, select: { discipline: true } })
      targetDisc = p?.discipline ?? ''
    }
    if (!myDisc || myDisc !== targetDisc) {
      res.status(403).json({ ok: false, error: 'Managers can only manage projects in their own discipline' })
      return
    }
    next()
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e) })
  }
}
// Actor name for audit stamping — from the verified token, not the client.
function actorOf(req: Request): string {
  return req.user?.name || req.user?.email || 'unknown'
}
const int = (v: unknown): number => parseInt(String(v), 10)
const isAdmin = (req: Request): boolean => rankOf(req.user?.role ?? '') >= rankOf('Admin')

// Load the JSONB data of an existing item row (for ownership checks).
async function itemData(type: string, id: number): Promise<Record<string, unknown> | undefined> {
  if (!isItemType(type)) return undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (ITEM_DELEGATES[type] as any).findUnique({ where: { id } })
  return row ? (row.data as Record<string, unknown>) : undefined
}

// Per-type authorization for item writes. Mirrors the app's UI rules:
// - standard/dispatch/wip : Admin+ for all writes
// - qc                    : Admin+ to create/delete; any member may update (result)
// - task                  : Admin+ to create/delete; assigned member (or admin) may update
// - timesheet             : a member may only write their OWN rows; admins any
// - rfi/query/scope/meeting/input/status : any authenticated user
async function itemWriteGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const type = String(req.params.type)
  const method = req.method
  const admin = isAdmin(req)
  const mid = req.user?.mid ?? null
  const deny = (msg: string): void => { res.status(403).json({ ok: false, error: msg }) }

  try {
    if (['standard', 'dispatch', 'wip', 'feedback', 'allocation'].includes(type)) {
      if (!admin) return deny('Only Team Leads, Managers and admins can modify this section')
      return next()
    }
    if (type === 'qc') {
      if ((method === 'POST' || method === 'DELETE') && !admin) return deny('Only admins can add or remove QC entries')
      return next()
    }
    if (type === 'task') {
      if ((method === 'POST' || method === 'DELETE') && !admin) return deny('Only admins can create or delete tasks')
      if (method === 'PUT' && !admin) {
        const data = await itemData('task', int(req.params.id))
        if (!data || String(data.assigned_member_id ?? '') !== String(mid ?? '')) {
          return deny('Only the assigned member can update this task')
        }
      }
      return next()
    }
    if (type === 'timesheet') {
      if (admin) return next()
      if (method === 'POST') {
        if (String(req.body.member_id ?? '') !== String(mid ?? '')) return deny('You can only log your own timesheet')
        return next()
      }
      const data = await itemData('timesheet', int(req.params.id))
      if (!data || String(data.member_id ?? '') !== String(mid ?? '')) return deny('You can only edit your own timesheet entries')
      return next()
    }
    // rfi, query, scope, meeting, input, status — any authenticated user
    return next()
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e) })
  }
}

export function buildRouter(): Router {
  const r = Router()

  // ── Projects (Company Admin manages) ──────────────────────────────────────--
  r.get('/projects', (_req, res) => send(res, () => store.projectsGetAll()))
  r.get('/projects/:id', (req, res) => send(res, () => store.projectById(int(req.params.id))))
  r.post('/projects', projectGuard, (req, res) => {
    const { name, client, location, discipline, quoted_hours, start_date, end_date } = req.body
    send(res, async () => ({ id: await store.projectCreate(name, client, location, discipline, String(quoted_hours ?? ''), String(start_date ?? ''), String(end_date ?? ''), actorOf(req)) }),
      (d) => ({ entity: 'project', action: 'create', projectId: (d as { id: number }).id }))
  })
  r.put('/projects/:id', projectGuard, (req, res) => {
    const { name, client, location, discipline, quoted_hours, start_date, end_date } = req.body
    send(res, async () => {
      await store.projectUpdate(int(req.params.id), name, client, location, discipline, String(quoted_hours ?? ''), String(start_date ?? ''), String(end_date ?? ''), actorOf(req))
      return { id: int(req.params.id) }
    }, { entity: 'project', action: 'update', projectId: int(req.params.id) })
  })
  r.put('/projects/:id/archived', projectGuard, (req, res) => {
    const archived = !!req.body.archived
    send(res, async () => {
      await store.projectSetArchived(int(req.params.id), archived, actorOf(req))
      return { id: int(req.params.id) }
    }, { entity: 'project', action: 'update', projectId: int(req.params.id) })
  })
  r.delete('/projects/:id', projectGuard, (req, res) => send(res, async () => { await store.projectDelete(int(req.params.id)); return { id: int(req.params.id) } },
    { entity: 'project', action: 'delete', projectId: int(req.params.id) }))

  r.get('/statuses', (_req, res) => send(res, () => store.statusesGetAll()))

  // ── Cross-cutting (reminders) ────────────────────────────────────────────────
  r.get('/all/wip', (_req, res) => send(res, () => store.allOpenWip()))
  r.get('/all/dispatches', (_req, res) => send(res, () => store.allDispatches()))
  r.get('/all/tasks', (_req, res) => send(res, () => store.allTasks()))

  // ── Items ─────────────────────────────────────────────────────────────────--
  r.get('/items/:type', (req, res) => send(res, () => store.itemsGetByProject(int(req.query.projectId), String(req.params.type))))
  r.post('/items/:type', itemWriteGuard, (req, res) => {
    const type = String(req.params.type)
    send(res, async () => ({ id: await store.itemCreate(type, req.body, actorOf(req)) }),
      { entity: itemEntity(type), action: 'create', type, projectId: int(req.body.project_id) })
  })
  r.put('/items/:type/:id', itemWriteGuard, (req, res) => {
    const type = String(req.params.type)
    send(res, async () => {
      await store.itemUpdate(type, int(req.params.id), req.body, actorOf(req))
      return { id: int(req.params.id) }
    }, { entity: itemEntity(type), action: 'update', type, projectId: int(req.body.project_id) })
  })
  r.delete('/items/:type/:id', itemWriteGuard, async (req, res) => {
    const type = String(req.params.type)
    const id = int(req.params.id)
    const projectId = await itemProjectId(type, id).catch(() => undefined)
    send(res, async () => { await store.itemDelete(type, id); return { id } },
      { entity: itemEntity(type), action: 'delete', type, projectId })
  })

  // ── Members (Company Admin manages) ──────────────────────────────────────────
  r.get('/members', (_req, res) => send(res, () => store.membersGetAll()))
  r.get('/members/:id', (req, res) => send(res, () => store.memberById(int(req.params.id))))
  r.post('/members', requireRole('Company Admin'), (req, res) => send(res, async () => { const id = await store.memberCreate(req.body.name, req.body.email, req.body.role, req.body.discipline); return { id } }, { entity: 'member', action: 'create' }))
  r.put('/members/:id', requireRole('Company Admin'), (req, res) => send(res, async () => { await store.memberUpdate(int(req.params.id), req.body.name, req.body.email, req.body.role, req.body.discipline); return { id: int(req.params.id) } }, { entity: 'member', action: 'update' }))
  r.delete('/members/:id', requireRole('Company Admin'), (req, res) => send(res, async () => { await store.memberDelete(int(req.params.id)); return { id: int(req.params.id) } }, { entity: 'member', action: 'delete' }))
  r.put('/members/:id/active', requireRole('Company Admin'), (req, res) => send(res, async () => { await store.memberSetActive(int(req.params.id), !!req.body.active); return { id: int(req.params.id) } }, { entity: 'member', action: 'update' }))
  // Skills: editable by the member themselves or a Company Admin.
  r.put('/members/:id/skills', (req, res) => {
    const id = int(req.params.id)
    const self = req.user?.mid === id
    if (!self && rankOf(req.user?.role ?? '') < rankOf('Company Admin')) {
      res.status(403).json({ ok: false, error: 'You can only edit your own skills' })
      return
    }
    send(res, async () => { await store.memberUpdateSkills(id, req.body.skills); return { id } }, { entity: 'member', action: 'update' })
  })

  // ── Project ↔ member (Company Admin assigns) ─────────────────────────────────
  r.get('/project-members', (_req, res) => send(res, () => store.projectMembersAll()))
  r.get('/project-members/:projectId', (req, res) => send(res, () => store.projectMembersGet(int(req.params.projectId))))
  r.post('/project-members', requireRole('Admin'), (req, res) => send(res, async () => { await store.projectMemberAssign(int(req.body.projectId), int(req.body.memberId)); return {} }, { entity: 'projectMember', action: 'create', projectId: int(req.body.projectId) }))
  r.delete('/project-members', requireRole('Company Admin'), (req, res) => send(res, async () => { await store.projectMemberUnassign(int(req.body.projectId), int(req.body.memberId)); return {} }, { entity: 'projectMember', action: 'delete', projectId: int(req.body.projectId) }))

  // ── Settings (Admin+ for shared SMTP etc.) ───────────────────────────────────
  r.get('/settings', (_req, res) => send(res, () => store.getSettings()))
  r.put('/settings', requireRole('Admin'), (req, res) => send(res, () => store.updateSettings(req.body)))

  // ── Attachments ──────────────────────────────────────────────────────────────
  r.get('/attachments/many', (req, res) => {
    const ids = String(req.query.ids ?? '').split(',').filter(Boolean).map((s) => int(s))
    send(res, () => store.attachmentsGetMany(String(req.query.entityType), ids))
  })
  // Serve raw file bytes by stored_path (for previews + Excel embedding). Must be
  // declared before '/attachments/:id' so "raw" isn't captured as an id.
  r.get('/attachments/raw', (req, res) => {
    const abs = safeStoragePath(String(req.query.path ?? ''))
    if (!abs) { res.status(400).json({ ok: false, error: 'bad path' }); return }
    if (!fs.existsSync(abs)) { res.status(404).json({ ok: false, error: 'file not found' }); return }
    res.sendFile(abs)
  })
  r.get('/attachments/:id', (req, res) => send(res, () => store.attachmentGet(int(req.params.id))))
  r.get('/attachments', (req, res) => send(res, () => store.attachmentsGet(String(req.query.entityType), int(req.query.entityId))))

  // Upload file bytes; store under STORAGE_DIR/<type>/<id>/ and create the record.
  r.post('/attachments/upload', upload.single('file'), async (req, res) => {
    try {
      const entityType = String(req.body.entityType)
      const entityId = int(req.body.entityId)
      const file = req.file
      if (!file) { res.status(400).json({ ok: false, error: 'no file' }); return }
      const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${file.originalname.replace(/[^\w.\-]/g, '_')}`
      const absDir = path.join(env.storageDir, entityType, String(entityId))
      fs.mkdirSync(absDir, { recursive: true })
      fs.writeFileSync(path.join(absDir, safeName), file.buffer)
      const storedPath = path.posix.join(entityType, String(entityId), safeName)
      const rec = await store.attachmentAdd(entityType, entityId, file.originalname, storedPath)
      const pid = await itemProjectId(entityType, entityId).catch(() => undefined)
      broadcast({ entity: 'attachment', action: 'create', type: entityType, projectId: pid })
      res.json({ ok: true, data: rec })
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e) })
    }
  })

  // Record-only create (legacy/local-path mode; remote clients use /upload).
  r.post('/attachments', async (req, res) => {
    const pid = await itemProjectId(String(req.body.entityType), int(req.body.entityId)).catch(() => undefined)
    send(res, () => store.attachmentAdd(req.body.entityType, int(req.body.entityId), req.body.filename, req.body.storedPath),
      { entity: 'attachment', action: 'create', type: String(req.body.entityType), projectId: pid })
  })
  r.put('/attachments/:id/description', async (req, res) => {
    const id = int(req.params.id)
    const att = await store.attachmentGet(id).catch(() => undefined)
    const pid = att ? await itemProjectId(String(att.entity_type), Number(att.entity_id)).catch(() => undefined) : undefined
    send(res, async () => { await store.attachmentUpdateDescription(id, req.body.description); return { id } },
      { entity: 'attachment', action: 'update', type: att ? String(att.entity_type) : undefined, projectId: pid })
  })
  r.put('/attachments/:id', async (req, res) => {
    const id = int(req.params.id)
    const att = await store.attachmentGet(id).catch(() => undefined)
    const pid = att ? await itemProjectId(String(att.entity_type), Number(att.entity_id)).catch(() => undefined) : undefined
    send(res, async () => { await store.attachmentUpdate(id, req.body.patch ?? req.body); return { id } },
      { entity: 'attachment', action: 'update', type: att ? String(att.entity_type) : undefined, projectId: pid })
  })
  r.delete('/attachments/:id', async (req, res) => {
    const id = int(req.params.id)
    const att = await store.attachmentGet(id).catch(() => undefined)
    const pid = att ? await itemProjectId(String(att.entity_type), Number(att.entity_id)).catch(() => undefined) : undefined
    send(res, async () => {
      const rec = await store.attachmentDelete(id)
      const abs = rec ? safeStoragePath(String(rec.stored_path)) : null
      if (abs && fs.existsSync(abs)) { try { fs.unlinkSync(abs) } catch { /* leave orphan */ } }
      return rec
    }, { entity: 'attachment', action: 'delete', type: att ? String(att.entity_type) : undefined, projectId: pid })
  })

  return r
}
