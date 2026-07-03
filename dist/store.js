"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSettings = getSettings;
exports.updateSettings = updateSettings;
exports.membersGetAll = membersGetAll;
exports.memberCreate = memberCreate;
exports.memberUpdate = memberUpdate;
exports.memberUpdateSkills = memberUpdateSkills;
exports.memberSetActive = memberSetActive;
exports.memberDelete = memberDelete;
exports.memberById = memberById;
exports.projectMembersGet = projectMembersGet;
exports.projectMembersAll = projectMembersAll;
exports.projectMemberAssign = projectMemberAssign;
exports.projectMemberUnassign = projectMemberUnassign;
exports.projectsGetAll = projectsGetAll;
exports.projectById = projectById;
exports.projectCreate = projectCreate;
exports.projectUpdate = projectUpdate;
exports.projectDelete = projectDelete;
exports.projectSetArchived = projectSetArchived;
exports.itemsGetByProject = itemsGetByProject;
exports.itemCreate = itemCreate;
exports.itemUpdate = itemUpdate;
exports.itemDelete = itemDelete;
exports.statusesGetAll = statusesGetAll;
exports.allOpenWip = allOpenWip;
exports.allDispatches = allDispatches;
exports.allTasks = allTasks;
exports.attachmentsGet = attachmentsGet;
exports.attachmentsGetMany = attachmentsGetMany;
exports.attachmentGet = attachmentGet;
exports.attachmentAdd = attachmentAdd;
exports.attachmentUpdateDescription = attachmentUpdateDescription;
exports.attachmentUpdate = attachmentUpdate;
exports.attachmentDelete = attachmentDelete;
const prisma_1 = require("./prisma");
const tables_1 = require("./tables");
// ── flatteners ────────────────────────────────────────────────────────────────
function flatProject(p) {
    return {
        id: p.id, name: p.name, client: p.client, location: p.location, discipline: p.discipline,
        quoted_hours: p.quotedHours, start_date: p.startDate ?? '', end_date: p.endDate ?? '', archived: p.archived ?? false,
        created_at: (0, tables_1.fmtDate)(p.createdAt), updated_at: (0, tables_1.fmtDate)(p.updatedAt),
        created_by: p.createdBy, updated_by: p.updatedBy, version: p.version
    };
}
function flatMember(m) {
    return {
        id: m.id, name: m.name, email: m.email, role: m.role, discipline: m.discipline ?? '',
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
async function getSettings() {
    const row = await prisma_1.prisma.appSetting.findUnique({ where: { id: 1 } });
    const data = (row?.data ?? {});
    const smtp = { ...DEFAULT_SMTP, ...(data.smtp ?? {}) };
    return { current_member_id: data.current_member_id ?? null, smtp };
}
async function updateSettings(patch) {
    const existing = await prisma_1.prisma.appSetting.findUnique({ where: { id: 1 } });
    const cur = (existing?.data ?? {});
    const curSmtp = cur.smtp ?? {};
    const next = { ...cur, ...patch, smtp: { ...curSmtp, ...(patch.smtp ?? {}) } };
    await prisma_1.prisma.appSetting.upsert({ where: { id: 1 }, create: { id: 1, data: next }, update: { data: next } });
    return getSettings();
}
// ── Members ───────────────────────────────────────────────────────────────────
async function membersGetAll() {
    return (await prisma_1.prisma.member.findMany({ orderBy: { id: 'asc' } })).map(flatMember);
}
async function memberCreate(name, email, role, discipline = '') {
    const m = await prisma_1.prisma.member.create({ data: { name, email: email || '', role: role || 'Employee', discipline: discipline || '' } });
    return m.id;
}
async function memberUpdate(id, name, email, role, discipline = '') {
    await prisma_1.prisma.member.update({ where: { id }, data: { name, email: email || '', role: role || 'Employee', discipline: discipline || '' } });
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
    const ps = await prisma_1.prisma.project.findMany({ orderBy: { id: 'desc' } });
    return ps.map(flatProject);
}
async function projectById(id) {
    const p = await prisma_1.prisma.project.findUnique({ where: { id } });
    return p ? flatProject(p) : undefined;
}
async function projectCreate(name, client, location, discipline, quotedHours, startDate = '', endDate = '', actor = '') {
    const p = await prisma_1.prisma.project.create({
        data: {
            name, client, location, discipline: discipline || '',
            quotedHours: parseFloat(quotedHours) || 0, startDate: startDate || '', endDate: endDate || '',
            createdBy: actor, updatedBy: actor
        }
    });
    return p.id;
}
async function projectUpdate(id, name, client, location, discipline, quotedHours, startDate = '', endDate = '', actor = '') {
    await prisma_1.prisma.project.update({
        where: { id },
        data: {
            name, client, location, discipline: discipline || '',
            quotedHours: parseFloat(quotedHours) || 0, startDate: startDate || '', endDate: endDate || '',
            updatedBy: actor, version: { increment: 1 }
        }
    });
}
async function projectDelete(id) {
    await prisma_1.prisma.project.delete({ where: { id } }); // items + status + project_members cascade
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