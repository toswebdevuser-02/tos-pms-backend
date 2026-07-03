"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ITEM_DELEGATES = void 0;
exports.isItemType = isItemType;
exports.fmtDate = fmtDate;
exports.flattenItem = flattenItem;
exports.toItemColumns = toItemColumns;
const prisma_1 = require("./prisma");
/**
 * Maps the renderer's `type` strings to the Prisma model delegates for the
 * per-type item tables. These all share the hybrid shape
 * (id, projectId, data, audit columns, version).
 */
exports.ITEM_DELEGATES = {
    rfi: prisma_1.prisma.rfi,
    query: prisma_1.prisma.query,
    dispatch: prisma_1.prisma.dispatch,
    wip: prisma_1.prisma.wipTask,
    qc: prisma_1.prisma.qcItem,
    timesheet: prisma_1.prisma.timesheet,
    task: prisma_1.prisma.task,
    standard: prisma_1.prisma.standard,
    scope: prisma_1.prisma.scope,
    meeting: prisma_1.prisma.meeting,
    input: prisma_1.prisma.input,
    feedback: prisma_1.prisma.projectFeedback,
    allocation: prisma_1.prisma.allocation
};
function isItemType(t) {
    return Object.prototype.hasOwnProperty.call(exports.ITEM_DELEGATES, t);
}
// Format a Date the same way the legacy JSON store did: "YYYY-MM-DD HH:MM:SS".
function fmtDate(d) {
    if (!d)
        return '';
    return new Date(d).toISOString().replace('T', ' ').substring(0, 19);
}
// Reserved top-level columns on an item row (everything else lives in `data`).
const RESERVED = new Set([
    'id', 'project_id', 'projectId', 'data',
    'created_at', 'createdAt', 'updated_at', 'updatedAt',
    'created_by', 'createdBy', 'updated_by', 'updatedBy', 'version'
]);
/**
 * Flatten a hybrid DB row into the flat snake_case shape the renderer expects:
 * { id, project_id, ...data, created_at, created_by, updated_by, version }.
 */
function flattenItem(row) {
    const data = (row.data && typeof row.data === 'object' ? row.data : {});
    return {
        id: row.id,
        project_id: row.projectId,
        ...data,
        created_at: fmtDate(row.createdAt),
        created_by: row.createdBy ?? '',
        updated_by: row.updatedBy ?? '',
        version: row.version ?? 1
    };
}
/**
 * Split an incoming flat row into { projectId, data } for storage: pull
 * project_id out as a real column, drop reserved/audit keys, keep the rest as data.
 */
function toItemColumns(fields) {
    const projectId = Number(fields.project_id ?? fields.projectId ?? 0);
    const data = {};
    for (const [k, v] of Object.entries(fields)) {
        if (!RESERVED.has(k))
            data[k] = v;
    }
    return { projectId, data };
}
//# sourceMappingURL=tables.js.map