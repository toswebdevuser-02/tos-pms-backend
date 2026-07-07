"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRouter = buildRouter;
/**
 * REST routes mirroring the desktop app's window.api / IPC channels.
 * Every response uses the same { ok, data, error } envelope the renderer expects.
 *
 * Authorization is enforced HERE on the server (the renderer's role checks are
 * now just UX). Identity for created_by/updated_by comes from the JWT (req.user),
 * never from the client.
 */
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const store = __importStar(require("./store"));
const prisma_1 = require("./prisma");
const env_1 = require("./env");
const auth_1 = require("./auth");
const tables_1 = require("./tables");
const ws_1 = require("./ws");
const email_1 = require("./email");
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
// Resolve a stored_path safely under STORAGE_DIR (block traversal / absolute paths).
function safeStoragePath(rel) {
    const abs = path_1.default.resolve(env_1.env.storageDir, rel);
    return abs.startsWith(path_1.default.resolve(env_1.env.storageDir)) ? abs : null;
}
// Run the op, broadcast a real-time change event on success, then respond.
function send(res, fn, event) {
    fn()
        .then((data) => {
        if (event)
            (0, ws_1.broadcast)(typeof event === 'function' ? event(data) : event);
        res.json({ ok: true, data });
    })
        .catch((e) => res.status(400).json({ ok: false, error: String(e?.message ?? e) }));
}
// Resolve the owning projectId of an item row (for targeting refreshes).
async function itemProjectId(type, id) {
    if (type === 'status')
        return (await prisma_1.prisma.projectStatus.findUnique({ where: { id }, select: { projectId: true } }))?.projectId;
    if (!(0, tables_1.isItemType)(type))
        return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await tables_1.ITEM_DELEGATES[type].findUnique({ where: { id }, select: { projectId: true } });
    return row?.projectId;
}
const itemEntity = (type) => (type === 'status' ? 'status' : 'item');
// Project writes: Manager+ required; Managers are scoped to their own discipline,
// Company Admin may act on any project.
function projectGuard(req, res, next) {
    // Project Lead and above may create/edit/delete any project (no discipline restriction).
    const r = (0, auth_1.rankOf)(req.user?.role ?? '');
    if (r < (0, auth_1.rankOf)('Project Lead')) {
        res.status(403).json({ ok: false, error: 'Requires Project Lead role or above' });
        return;
    }
    next();
}
// Actor name for audit stamping — from the verified token, not the client.
function actorOf(req) {
    return req.user?.name || req.user?.email || 'unknown';
}
const int = (v) => parseInt(String(v), 10);
const isAdmin = (req) => (0, auth_1.rankOf)(req.user?.role ?? '') >= (0, auth_1.rankOf)('Admin');
// Load the JSONB data of an existing item row (for ownership checks).
async function itemData(type, id) {
    if (!(0, tables_1.isItemType)(type))
        return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await tables_1.ITEM_DELEGATES[type].findUnique({ where: { id } });
    return row ? row.data : undefined;
}
// Per-type authorization for item writes. Mirrors the app's UI rules:
// - standard/dispatch/wip/scope/meeting/input/status : Team Lead+ for all writes (project setup)
// - qc                    : Admin+ to create/delete; any member may update (result)
// - task                  : Admin+ to create/delete; assigned member (or admin) may update
// - timesheet             : a member may only write their OWN rows; admins any
// - rfi/query             : any authenticated user
async function itemWriteGuard(req, res, next) {
    const type = String(req.params.type);
    const method = req.method;
    const admin = isAdmin(req);
    const mid = req.user?.mid ?? null;
    const deny = (msg) => { res.status(403).json({ ok: false, error: msg }); };
    try {
        if (['standard', 'dispatch', 'wip', 'feedback', 'allocation', 'scope', 'meeting', 'input', 'status'].includes(type)) {
            if (!admin)
                return deny('Only Team Leads, Managers and admins can modify this section');
            return next();
        }
        if (type === 'qc') {
            if ((method === 'POST' || method === 'DELETE') && !admin)
                return deny('Only admins can add or remove QA/QC entries');
            return next();
        }
        if (type === 'task') {
            // Project Lead and above may create/delete/manage any task; an assignee may
            // update their own. (Matches the frontend isAdmin = Project Lead+ task tools.)
            const taskManager = (0, auth_1.rankOf)(req.user?.role ?? '') >= (0, auth_1.rankOf)('Project Lead');
            if ((method === 'POST' || method === 'DELETE') && !taskManager)
                return deny('Only Project Leads and above can create or delete tasks');
            if (method === 'PUT' && !taskManager) {
                const data = await itemData('task', int(req.params.id));
                if (!data || String(data.assigned_member_id ?? '') !== String(mid ?? '')) {
                    return deny('Only the assigned member can update this task');
                }
            }
            return next();
        }
        if (type === 'timesheet') {
            if (admin)
                return next();
            if (method === 'POST') {
                if (String(req.body.member_id ?? '') !== String(mid ?? ''))
                    return deny('You can only log your own timesheet');
                return next();
            }
            const data = await itemData('timesheet', int(req.params.id));
            if (!data || String(data.member_id ?? '') !== String(mid ?? ''))
                return deny('You can only edit your own timesheet entries');
            return next();
        }
        // rfi, query, scope, meeting, input, status — any authenticated user
        return next();
    }
    catch (e) {
        res.status(400).json({ ok: false, error: String(e) });
    }
}
function buildRouter() {
    const r = (0, express_1.Router)();
    // ── Projects (Company Admin manages) ──────────────────────────────────────--
    r.get('/projects', (_req, res) => send(res, () => store.projectsGetAll()));
    // Recycle bin — declared before '/projects/:id' so "deleted" isn't read as an id.
    r.get('/projects/deleted', projectGuard, (_req, res) => send(res, () => store.projectsDeleted()));
    r.get('/projects/:id', (req, res) => send(res, () => store.projectById(int(req.params.id))));
    r.post('/projects', projectGuard, (req, res) => {
        const { name, client, location, discipline, type, quoted_hours, start_date, end_date, client_id } = req.body;
        send(res, async () => {
            const id = await store.projectCreate(name, client, location, discipline, String(quoted_hours ?? ''), String(start_date ?? ''), String(end_date ?? ''), actorOf(req), String(type ?? ''), client_id == null ? null : Number(client_id));
            // Auto-assign the creator so scoped dashboards keep showing the project
            // even when their local discipline/profile data is incomplete.
            if (req.user?.mid) {
                try {
                    await store.projectMemberAssign(id, req.user.mid);
                }
                catch { /* non-fatal */ }
            }
            return { id };
        }, (d) => ({ entity: 'project', action: 'create', projectId: d.id }));
    });
    r.put('/projects/:id', projectGuard, (req, res) => {
        const { name, client, location, discipline, type, quoted_hours, start_date, end_date, client_id } = req.body;
        send(res, async () => {
            await store.projectUpdate(int(req.params.id), name, client, location, discipline, String(quoted_hours ?? ''), String(start_date ?? ''), String(end_date ?? ''), actorOf(req), String(type ?? ''), client_id === undefined ? undefined : (client_id == null ? null : Number(client_id)));
            return { id: int(req.params.id) };
        }, { entity: 'project', action: 'update', projectId: int(req.params.id) });
    });
    r.put('/projects/:id/archived', projectGuard, (req, res) => {
        const archived = !!req.body.archived;
        send(res, async () => {
            await store.projectSetArchived(int(req.params.id), archived, actorOf(req));
            return { id: int(req.params.id) };
        }, { entity: 'project', action: 'update', projectId: int(req.params.id) });
    });
    // Delete → recycle bin (soft delete; restorable for 15 days).
    r.delete('/projects/:id', projectGuard, (req, res) => send(res, async () => { await store.projectSoftDelete(int(req.params.id), actorOf(req)); return { id: int(req.params.id) }; }, { entity: 'project', action: 'delete', projectId: int(req.params.id) }));
    r.post('/projects/:id/restore', projectGuard, (req, res) => send(res, async () => { await store.projectRestore(int(req.params.id), actorOf(req)); return { id: int(req.params.id) }; }, { entity: 'project', action: 'update', projectId: int(req.params.id) }));
    // Permanent deletion (Company Admin only).
    r.delete('/projects/:id/purge', (0, auth_1.requireRole)('Company Admin'), (req, res) => send(res, async () => { await store.projectPurge(int(req.params.id)); return { id: int(req.params.id) }; }, { entity: 'project', action: 'delete', projectId: int(req.params.id) }));
    r.get('/statuses', (_req, res) => send(res, () => store.statusesGetAll()));
    // ── Cross-cutting (reminders) ────────────────────────────────────────────────
    r.get('/all/wip', (_req, res) => send(res, () => store.allOpenWip()));
    r.get('/all/dispatches', (_req, res) => send(res, () => store.allDispatches()));
    r.get('/all/tasks', (_req, res) => send(res, () => store.allTasks()));
    r.get('/all/timesheets', (_req, res) => send(res, () => store.allTimesheets()));
    r.get('/all/qc', (_req, res) => send(res, () => store.allQc()));
    r.get('/all/rfi', (_req, res) => send(res, () => store.allRfis()));
    // ── Items ─────────────────────────────────────────────────────────────────--
    r.get('/items/:type', (req, res) => send(res, () => store.itemsGetByProject(int(req.query.projectId), String(req.params.type))));
    r.post('/items/:type', itemWriteGuard, (req, res) => {
        const type = String(req.params.type);
        send(res, async () => ({ id: await store.itemCreate(type, req.body, actorOf(req)) }), { entity: itemEntity(type), action: 'create', type, projectId: int(req.body.project_id) });
    });
    r.put('/items/:type/:id', itemWriteGuard, (req, res) => {
        const type = String(req.params.type);
        send(res, async () => {
            await store.itemUpdate(type, int(req.params.id), req.body, actorOf(req));
            return { id: int(req.params.id) };
        }, { entity: itemEntity(type), action: 'update', type, projectId: int(req.body.project_id) });
    });
    r.delete('/items/:type/:id', itemWriteGuard, async (req, res) => {
        const type = String(req.params.type);
        const id = int(req.params.id);
        const projectId = await itemProjectId(type, id).catch(() => undefined);
        send(res, async () => { await store.itemDelete(type, id); return { id }; }, { entity: itemEntity(type), action: 'delete', type, projectId });
    });
    // ── Members (Company Admin manages) ──────────────────────────────────────────
    r.get('/members', (_req, res) => send(res, () => store.membersGetAll()));
    r.get('/members/:id', (req, res) => send(res, () => store.memberById(int(req.params.id))));
    r.post('/members', (0, auth_1.requireRole)('Company Admin'), (req, res) => send(res, async () => ({ id: await store.memberCreate(req.body.name, req.body.email, req.body.role, req.body.discipline, req.body.engagement) }), { entity: 'member', action: 'create' }));
    r.put('/members/:id', (0, auth_1.requireRole)('Company Admin'), (req, res) => send(res, async () => { await store.memberUpdate(int(req.params.id), req.body.name, req.body.email, req.body.role, req.body.discipline, req.body.engagement); return { id: int(req.params.id) }; }, { entity: 'member', action: 'update' }));
    r.delete('/members/:id', (0, auth_1.requireRole)('Company Admin'), (req, res) => send(res, async () => { await store.memberDelete(int(req.params.id)); return { id: int(req.params.id) }; }, { entity: 'member', action: 'delete' }));
    r.put('/members/:id/active', (0, auth_1.requireRole)('Company Admin'), (req, res) => send(res, async () => { await store.memberSetActive(int(req.params.id), !!req.body.active); return { id: int(req.params.id) }; }, { entity: 'member', action: 'update' }));
    // Skills: editable by the member themselves or a Company Admin.
    r.put('/members/:id/skills', (req, res) => {
        const id = int(req.params.id);
        const self = req.user?.mid === id;
        if (!self && (0, auth_1.rankOf)(req.user?.role ?? '') < (0, auth_1.rankOf)('Company Admin')) {
            res.status(403).json({ ok: false, error: 'You can only edit your own skills' });
            return;
        }
        send(res, async () => { await store.memberUpdateSkills(id, req.body.skills); return { id }; }, { entity: 'member', action: 'update' });
    });
    // ── Project ↔ member (Company Admin assigns) ─────────────────────────────────
    r.get('/project-members', (_req, res) => send(res, () => store.projectMembersAll()));
    r.get('/project-members/:projectId', (req, res) => send(res, () => store.projectMembersGet(int(req.params.projectId))));
    r.post('/project-members', (0, auth_1.requireRole)('Admin'), (req, res) => send(res, async () => { await store.projectMemberAssign(int(req.body.projectId), int(req.body.memberId)); return {}; }, { entity: 'projectMember', action: 'create', projectId: int(req.body.projectId) }));
    r.delete('/project-members', (0, auth_1.requireRole)('Admin'), (req, res) => send(res, async () => { await store.projectMemberUnassign(int(req.body.projectId), int(req.body.memberId)); return {}; }, { entity: 'projectMember', action: 'delete', projectId: int(req.body.projectId) }));
    // ── Overtime requests ────────────────────────────────────────────────────────
    // Team Lead+ see all (to approve); everyone else sees their own. Anyone may
    // request; only Team Lead+ may approve/reject.
    r.get('/overtime', (req, res) => send(res, async () => ((0, auth_1.rankOf)(req.user?.role ?? '') >= (0, auth_1.rankOf)('Admin') ? store.overtimeAll() : store.overtimeForMember(req.user?.mid ?? -1))));
    r.post('/overtime', (req, res) => send(res, async () => {
        const mid = req.user?.mid;
        if (!mid)
            throw new Error('Your account has no member profile');
        const id = await store.overtimeCreate(mid, String(req.body.date ?? ''), parseFloat(String(req.body.hours ?? '0')) || 0, String(req.body.reason ?? ''));
        return { id };
    }));
    // Two-stage approval. Stage 1: Project Lead/Team Lead approves a 'pending' request
    // → 'lead_approved'. Stage 2: a Manager+ approves that → 'approved' (only then do
    // the hours reflect). Either stage may reject. Rank is enforced per stage.
    r.put('/overtime/:id/decide', (req, res) => send(res, async () => {
        const id = int(req.params.id);
        const cur = await store.overtimeById(id);
        if (!cur)
            throw new Error('Overtime request not found');
        const status = String(cur.status ?? 'pending');
        const trail = String(cur.decided_by ?? '');
        const actor = actorOf(req);
        const t = store.overtimeTransition(status, String(req.body.decision ?? ''), (0, auth_1.rankOf)(req.user?.role ?? ''));
        if ('error' in t)
            throw new Error(t.error);
        const by = t.tag === 'lead' ? `Lead: ${actor}`
            : t.tag === 'mgr' ? `${trail ? trail + ' · ' : ''}Mgr: ${actor}`
                : `${trail ? trail + ' · ' : ''}Rejected by ${actor}`;
        await store.overtimeDecide(id, t.next, by);
        return { id };
    }));
    // ── Quotes (Team Lead+ create/manage standalone quotations) ──────────────────
    r.get('/quotes', (0, auth_1.requireRole)('Admin'), (_req, res) => send(res, () => store.quotesGetAll()));
    r.post('/quotes', (0, auth_1.requireRole)('Admin'), (req, res) => send(res, async () => ({ id: await store.quoteCreate(req.body, actorOf(req)) }), { entity: 'quote', action: 'create' }));
    r.put('/quotes/:id', (0, auth_1.requireRole)('Admin'), (req, res) => send(res, async () => { await store.quoteUpdate(int(req.params.id), req.body, actorOf(req)); return { id: int(req.params.id) }; }, { entity: 'quote', action: 'update' }));
    r.delete('/quotes/:id', (0, auth_1.requireRole)('Admin'), (req, res) => send(res, async () => { await store.quoteDelete(int(req.params.id)); return { id: int(req.params.id) }; }, { entity: 'quote', action: 'delete' }));
    // ── Clients (registry; any authed user reads/picks, Team Lead+ manages) ───────
    r.get('/clients', (_req, res) => send(res, () => store.clientsGetAll()));
    r.post('/clients', (0, auth_1.requireRole)('Admin'), (req, res) => send(res, async () => ({ id: await store.clientCreate(req.body, actorOf(req)) }), { entity: 'client', action: 'create' }));
    r.put('/clients/:id', (0, auth_1.requireRole)('Admin'), (req, res) => send(res, async () => { await store.clientUpdate(int(req.params.id), req.body, actorOf(req)); return { id: int(req.params.id) }; }, { entity: 'client', action: 'update' }));
    r.delete('/clients/:id', (0, auth_1.requireRole)('Admin'), (req, res) => send(res, async () => { await store.clientDelete(int(req.params.id)); return { id: int(req.params.id) }; }, { entity: 'client', action: 'delete' }));
    // ── Settings (Admin+ for shared SMTP etc.) ───────────────────────────────────
    r.get('/settings', (req, res) => send(res, async () => {
        const s = await store.getSettings();
        const smtp = (s.smtp ?? {});
        const digest = (s.digest ?? {});
        // Email/SMTP + digest config is Company-Admin-only. Non-admins get just what
        // the app needs (current member) with the mail config hidden. The SMTP
        // password is never returned to anyone (only whether one is set).
        if ((0, auth_1.rankOf)(req.user?.role ?? '') < (0, auth_1.rankOf)('Company Admin')) {
            return { current_member_id: s.current_member_id, smtp: {}, digest: { enabled: !!digest.enabled } };
        }
        return { ...s, smtp: { ...smtp, pass: '', hasPass: !!smtp.pass } };
    }));
    r.put('/settings', (0, auth_1.requireRole)('Company Admin'), (req, res) => send(res, () => {
        const patch = (req.body ?? {});
        const smtp = patch.smtp;
        // A blank password means "keep the current one" — drop it so the merge preserves it.
        if (smtp && (smtp.pass === '' || smtp.pass == null)) {
            const { pass, ...rest } = smtp;
            patch.smtp = rest;
        }
        return store.updateSettings(patch);
    }));
    // ── Email (SMTP from settings) ────────────────────────────────────────────--
    // Testing the SMTP config is Company-Admin-only; sending (reminders/digests)
    // stays open to Team Lead+ since they never see the credentials.
    r.post('/email/test', (0, auth_1.requireRole)('Company Admin'), async (_req, res) => { res.json(await (0, email_1.emailTest)()); });
    r.post('/email/send', (0, auth_1.requireRole)('Admin'), async (req, res) => { res.json(await (0, email_1.emailSend)(req.body)); });
    // ── Attachments ──────────────────────────────────────────────────────────────
    r.get('/attachments/many', (req, res) => {
        const ids = String(req.query.ids ?? '').split(',').filter(Boolean).map((s) => int(s));
        send(res, () => store.attachmentsGetMany(String(req.query.entityType), ids));
    });
    // Serve raw file bytes by stored_path (for previews + Excel embedding). Must be
    // declared before '/attachments/:id' so "raw" isn't captured as an id.
    r.get('/attachments/raw', (req, res) => {
        const abs = safeStoragePath(String(req.query.path ?? ''));
        if (!abs) {
            res.status(400).json({ ok: false, error: 'bad path' });
            return;
        }
        if (!fs_1.default.existsSync(abs)) {
            res.status(404).json({ ok: false, error: 'file not found' });
            return;
        }
        res.sendFile(abs);
    });
    r.get('/attachments/:id', (req, res) => send(res, () => store.attachmentGet(int(req.params.id))));
    r.get('/attachments', (req, res) => send(res, () => store.attachmentsGet(String(req.query.entityType), int(req.query.entityId))));
    // Upload file bytes; store under STORAGE_DIR/<type>/<id>/ and create the record.
    r.post('/attachments/upload', upload.single('file'), async (req, res) => {
        try {
            const entityType = String(req.body.entityType);
            const entityId = int(req.body.entityId);
            const file = req.file;
            if (!file) {
                res.status(400).json({ ok: false, error: 'no file' });
                return;
            }
            const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${file.originalname.replace(/[^\w.\-]/g, '_')}`;
            const absDir = path_1.default.join(env_1.env.storageDir, entityType, String(entityId));
            fs_1.default.mkdirSync(absDir, { recursive: true });
            fs_1.default.writeFileSync(path_1.default.join(absDir, safeName), file.buffer);
            const storedPath = path_1.default.posix.join(entityType, String(entityId), safeName);
            const rec = await store.attachmentAdd(entityType, entityId, file.originalname, storedPath);
            const pid = await itemProjectId(entityType, entityId).catch(() => undefined);
            (0, ws_1.broadcast)({ entity: 'attachment', action: 'create', type: entityType, projectId: pid });
            res.json({ ok: true, data: rec });
        }
        catch (e) {
            res.status(400).json({ ok: false, error: String(e) });
        }
    });
    // Record-only create (legacy/local-path mode; remote clients use /upload).
    r.post('/attachments', async (req, res) => {
        const pid = await itemProjectId(String(req.body.entityType), int(req.body.entityId)).catch(() => undefined);
        send(res, () => store.attachmentAdd(req.body.entityType, int(req.body.entityId), req.body.filename, req.body.storedPath), { entity: 'attachment', action: 'create', type: String(req.body.entityType), projectId: pid });
    });
    r.put('/attachments/:id/description', async (req, res) => {
        const id = int(req.params.id);
        const att = await store.attachmentGet(id).catch(() => undefined);
        const pid = att ? await itemProjectId(String(att.entity_type), Number(att.entity_id)).catch(() => undefined) : undefined;
        send(res, async () => { await store.attachmentUpdateDescription(id, req.body.description); return { id }; }, { entity: 'attachment', action: 'update', type: att ? String(att.entity_type) : undefined, projectId: pid });
    });
    r.put('/attachments/:id', async (req, res) => {
        const id = int(req.params.id);
        const att = await store.attachmentGet(id).catch(() => undefined);
        const pid = att ? await itemProjectId(String(att.entity_type), Number(att.entity_id)).catch(() => undefined) : undefined;
        send(res, async () => { await store.attachmentUpdate(id, req.body.patch ?? req.body); return { id }; }, { entity: 'attachment', action: 'update', type: att ? String(att.entity_type) : undefined, projectId: pid });
    });
    r.delete('/attachments/:id', async (req, res) => {
        const id = int(req.params.id);
        const att = await store.attachmentGet(id).catch(() => undefined);
        const pid = att ? await itemProjectId(String(att.entity_type), Number(att.entity_id)).catch(() => undefined) : undefined;
        send(res, async () => {
            const rec = await store.attachmentDelete(id);
            const abs = rec ? safeStoragePath(String(rec.stored_path)) : null;
            if (abs && fs_1.default.existsSync(abs)) {
                try {
                    fs_1.default.unlinkSync(abs);
                }
                catch { /* leave orphan */ }
            }
            return rec;
        }, { entity: 'attachment', action: 'delete', type: att ? String(att.entity_type) : undefined, projectId: pid });
    });
    return r;
}
//# sourceMappingURL=routes.js.map