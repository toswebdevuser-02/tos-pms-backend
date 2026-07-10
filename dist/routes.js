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
const env_1 = require("./env");
const auth_1 = require("./auth");
const ws_1 = require("./ws");
const email_1 = require("./email");
const redis_1 = require("./redis");
const projectService = __importStar(require("./service/projectService"));
const memberService = __importStar(require("./service/memberService"));
const projectMemberService = __importStar(require("./service/projectMemberService"));
const statusService = __importStar(require("./service/statusService"));
const clientService = __importStar(require("./service/clientService"));
const itemService = __importStar(require("./service/itemService"));
const quoteService = __importStar(require("./service/quoteService"));
const overtimeService = __importStar(require("./service/overtimeService"));
const attachmentService = __importStar(require("./service/attachmentService"));
const settingsService = __importStar(require("./service/settingsService"));
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
// Resolve a stored_path safely under STORAGE_DIR (block traversal / absolute paths).
function safeStoragePath(rel) {
    const abs = path_1.default.resolve(env_1.env.storageDir, rel);
    return abs.startsWith(path_1.default.resolve(env_1.env.storageDir)) ? abs : null;
}
// Run the op, broadcast a real-time change event on success, then respond.
async function send(res, fn, event) {
    try {
        const data = await fn();
        if (event)
            await (0, ws_1.broadcast)(typeof event === 'function' ? event(data) : event);
        res.json({ ok: true, data });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(400).json({ ok: false, error: msg });
    }
}
// Project writes: Manager+ required; Managers are scoped to their own discipline,
// Company Admin may act on any project.
function projectGuard(req, res, next) {
    const r = (0, auth_1.rankOf)(req.user?.role ?? '');
    if (r < (0, auth_1.rankOf)('Project Lead')) {
        res.status(403).json({ ok: false, error: 'Requires Project Lead role or above' });
        return;
    }
    next();
}
function actorOf(req) {
    return req.user?.name || req.user?.email || 'unknown';
}
const int = (v) => parseInt(String(v), 10);
const isAdmin = (req) => (0, auth_1.rankOf)(req.user?.role ?? '') >= (0, auth_1.rankOf)('Admin');
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
            const taskManager = (0, auth_1.rankOf)(req.user?.role ?? '') >= (0, auth_1.rankOf)('Project Lead');
            if ((method === 'POST' || method === 'DELETE') && !taskManager)
                return deny('Only Project Leads and above can create or delete tasks');
            if (method === 'PUT' && !taskManager) {
                const data = await itemService.getData('task', int(req.params.id));
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
            const data = await itemService.getData('timesheet', int(req.params.id));
            if (!data || String(data.member_id ?? '') !== String(mid ?? ''))
                return deny('You can only edit your own timesheet entries');
            return next();
        }
        return next();
    }
    catch (e) {
        res.status(400).json({ ok: false, error: String(e) });
    }
}
function buildRouter() {
    const r = (0, express_1.Router)();
    // ── Projects ──────────────────────────────────────────────────────────────
    r.get('/projects', (_req, res) => send(res, () => (0, redis_1.getCachedJson)('projects:all', 60, () => projectService.getAll())));
    r.get('/projects/deleted', projectGuard, (_req, res) => send(res, () => projectService.getDeleted()));
    r.get('/projects/:id', (req, res) => send(res, () => projectService.getById(int(req.params.id))));
    // Project meta counts for dashboard/sidebars.
    r.get('/projects/:id/counts', (req, res) => {
        const projectId = int(req.params.id);
        const cacheKey = `projectCounts:${projectId}`;
        send(res, () => (0, redis_1.getCachedJson)(cacheKey, 30, () => itemService.getCountsByProject(projectId)));
    });
    r.post('/projects', projectGuard, (req, res) => {
        const { name, client, location, discipline, type, quoted_hours, start_date, end_date, client_id } = req.body;
        send(res, async () => {
            const out = await projectService.create({
                name, client, location, discipline, type: String(type ?? ''),
                quotedHours: String(quoted_hours ?? ''), startDate: String(start_date ?? ''), endDate: String(end_date ?? ''),
                clientId: client_id == null ? null : Number(client_id), createdBy: actorOf(req)
            });
            if (req.user?.mid) {
                try {
                    await projectMemberService.assign(out.id, req.user.mid);
                }
                catch { /* ignore */ }
            }
            return out;
        });
    });
    r.put('/projects/:id', projectGuard, (req, res) => {
        const { name, client, location, discipline, type, quoted_hours, start_date, end_date, client_id } = req.body;
        send(res, async () => projectService.update(int(req.params.id), {
            name, client, location, discipline, type: String(type ?? ''),
            quotedHours: String(quoted_hours ?? ''), startDate: String(start_date ?? ''), endDate: String(end_date ?? ''),
            clientId: client_id === undefined ? undefined : (client_id == null ? null : Number(client_id)),
            updatedBy: actorOf(req)
        }));
    });
    r.put('/projects/:id/archived', projectGuard, (req, res) => {
        send(res, async () => projectService.setArchived(int(req.params.id), !!req.body.archived, actorOf(req)));
    });
    r.delete('/projects/:id', projectGuard, (req, res) => send(res, async () => projectService.softDelete(int(req.params.id), actorOf(req))));
    r.post('/projects/:id/restore', projectGuard, (req, res) => send(res, async () => projectService.restore(int(req.params.id), actorOf(req))));
    r.delete('/projects/:id/purge', (0, auth_1.requireRole)('Company Admin'), (req, res) => send(res, async () => projectService.purge(int(req.params.id))));
    // ── Statuses ──────────────────────────────────────────────────────────────
    r.get('/statuses', (_req, res) => send(res, () => (0, redis_1.getCachedJson)('statuses:all', 30, () => statusService.getAll())));
    // ── Cross-cutting (reminders) ─────────────────────────────────────────────
    r.get('/all/wip', (_req, res) => send(res, () => (0, redis_1.getCachedJson)('all:wip', 30, () => itemService.allOpenWip())));
    r.get('/all/dispatches', (_req, res) => send(res, () => (0, redis_1.getCachedJson)('all:dispatches', 30, () => itemService.allDispatches())));
    r.get('/all/tasks', (_req, res) => {
        return send(res, async () => {
            const totalStart = performance.now();
            const redisStart = performance.now();
            // Redis lookup is included inside getCachedJson()
            // (we also log HIT/MISS inside redis.ts)
            const dbStart = performance.now();
            const data = await (0, redis_1.getCachedJson)('all:tasks', 30, () => itemService.allTasks());
            const dbTime = performance.now() - dbStart;
            const redisTime = dbStart - redisStart;
            const processStart = performance.now();
            // no extra mapping here in this handler; keep the hook for future changes
            const processingTime = performance.now() - processStart;
            console.log('[perf] GET /all/tasks', 'Total:', performance.now() - totalStart, 'ms', '| Redis:', redisTime, 'ms', '| DB:', dbTime, 'ms', '| Processing:', processingTime, 'ms');
            return data;
        });
    });
    r.get('/all/timesheets', (_req, res) => send(res, () => (0, redis_1.getCachedJson)('all:timesheets', 30, () => itemService.allTimesheets())));
    r.get('/all/qc', (_req, res) => send(res, () => (0, redis_1.getCachedJson)('all:qc', 30, () => itemService.allQc())));
    r.get('/all/rfi', (_req, res) => send(res, () => (0, redis_1.getCachedJson)('all:rfi', 30, () => itemService.allRfis())));
    // ── Items ─────────────────────────────────────────────────────────────────
    r.get('/items/:type', (req, res) => {
        const type = String(req.params.type);
        const projectId = int(req.query.projectId);
        const key = `items:${type}:${projectId}`;
        if (type === 'status') {
            send(res, async () => (0, redis_1.getCachedJson)(key, 30, async () => {
                const s = await statusService.getByProject(projectId);
                return s ? [s] : [];
            }));
        }
        else {
            send(res, () => (0, redis_1.getCachedJson)(key, 30, () => itemService.getByProject(projectId, type)));
        }
    });
    r.post('/items/:type', itemWriteGuard, (req, res) => {
        const type = String(req.params.type);
        send(res, async () => {
            if (type === 'status') {
                const projectId = int(req.body.project_id);
                await statusService.upsert(projectId, {
                    overall: String(req.body.overall ?? ''),
                    notes: String(req.body.notes ?? ''),
                });
                const s = await statusService.getByProject(projectId);
                return { id: s?.id };
            }
            return { id: await itemService.create(type, req.body, actorOf(req)) };
        });
    });
    r.put('/items/:type/:id', itemWriteGuard, (req, res) => {
        const type = String(req.params.type);
        send(res, async () => {
            if (type === 'status') {
                const projectId = int(req.body.project_id);
                await statusService.upsert(projectId, {
                    overall: String(req.body.overall ?? ''),
                    notes: String(req.body.notes ?? ''),
                });
                return { id: int(req.params.id) };
            }
            await itemService.update(type, int(req.params.id), req.body, actorOf(req));
            return { id: int(req.params.id) };
        });
    });
    r.delete('/items/:type/:id', itemWriteGuard, async (req, res) => {
        const type = String(req.params.type);
        const id = int(req.params.id);
        send(res, async () => {
            if (type === 'status') {
                const projectId = await statusService.getByProject(int(req.body.project_id)).then(s => s?.projectId);
                await itemService.delete_(type, id, projectId);
            }
            else {
                const projectId = await itemService.getProjectId(type, id);
                await itemService.delete_(type, id, projectId);
            }
            return { id };
        });
    });
    // ── Members ───────────────────────────────────────────────────────────────
    r.get('/members', (_req, res) => send(res, () => (0, redis_1.getCachedJson)('members:all', 120, () => memberService.getAll())));
    r.get('/members/:id', (req, res) => send(res, () => memberService.getById(int(req.params.id))));
    r.post('/members', (0, auth_1.requireRole)('Company Admin'), (req, res) => send(res, async () => memberService.create({
        name: req.body.name, email: req.body.email, role: req.body.role,
        discipline: req.body.discipline, engagement: req.body.engagement
    })));
    r.put('/members/:id', (0, auth_1.requireRole)('Company Admin'), (req, res) => send(res, async () => memberService.update(int(req.params.id), {
        name: req.body.name, email: req.body.email, role: req.body.role,
        discipline: req.body.discipline, engagement: req.body.engagement
    })));
    r.delete('/members/:id', (0, auth_1.requireRole)('Company Admin'), (req, res) => send(res, async () => memberService.delete_(int(req.params.id))));
    r.put('/members/:id/active', (0, auth_1.requireRole)('Company Admin'), (req, res) => send(res, async () => memberService.setActive(int(req.params.id), !!req.body.active)));
    r.put('/members/:id/skills', (req, res) => {
        const id = int(req.params.id);
        if (req.user?.mid !== id && (0, auth_1.rankOf)(req.user?.role ?? '') < (0, auth_1.rankOf)('Company Admin')) {
            return res.status(403).json({ ok: false, error: 'You can only edit your own skills' });
        }
        send(res, async () => memberService.updateSkills(id, req.body.skills));
    });
    // ── Project Members ───────────────────────────────────────────────────────
    r.get('/project-members', (_req, res) => send(res, () => (0, redis_1.getCachedJson)('projectMembers:all', 60, () => projectMemberService.getAll())));
    r.get('/project-members/:projectId', (req, res) => {
        const projectId = int(req.params.projectId);
        return send(res, () => (0, redis_1.getCachedJson)(`projectMembers:${projectId}`, 60, () => projectMemberService.getByProject(projectId)));
    });
    r.post('/project-members', (0, auth_1.requireRole)('Admin'), (req, res) => send(res, async () => { await projectMemberService.assign(int(req.body.projectId), int(req.body.memberId)); return {}; }));
    r.delete('/project-members', (0, auth_1.requireRole)('Admin'), (req, res) => send(res, async () => { await projectMemberService.unassign(int(req.body.projectId), int(req.body.memberId)); return {}; }));
    // ── Overtime ──────────────────────────────────────────────────────────────
    r.get('/overtime', (req, res) => send(res, async () => ((0, auth_1.rankOf)(req.user?.role ?? '') >= (0, auth_1.rankOf)('Admin') ? overtimeService.getAll() : overtimeService.getForMember(req.user?.mid ?? -1))));
    r.post('/overtime', (req, res) => send(res, async () => {
        const mid = req.user?.mid;
        if (!mid)
            throw new Error('Your account has no member profile');
        const id = await overtimeService.create(mid, String(req.body.date ?? ''), Number(req.body.hours ?? 0), String(req.body.reason ?? ''));
        return { id };
    }));
    r.put('/overtime/:id/decide', (req, res) => send(res, async () => {
        const id = int(req.params.id);
        const cur = await overtimeService.getById(id);
        if (!cur)
            throw new Error('Overtime request not found');
        const t = overtimeService.transition(String(cur.status ?? 'pending'), String(req.body.decision ?? ''), (0, auth_1.rankOf)(req.user?.role ?? ''));
        if ('error' in t)
            throw new Error(t.error);
        const actor = actorOf(req);
        const trail = String(cur.decided_by ?? '');
        const by = t.tag === 'lead' ? `Lead: ${actor}` : t.tag === 'mgr' ? `${trail ? trail + ' · ' : ''}Mgr: ${actor}` : `${trail ? trail + ' · ' : ''}Rejected by ${actor}`;
        await overtimeService.decide(id, t.next, by);
        return { id };
    }));
    // ── Quotes ────────────────────────────────────────────────────────────────
    r.get('/quotes', (0, auth_1.requireRole)('Admin'), (_req, res) => send(res, () => (0, redis_1.getCachedJson)('quotes:all', 60, () => quoteService.getAll())));
    r.post('/quotes', (0, auth_1.requireRole)('Admin'), (req, res) => send(res, async () => ({ id: await quoteService.create(req.body, actorOf(req)) })));
    r.put('/quotes/:id', (0, auth_1.requireRole)('Admin'), (req, res) => send(res, async () => { await quoteService.update(int(req.params.id), req.body, actorOf(req)); return { id: int(req.params.id) }; }));
    r.delete('/quotes/:id', (0, auth_1.requireRole)('Admin'), (req, res) => send(res, async () => { await quoteService.delete_(int(req.params.id)); return { id: int(req.params.id) }; }));
    // ── Clients ───────────────────────────────────────────────────────────────
    r.get('/clients', (_req, res) => send(res, () => (0, redis_1.getCachedJson)('clients:all', 120, () => clientService.getAll())));
    r.post('/clients', (0, auth_1.requireRole)('Admin'), (req, res) => send(res, async () => ({ id: await clientService.create({ name: req.body.name, company: req.body.company }) })));
    r.put('/clients/:id', (0, auth_1.requireRole)('Admin'), (req, res) => send(res, async () => { await clientService.update(int(req.params.id), { name: req.body.name, company: req.body.company }); return { id: int(req.params.id) }; }));
    r.delete('/clients/:id', (0, auth_1.requireRole)('Admin'), (req, res) => send(res, async () => { await clientService.delete_(int(req.params.id)); return { id: int(req.params.id) }; }));
    // ── Settings ──────────────────────────────────────────────────────────────
    r.get('/settings', (req, res) => send(res, async () => {
        const s = await settingsService.get();
        const smtp = (s.smtp ?? {});
        const digest = (s.digest ?? {});
        if ((0, auth_1.rankOf)(req.user?.role ?? '') < (0, auth_1.rankOf)('Company Admin')) {
            return { current_member_id: s.current_member_id, smtp: {}, digest: { enabled: !!digest.enabled } };
        }
        return { ...s, smtp: { ...smtp, pass: '', hasPass: !!smtp.pass } };
    }));
    r.put('/settings', (0, auth_1.requireRole)('Company Admin'), (req, res) => send(res, () => {
        const patch = (req.body ?? {});
        const smtp = patch.smtp;
        if (smtp && (smtp.pass === '' || smtp.pass == null)) {
            const { pass, ...rest } = smtp;
            patch.smtp = rest;
        }
        return settingsService.update(patch);
    }));
    // ── Email ─────────────────────────────────────────────────────────────────
    r.post('/email/test', (0, auth_1.requireRole)('Company Admin'), async (_req, res) => { res.json(await (0, email_1.emailTest)()); });
    r.post('/email/send', (0, auth_1.requireRole)('Admin'), async (req, res) => { res.json(await (0, email_1.emailSend)(req.body)); });
    // ── Attachments ───────────────────────────────────────────────────────────
    r.get('/attachments/many', (req, res) => {
        const ids = String(req.query.ids ?? '').split(',').filter(Boolean).map(int);
        send(res, () => attachmentService.getMany(String(req.query.entityType), ids));
    });
    r.get('/attachments/raw', (req, res) => {
        const abs = safeStoragePath(String(req.query.path ?? ''));
        if (!abs)
            return res.status(400).json({ ok: false, error: 'bad path' });
        if (!fs_1.default.existsSync(abs))
            return res.status(404).json({ ok: false, error: 'file not found' });
        res.sendFile(abs);
    });
    r.get('/attachments/:id', (req, res) => send(res, () => attachmentService.getById(int(req.params.id))));
    r.get('/attachments', (req, res) => send(res, () => attachmentService.getByEntity(String(req.query.entityType), int(req.query.entityId))));
    r.post('/attachments/upload', upload.single('file'), async (req, res) => {
        try {
            const entityType = String(req.body.entityType);
            const entityId = int(req.body.entityId);
            const file = req.file;
            if (!file)
                return res.status(400).json({ ok: false, error: 'no file' });
            const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${file.originalname.replace(/[^\w.\-]/g, '_')}`;
            const absDir = path_1.default.join(env_1.env.storageDir, entityType, String(entityId));
            fs_1.default.mkdirSync(absDir, { recursive: true });
            fs_1.default.writeFileSync(path_1.default.join(absDir, safeName), file.buffer);
            const storedPath = path_1.default.posix.join(entityType, String(entityId), safeName);
            const rec = await attachmentService.add(entityType, entityId, file.originalname, storedPath);
            res.json({ ok: true, data: rec });
        }
        catch (e) {
            res.status(400).json({ ok: false, error: String(e) });
        }
    });
    r.post('/attachments', async (req, res) => {
        send(res, () => attachmentService.add(req.body.entityType, int(req.body.entityId), req.body.filename, req.body.storedPath));
    });
    r.put('/attachments/:id/description', async (req, res) => {
        send(res, async () => { await attachmentService.updateDescription(int(req.params.id), req.body.description); return { id: int(req.params.id) }; });
    });
    r.put('/attachments/:id', async (req, res) => {
        send(res, async () => { await attachmentService.update(int(req.params.id), req.body.patch ?? req.body); return { id: int(req.params.id) }; });
    });
    r.delete('/attachments/:id', async (req, res) => {
        send(res, async () => {
            const rec = await attachmentService.delete_(int(req.params.id));
            const abs = rec ? safeStoragePath(String(rec.stored_path)) : null;
            if (abs && fs_1.default.existsSync(abs)) {
                try {
                    fs_1.default.unlinkSync(abs);
                }
                catch { /* leave orphan */ }
            }
            return rec;
        });
    });
    return r;
}
//# sourceMappingURL=routes.js.map