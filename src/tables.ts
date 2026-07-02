import { prisma } from './prisma'

/**
 * Maps the renderer's `type` strings to the Prisma model delegates for the
 * per-type item tables. These all share the hybrid shape
 * (id, projectId, data, audit columns, version).
 */
export const ITEM_DELEGATES = {
  rfi: prisma.rfi,
  query: prisma.query,
  dispatch: prisma.dispatch,
  wip: prisma.wipTask,
  qc: prisma.qcItem,
  timesheet: prisma.timesheet,
  task: prisma.task,
  standard: prisma.standard,
  scope: prisma.scope,
  meeting: prisma.meeting,
  input: prisma.input,
  feedback: prisma.projectFeedback,
  allocation: prisma.allocation
} as const

export type ItemType = keyof typeof ITEM_DELEGATES

export function isItemType(t: string): t is ItemType {
  return Object.prototype.hasOwnProperty.call(ITEM_DELEGATES, t)
}

// Format a Date the same way the legacy JSON store did: "YYYY-MM-DD HH:MM:SS".
export function fmtDate(d: Date | null | undefined): string {
  if (!d) return ''
  return new Date(d).toISOString().replace('T', ' ').substring(0, 19)
}

// Reserved top-level columns on an item row (everything else lives in `data`).
const RESERVED = new Set([
  'id', 'project_id', 'projectId', 'data',
  'created_at', 'createdAt', 'updated_at', 'updatedAt',
  'created_by', 'createdBy', 'updated_by', 'updatedBy', 'version'
])

/**
 * Flatten a hybrid DB row into the flat snake_case shape the renderer expects:
 * { id, project_id, ...data, created_at, created_by, updated_by, version }.
 */
export function flattenItem(row: {
  id: number
  projectId: number
  data: unknown
  createdAt?: Date
  createdBy?: string
  updatedBy?: string
  version?: number
}): Record<string, unknown> {
  const data = (row.data && typeof row.data === 'object' ? row.data : {}) as Record<string, unknown>
  return {
    id: row.id,
    project_id: row.projectId,
    ...data,
    created_at: fmtDate(row.createdAt),
    created_by: row.createdBy ?? '',
    updated_by: row.updatedBy ?? '',
    version: row.version ?? 1
  }
}

/**
 * Split an incoming flat row into { projectId, data } for storage: pull
 * project_id out as a real column, drop reserved/audit keys, keep the rest as data.
 */
export function toItemColumns(fields: Record<string, unknown>): {
  projectId: number
  data: Record<string, unknown>
} {
  const projectId = Number(fields.project_id ?? fields.projectId ?? 0)
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (!RESERVED.has(k)) data[k] = v
  }
  return { projectId, data }
}
