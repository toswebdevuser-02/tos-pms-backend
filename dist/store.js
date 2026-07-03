"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientsGetAll = clientsGetAll;
exports.clientById = clientById;
exports.nextClientCode = nextClientCode;
exports.clientCreate = clientCreate;
exports.clientUpdate = clientUpdate;
exports.clientDelete = clientDelete;
exports.getSettings = getSettings;
exports.updateSettings = updateSettings;
exports.membersGetAll = membersGetAll;
exports.memberCreate = memberCreate;
exports.memberUpdate = memberUpdate;
exports.memberUpdateSkills = memberUpdateSkills;
exports.memberSetActive = memberSetActive;
exports.memberDelete = memberDelete;
exports.memberById = memberById;
exports.overtimeAll = overtimeAll;
exports.overtimeForMember = overtimeForMember;
exports.overtimeById = overtimeById;
exports.overtimeCreate = overtimeCreate;
exports.overtimeDecide = overtimeDecide;
exports.overtimeTransition = overtimeTransition;
exports.projectMembersGet = projectMembersGet;
exports.projectMembersAll = projectMembersAll;
exports.projectMemberAssign = projectMemberAssign;
exports.projectMemberUnassign = projectMemberUnassign;
exports.projectsGetAll = projectsGetAll;
exports.projectsDeleted = projectsDeleted;
exports.projectById = projectById;
exports.projectCreate = projectCreate;
exports.projectUpdate = projectUpdate;
exports.projectSoftDelete = projectSoftDelete;
exports.projectRestore = projectRestore;
exports.projectPurge = projectPurge;
exports.projectsPurgeExpired = projectsPurgeExpired;
exports.projectDelete = projectDelete;
exports.projectSetArchived = projectSetArchived;
exports.itemsGetByProject = itemsGetByProject;
exports.itemCreate = itemCreate;
exports.itemUpdate = itemUpdate;
exports.itemDelete = itemDelete;
exports.statusesGetAll = statusesGetAll;
exports.quotesGetAll = quotesGetAll;
exports.quoteCreate = quoteCreate;
exports.quoteUpdate = quoteUpdate;
exports.quoteDelete = quoteDelete;
exports.allOpenWip = allOpenWip;
exports.allDispatches = allDispatches;
exports.allTasks = allTasks;
exports.allTimesheets = allTimesheets;
exports.allQc = allQc;
exports.allRfis = allRfis;
exports.attachmentsGet = attachmentsGet;
exports.attachmentsGetMany = attachmentsGetMany;
exports.attachmentGet = attachmentGet;
exports.attachmentAdd = attachmentAdd;
exports.attachmentUpdateDescription = attachmentUpdateDescription;
exports.attachmentUpdate = attachmentUpdate;
exports.attachmentDelete = attachmentDelete;
const prisma_1 = require("./prisma");
const tables_1 = require("./tables");
const auth_1 = require("./auth");
// ── flatteners ────────────────────────────────────────────────────────────────
function flatProject(p) {
    return {
        id: p.id, name: p.name, client: p.client, location: p.location, discipline: p.discipline, type: p.type ?? '',
        quoted_hours: p.quotedHours, start_date: p.startDate ?? '', end_date: p.endDate ?? '', archived: p.archived ?? false,
        deleted_at: p.deletedAt ? (0, tables_1.fmtDate)(p.deletedAt) : '', client_id: p.clientId ?? null,
        created_at: (0, tables_1.fmtDate)(p.createdAt), updated_at: (0, tables_1.fmtDate)(p.updatedAt),
        created_by: p.createdBy, updated_by: p.updatedBy, version: p.version
    };
}
// ── Clients ───────────────────────────────────────────────────────────────────
function flatClient(c) {
    return {
        id: c.id, code: c.code, name: c.name, company: c.company ?? '', contact: c.contact, email: c.email, phone: c.phone,
        created_at: (0, tables_1.fmtDate)(c.createdAt), updated_at: (0, tables_1.fmtDate)(c.updatedAt),
        created_by: c.createdBy, updated_by: c.updatedBy, version: c.version
    };
}
async function clientsGetAll() {
    return (await prisma_1.prisma.client.findMany({ orderBy: { name: 'asc' } })).map(flatClient);
}
async function clientById(id) {
    const c = await prisma_1.prisma.client.findUnique({ where: { id } });
    return c ? flatClient(c) : undefined;
}
// Next sequential code CL-0001 (gap-tolerant: max existing + 1).
async function nextClientCode() {
    const rows = await prisma_1.prisma.client.findMany({ select: { code: true } });
    let max = 0;
    for (const r of rows) {
        const m = String(r.code).match(/(\d+)\s*$/);
        if (m)
            max = Math.max(max, parseInt(m[1], 10));
    }
    return `CL-${String(max + 1).padStart(4, '0')}`;
}
async function clientCreate(fields, actor = '') {
    const name = String(fields.name ?? '').trim();
    if (!name)
        throw new Error('Client name is required');
    const code = await nextClientCode();
    const c = await prisma_1.prisma.client.create({
        data: { code, name, company: String(fields.company ?? ''), createdBy: actor, updatedBy: actor }
    });
    return c.id;
}
async function clientUpdate(id, fields, actor = '') {
    const name = String(fields.name ?? '').trim();
    if (!name)
        throw new Error('Client name is required');
    await prisma_1.prisma.client.update({
        where: { id },
        data: { name, company: String(fields.company ?? ''), updatedBy: actor, version: { increment: 1 } }
    });
    // Keep the denormalized project.client name in step so existing views/grouping stay correct.
    await prisma_1.prisma.project.updateMany({ where: { clientId: id }, data: { client: name } });
}
async function clientDelete(id) {
    // Projects keep their text name; the FK is set null (see schema onDelete: SetNull).
    await prisma_1.prisma.client.delete({ where: { id } });
}
function flatMember(m) {
    return {
        id: m.id, name: m.name, email: m.email, role: m.role, discipline: m.discipline ?? '', engagement: m.engagement ?? '',
        skills: Array.isArray(m.skills) ? m.skills : [], status: m.status ?? 'active', left_date: m.leftDate ?? '',
        created_at: (0, tables_1.fmtDate)(m.createdAt)
    };
}
function flatStatus(s) {
    return {
        id: s.id, project_id: s.projectId, overall: s.overall, notes: s.notes,
        last_updated: (0, tables_1.fmtDate)(s.lastUpdated), created_by: s.createdBy, updated_by: s.updatedBy, version: s.version
    };
}
function flatAttachment(a) {
    return {
        id: a.id, entity_type: a.entityType, entity_id: a.entityId, filename: a.filename,
        stored_path: a.storedPath, description: a.description, response: a.response,
        importance: a.importance, created_at: (0, tables_1.fmtDate)(a.createdAt)
    };
}
function delegateFor(type) {
    if (!(0, tables_1.isItemType)(type))
        throw new Error(`Unknown item type: ${type}`);
    return tables_1.ITEM_DELEGATES[type];
}
// ── Settings ──────────────────────────────────────────────────────────────────
const DEFAULT_SMTP = { host: '', port: 587, secure: false, user: '', pass: '', from: '' };
const DEFAULT_DIGEST = { enabled: false, frequency: 'weekly', dayOfWeek: 1, hour: 8, recipients: [], lastSent: '' };
async function getSettings() {
    const row = await prisma_1.prisma.appSetting.findUnique({ where: { id: 1 } });
    const data = (row?.data ?? {});
    const smtp = { ...DEFAULT_SMTP, ...(data.smtp ?? {}) };
    const digest = { ...DEFAULT_DIGEST, ...(data.digest ?? {}) };
    return { current_member_id: data.current_member_id ?? null, smtp, digest };
}
async function updateSettings(patch) {
    const existing = await prisma_1.prisma.appSetting.findUnique({ where: { id: 1 } });
    const cur = (existing?.data ?? {});
    const curSmtp = cur.smtp ?? {};
    const curDigest = cur.digest ?? {};
    const next = {
        ...cur, ...patch,
        smtp: { ...curSmtp, ...(patch.smtp ?? {}) },
        digest: { ...curDigest, ...(patch.digest ?? {}) }
    };
    await prisma_1.prisma.appSetting.upsert({ where: { id: 1 }, create: { id: 1, data: next }, update: { data: next } });
    return getSettings();
}
// ── Members ───────────────────────────────────────────────────────────────────
async function membersGetAll() {
    return (await prisma_1.prisma.member.findMany({ orderBy: { id: 'asc' } })).map(flatMember);
}
async function memberCreate(name, email, role, discipline = '', engagement = '') {
    const m = await prisma_1.prisma.member.create({ data: { name, email: email || '', role: role || 'Employee', discipline: discipline || '', engagement: engagement || '' } });
    return m.id;
}
async function memberUpdate(id, name, email, role, discipline = '', engagement = '') {
    await prisma_1.prisma.member.update({ where: { id }, data: { name, email: email || '', role: role || 'Employee', discipline: discipline || '', engagement: engagement || '' } });
}
async function memberUpdateSkills(id, skills) {
    const data = (Array.isArray(skills) ? skills : []);
    await prisma_1.prisma.member.update({ where: { id }, data: { skills: data } });
}
async function memberSetActive(id, active) {
    await prisma_1.prisma.member.update({
        where: { id },
        data: { status: active ? 'active' : 'left', leftDate: active ? '' : new Date().toISOString().slice(0, 10) }
    });
}
async function memberDelete(id) {
    await prisma_1.prisma.member.delete({ where: { id } }); // project_members cascade via FK
}
async function memberById(id) {
    const m = await prisma_1.prisma.member.findUnique({ where: { id } });
    return m ? flatMember(m) : undefined;
}
// ── Overtime requests ─────────────────────────────────────────────────────────
function flatOvertime(o) {
    return {
        id: o.id, member_id: o.memberId, date: o.date, hours: o.hours, status: o.status,
        reason: o.reason, requested_at: (0, tables_1.fmtDate)(o.requestedAt), decided_by: o.decidedBy
    };
}
async function overtimeAll() {
    return (await prisma_1.prisma.overtimeRequest.findMany({ orderBy: { id: 'desc' } })).map(flatOvertime);
}
async function overtimeForMember(memberId) {
    return (await prisma_1.prisma.overtimeRequest.findMany({ where: { memberId }, orderBy: { id: 'desc' } })).map(flatOvertime);
}
async function overtimeById(id) {
    const o = await prisma_1.prisma.overtimeRequest.findUnique({ where: { id } });
    return o ? flatOvertime(o) : undefined;
}
async function overtimeCreate(memberId, date, hours, reason = '') {
    const o = await prisma_1.prisma.overtimeRequest.create({ data: { memberId, date, hours: hours || 0, reason: reason || '', status: 'pending' } });
    return o.id;
}
async function overtimeDecide(id, status, decidedBy) {
    await prisma_1.prisma.overtimeRequest.update({ where: { id }, data: { status, decidedBy } });
}
// Pure two-stage approval transition. Stage 1: a Project/Team Lead approves a
// 'pending' request → 'lead_approved'. Stage 2: a Manager+ approves → 'approved'
// (only then do the hours reflect). Either stage may reject. Returns the next
// status + the approver tag, or an error when the actor's rank is too low / the
// request is already decided.
function overtimeTransition(status, decision, rank) {
    const LEAD = (0, auth_1.rankOf)('Project Lead'), MGR = (0, auth_1.rankOf)('Manager');
    if (decision === 'reject') {
        if (status === 'pending') {
            if (rank < LEAD)
                return { error: 'Requires Project Lead or above' };
        }
        else if (status === 'lead_approved') {
            if (rank < MGR)
                return { error: 'Requires Manager or above' };
        }
        else
            return { error: 'This request has already been decided' };
        return { next: 'rejected', tag: 'reject' };
    }
    if (decision === 'approve') {
        if (status === 'pending') {
            if (rank < LEAD)
                return { error: 'Requires Project Lead or above' };
            return { next: 'lead_approved', tag: 'lead' };
        }
        if (status === 'lead_approved') {
            if (rank < MGR)
                return { error: 'Requires Manager or above' };
            return { next: 'approved', tag: 'mgr' };
        }
        if (status === 'approved')
            return { error: 'This request has already been fully approved' };
        return { error: 'This request has already been decided' };
    }
    return { error: 'Invalid decision' };
}
// ── Project ↔ Member ──────────────────────────────────────────────────────────
async function projectMembersGet(projectId) {
    const links = await prisma_1.prisma.projectMember.findMany({ where: { projectId }, include: { member: true } });
    return links.map((l) => flatMember(l.member));
}
async function projectMembersAll() {
    const links = await prisma_1.prisma.projectMember.findMany();
    return links.map((l) => ({ id: l.id, project_id: l.projectId, member_id: l.memberId }));
}
async function projectMemberAssign(projectId, memberId) {
    await prisma_1.prisma.projectMember.upsert({
        where: { projectId_memberId: { projectId, memberId } },
        create: { projectId, memberId },
        update: {}
    });
}
async function projectMemberUnassign(projectId, memberId) {
    await prisma_1.prisma.projectMember.deleteMany({ where: { projectId, memberId } });
}
// ── Projects ──────────────────────────────────────────────────────────────────
async function projectsGetAll() {
    // Active projects only — soft-deleted ones live in the recycle bin.
    const ps = await prisma_1.prisma.project.findMany({ where: { deletedAt: null }, orderBy: { id: 'desc' } });
    return ps.map(flatProject);
}
async function projectsDeleted() {
    const ps = await prisma_1.prisma.project.findMany({ where: { deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' } });
    return ps.map(flatProject);
}
async function projectById(id) {
    const p = await prisma_1.prisma.project.findUnique({ where: { id } });
    return p ? flatProject(p) : undefined;
}
async function projectCreate(name, client, location, discipline, quotedHours, startDate = '', endDate = '', actor = '', type = '', clientId) {
    const p = await prisma_1.prisma.project.create({
        data: {
            name, client, location, discipline: discipline || '', type: type || '',
            quotedHours: parseFloat(quotedHours) || 0, startDate: startDate || '', endDate: endDate || '',
            clientId: clientId ?? null,
            createdBy: actor, updatedBy: actor
        }
    });
    return p.id;
}
async function projectUpdate(id, name, client, location, discipline, quotedHours, startDate = '', endDate = '', actor = '', type = '', clientId) {
    await prisma_1.prisma.project.update({
        where: { id },
        data: {
            name, client, location, discipline: discipline || '', type: type || '',
            quotedHours: parseFloat(quotedHours) || 0, startDate: startDate || '', endDate: endDate || '',
            // Only touch the client link when explicitly provided (preserve it on edits that omit it).
            ...(clientId !== undefined ? { clientId } : {}),
            updatedBy: actor, version: { increment: 1 }
        }
    });
}
// Soft delete → recycle bin (restorable for 15 days). Also decouples any quote
// that created this project so it reads "unapproved" and can be re-approved.
async function projectSoftDelete(id, actor = '') {
    await prisma_1.prisma.project.update({ where: { id }, data: { deletedAt: new Date(), updatedBy: actor, version: { increment: 1 } } });
    await unlinkQuotesForProject(id);
}
async function projectRestore(id, actor = '') {
    await prisma_1.prisma.project.update({ where: { id }, data: { deletedAt: null, updatedBy: actor, version: { increment: 1 } } });
}
async function projectPurge(id) {
    await prisma_1.prisma.project.delete({ where: { id } }); // items + status + project_members cascade
}
// Permanently remove projects that have been in the recycle bin longer than `days`.
async function projectsPurgeExpired(days = 15) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const res = await prisma_1.prisma.project.deleteMany({ where: { deletedAt: { not: null, lt: cutoff } } });
    return res.count;
}
// Backwards-compatible alias.
async function projectDelete(id) { await projectSoftDelete(id); }
// Quotes that point at a project (data.project_id) → clear the link + approval.
async function unlinkQuotesForProject(projectId) {
    const quotes = await prisma_1.prisma.quote.findMany();
    for (const q of quotes) {
        const data = (q.data ?? {});
        if (Number(data.project_id) === projectId) {
            const { project_id, approved, ...rest } = data;
            void project_id;
            void approved;
            await prisma_1.prisma.quote.update({ where: { id: q.id }, data: { data: rest } });
        }
    }
}
async function projectSetArchived(id, archived, actor = '') {
    await prisma_1.prisma.project.update({
        where: { id },
        data: { archived, updatedBy: actor, version: { increment: 1 } }
    });
}
// ── Items (rfi/query/dispatch/wip/qc/timesheet/task/standard/scope/meeting/input + status) ──
async function itemsGetByProject(projectId, type) {
    if (type === 'status') {
        const rows = await prisma_1.prisma.projectStatus.findMany({ where: { projectId } });
        return rows.map(flatStatus);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await delegateFor(type).findMany({ where: { projectId }, orderBy: { id: 'asc' } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r) => (0, tables_1.flattenItem)(r));
}
async function itemCreate(type, fields, actor = '') {
    if (type === 'status') {
        const projectId = Number(fields.project_id);
        const s = await prisma_1.prisma.projectStatus.upsert({
            where: { projectId },
            create: { projectId, overall: String(fields.overall ?? ''), notes: String(fields.notes ?? ''), createdBy: actor, updatedBy: actor },
            update: { overall: String(fields.overall ?? ''), notes: String(fields.notes ?? ''), updatedBy: actor, lastUpdated: new Date(), version: { increment: 1 } }
        });
        return s.id;
    }
    const { projectId, data } = (0, tables_1.toItemColumns)(fields);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await delegateFor(type).create({ data: { projectId, data, createdBy: actor, updatedBy: actor } });
    return created.id;
}
async function itemUpdate(type, id, fields, actor = '') {
    if (type === 'status') {
        await prisma_1.prisma.projectStatus.update({
            where: { id },
            data: { overall: String(fields.overall ?? ''), notes: String(fields.notes ?? ''), updatedBy: actor, lastUpdated: new Date(), version: { increment: 1 } }
        });
        return;
    }
    const { data } = (0, tables_1.toItemColumns)(fields);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await delegateFor(type).update({ where: { id }, data: { data, updatedBy: actor, version: { increment: 1 } } });
}
async function itemDelete(type, id) {
    if (type === 'status') {
        await prisma_1.prisma.projectStatus.delete({ where: { id } });
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await delegateFor(type).delete({ where: { id } });
    await prisma_1.prisma.attachment.deleteMany({ where: { entityType: type, entityId: id } });
}
async function statusesGetAll() {
    return (await prisma_1.prisma.projectStatus.findMany()).map(flatStatus);
}
// ── Quotes (standalone quotations) ────────────────────────────────────────────
function flatQuote(q) {
    const data = (q.data ?? {});
    return {
        ...data, id: q.id,
        created_at: (0, tables_1.fmtDate)(q.createdAt), updated_at: (0, tables_1.fmtDate)(q.updatedAt),
        created_by: q.createdBy, updated_by: q.updatedBy, version: q.version
    };
}
async function quotesGetAll() {
    return (await prisma_1.prisma.quote.findMany({ orderBy: { id: 'desc' } })).map(flatQuote);
}
async function quoteCreate(fields, actor = '') {
    const { id, created_at, updated_at, created_by, updated_by, version, ...data } = fields;
    void id;
    void created_at;
    void updated_at;
    void created_by;
    void updated_by;
    void version;
    const q = await prisma_1.prisma.quote.create({ data: { data: data, createdBy: actor, updatedBy: actor } });
    return q.id;
}
async function quoteUpdate(id, fields, actor = '') {
    const { id: _id, created_at, updated_at, created_by, updated_by, version, ...data } = fields;
    void _id;
    void created_at;
    void updated_at;
    void created_by;
    void updated_by;
    void version;
    await prisma_1.prisma.quote.update({ where: { id }, data: { data: data, updatedBy: actor, version: { increment: 1 } } });
}
async function quoteDelete(id) {
    await prisma_1.prisma.quote.delete({ where: { id } });
}
// ── Cross-cutting reads (reminders engine) ────────────────────────────────────
async function allOpenWip() {
    return (await prisma_1.prisma.wipTask.findMany()).map(tables_1.flattenItem);
}
async function allDispatches() {
    return (await prisma_1.prisma.dispatch.findMany()).map(tables_1.flattenItem);
}
async function allTasks() {
    return (await prisma_1.prisma.task.findMany()).map(tables_1.flattenItem);
}
async function allTimesheets() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await delegateFor('timesheet').findMany()).map(tables_1.flattenItem);
}
async function allQc() {
    return (await prisma_1.prisma.qcItem.findMany()).map(tables_1.flattenItem);
}
async function allRfis() {
    return (await prisma_1.prisma.rfi.findMany()).map(tables_1.flattenItem);
}
// ── Attachments (records; file bytes handled in Phase 5) ──────────────────────
async function attachmentsGet(entityType, entityId) {
    return (await prisma_1.prisma.attachment.findMany({ where: { entityType, entityId } })).map(flatAttachment);
}
async function attachmentsGetMany(entityType, ids) {
    return (await prisma_1.prisma.attachment.findMany({ where: { entityType, entityId: { in: ids } } })).map(flatAttachment);
}
async function attachmentGet(id) {
    const a = await prisma_1.prisma.attachment.findUnique({ where: { id } });
    return a ? flatAttachment(a) : undefined;
}
async function attachmentAdd(entityType, entityId, filename, storedPath) {
    const a = await prisma_1.prisma.attachment.create({ data: { entityType, entityId, filename, storedPath } });
    return flatAttachment(a);
}
async function attachmentUpdateDescription(id, description) {
    await prisma_1.prisma.attachment.update({ where: { id }, data: { description } });
}
async function attachmentUpdate(id, patch) {
    const data = {};
    for (const k of ['description', 'response', 'importance', 'filename', 'stored_path']) {
        if (patch[k] !== undefined)
            data[k === 'stored_path' ? 'storedPath' : k] = patch[k];
    }
    await prisma_1.prisma.attachment.update({ where: { id }, data });
}
async function attachmentDelete(id) {
    const a = await prisma_1.prisma.attachment.findUnique({ where: { id } });
    if (!a)
        return undefined;
    await prisma_1.prisma.attachment.delete({ where: { id } });
    return flatAttachment(a);
}
//# sourceMappingURL=store.js.map