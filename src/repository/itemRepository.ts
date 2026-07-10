// /**
//  * Item Repository - Data access for all generic items.
//  */

// import { prisma } from '../prisma'
// import { ITEM_DELEGATES, flattenItem, toItemColumns } from '../tables'

// interface Row {
//   [key: string]: any
// }

// function delegateFor(type: string) {
//   const delegate = ITEM_DELEGATES[type as keyof typeof ITEM_DELEGATES]
//   if (!delegate) throw new Error(`Unknown item type: ${type}`)
//   return delegate
// }

// export async function getByProject(projectId: number, type: string): Promise<Row[]> {
//   const delegate = delegateFor(type) as any
//   const rows = await delegate.findMany({ where: { projectId }, orderBy: { id: 'asc' } })
//   return rows.map((r: any) => flattenItem(r))
// }

// export async function create(type: string, fields: Row, actor: string): Promise<number> {
//   const { projectId, data } = toItemColumns(fields)
//   const delegate = delegateFor(type) as any
//   const created = await delegate.create({
//     data: { projectId, data, createdBy: actor, updatedBy: actor },
//   })
//   return created.id
// }

// export async function update(type: string, id: number, fields: Row, actor: string): Promise<void> {
//   const { data } = toItemColumns(fields)
//   const delegate = delegateFor(type) as any
//   await delegate.update({
//     where: { id },
//     data: { data, updatedBy: actor, version: { increment: 1 } },
//   })
// }

// export async function delete_(type: string, id: number): Promise<void> {
//   const delegate = delegateFor(type) as any
//   await delegate.delete({ where: { id } })
//   await prisma.attachment.deleteMany({ where: { entityType: type, entityId: id } })
// }

// export async function getProjectId(type: string, id: number): Promise<number | undefined> {
//   const delegate = delegateFor(type) as any
//   const row = await delegate.findUnique({ where: { id }, select: { projectId: true } })
//   return row?.projectId
// }

// export async function getData(type: string, id: number): Promise<Record<string, unknown> | undefined> {
//   const delegate = delegateFor(type) as any
//   const row = await delegate.findUnique({ where: { id } })
//   return row ? (row.data as Record<string, unknown>) : undefined
// }

// // Cross-cutting reads
// export async function allOpenWip(): Promise<Row[]> {
//   return (await prisma.wipTask.findMany()).map(flattenItem)
// }
// export async function allDispatches(): Promise<Row[]> {
//   return (await prisma.dispatch.findMany()).map(flattenItem)
// }
// export async function allTasks(): Promise<Row[]> {
//   return (await prisma.task.findMany()).map(flattenItem)
// }
// export async function allTimesheets(): Promise<Row[]> {
//   const delegate = delegateFor('timesheet') as any
//   return (await delegate.findMany()).map(flattenItem)
// }
// export async function allQc(): Promise<Row[]> {
//   return (await prisma.qcItem.findMany()).map(flattenItem)
// }
// export async function allRfis(): Promise<Row[]> {
//   return (await prisma.rfi.findMany()).map(flattenItem)
// }

// export async function getCountsByProject(projectId: number): Promise<Record<string, number>> {
//   const rows = await prisma.$queryRaw<{ type: string; count: number }[]>`
//     SELECT 'rfi' AS type, COUNT(*)::int AS count FROM rfis WHERE project_id = ${projectId}
//     UNION ALL
//     SELECT 'query' AS type, COUNT(*)::int AS count FROM queries WHERE project_id = ${projectId}
//     UNION ALL
//     SELECT 'dispatch' AS type, COUNT(*)::int AS count FROM dispatches WHERE project_id = ${projectId}
//     UNION ALL
//     SELECT 'wip' AS type, COUNT(*)::int AS count FROM wip_tasks WHERE project_id = ${projectId}
//     UNION ALL
//     SELECT 'qc' AS type, COUNT(*)::int AS count FROM qc_items WHERE project_id = ${projectId}
//     UNION ALL
//     SELECT 'timesheet' AS type, COUNT(*)::int AS count FROM timesheets WHERE project_id = ${projectId}
//     UNION ALL
//     SELECT 'task' AS type, COUNT(*)::int AS count FROM tasks WHERE project_id = ${projectId}
//     UNION ALL
//     SELECT 'standard' AS type, COUNT(*)::int AS count FROM standards WHERE project_id = ${projectId}
//     UNION ALL
//     SELECT 'scope' AS type, COUNT(*)::int AS count FROM scopes WHERE project_id = ${projectId}
//     UNION ALL
//     SELECT 'meeting' AS type, COUNT(*)::int AS count FROM meetings WHERE project_id = ${projectId}
//     UNION ALL
//     SELECT 'input' AS type, COUNT(*)::int AS count FROM inputs WHERE project_id = ${projectId}
//     UNION ALL
//     SELECT 'feedback' AS type, COUNT(*)::int AS count FROM project_feedback WHERE project_id = ${projectId}
//     UNION ALL
//     SELECT 'allocation' AS type, COUNT(*)::int AS count FROM allocations WHERE project_id = ${projectId}
//   `
//   return Object.fromEntries(rows.map(r => [r.type, r.count]))
// }

// // Backwards compatibility for existing call sites.
// export const countsByProject = getCountsByProject

/**
 * Item Repository - Data access for all generic items.
 */

import { prisma } from '../prisma'
import { ITEM_DELEGATES, flattenItem, toItemColumns } from '../tables'

interface Row {
  [key: string]: any
}

function delegateFor(type: string) {
  const delegate = ITEM_DELEGATES[type as keyof typeof ITEM_DELEGATES]
  if (!delegate) throw new Error(`Unknown item type: ${type}`)
  return delegate
}

export async function getByProject(projectId: number, type: string): Promise<Row[]> {
  const delegate = delegateFor(type) as any
  const rows = await delegate.findMany({
    where: { projectId },
    orderBy: { id: 'asc' },
  })
  return rows.map((r: any) => flattenItem(r))
}

export async function create(type: string, fields: Row, actor: string): Promise<number> {
  const { projectId, data } = toItemColumns(fields)
  const delegate = delegateFor(type) as any

  const created = await delegate.create({
    data: {
      projectId,
      data,
      createdBy: actor,
      updatedBy: actor,
    },
  })

  return created.id
}

export async function update(
  type: string,
  id: number,
  fields: Row,
  actor: string,
): Promise<void> {
  const { data } = toItemColumns(fields)
  const delegate = delegateFor(type) as any

  await delegate.update({
    where: { id },
    data: {
      data,
      updatedBy: actor,
      version: { increment: 1 },
    },
  })
}

export async function delete_(type: string, id: number): Promise<void> {
  const delegate = delegateFor(type) as any

  await delegate.delete({ where: { id } })

  await prisma.attachment.deleteMany({
    where: {
      entityType: type,
      entityId: id,
    },
  })
}

export async function getProjectId(
  type: string,
  id: number,
): Promise<number | undefined> {
  const delegate = delegateFor(type) as any

  const row = await delegate.findUnique({
    where: { id },
    select: { projectId: true },
  })

  return row?.projectId
}

export async function getData(
  type: string,
  id: number,
): Promise<Record<string, unknown> | undefined> {
  const delegate = delegateFor(type) as any
  const row = await delegate.findUnique({ where: { id } })

  return row ? (row.data as Record<string, unknown>) : undefined
}

// Cross-cutting reads

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
  const delegate = delegateFor('timesheet') as any
  return (await delegate.findMany()).map(flattenItem)
}

export async function allQc(): Promise<Row[]> {
  return (await prisma.qcItem.findMany()).map(flattenItem)
}

export async function allRfis(): Promise<Row[]> {
  return (await prisma.rfi.findMany()).map(flattenItem)
}

export async function getCountsByProject(
  projectId: number,
): Promise<Record<string, number>> {
  const rows = await prisma.$queryRaw<{ type: string; count: number }[]>`
    SELECT 'rfi' AS type, COUNT(*)::int AS count FROM rfis WHERE project_id = ${projectId}
    UNION ALL
    SELECT 'query' AS type, COUNT(*)::int AS count FROM queries WHERE project_id = ${projectId}
    UNION ALL
    SELECT 'dispatch' AS type, COUNT(*)::int AS count FROM dispatches WHERE project_id = ${projectId}
    UNION ALL
    SELECT 'wip' AS type, COUNT(*)::int AS count FROM wip_tasks WHERE project_id = ${projectId}
    UNION ALL
    SELECT 'qc' AS type, COUNT(*)::int AS count FROM qc_items WHERE project_id = ${projectId}
    UNION ALL
    SELECT 'timesheet' AS type, COUNT(*)::int AS count FROM timesheets WHERE project_id = ${projectId}
    UNION ALL
    SELECT 'task' AS type, COUNT(*)::int AS count FROM tasks WHERE project_id = ${projectId}
    UNION ALL
    SELECT 'standard' AS type, COUNT(*)::int AS count FROM standards WHERE project_id = ${projectId}
    UNION ALL
    SELECT 'scope' AS type, COUNT(*)::int AS count FROM scopes WHERE project_id = ${projectId}
    UNION ALL
    SELECT 'meeting' AS type, COUNT(*)::int AS count FROM meetings WHERE project_id = ${projectId}
    UNION ALL
    SELECT 'input' AS type, COUNT(*)::int AS count FROM inputs WHERE project_id = ${projectId}
    UNION ALL
    SELECT 'feedback' AS type, COUNT(*)::int AS count FROM project_feedback WHERE project_id = ${projectId}
    UNION ALL
    SELECT 'allocation' AS type, COUNT(*)::int AS count FROM allocations WHERE project_id = ${projectId}
  `

  return Object.fromEntries(rows.map((r) => [r.type, r.count]))
}

/**
 * Full-row data for every dashboard tab.
 *
 * Runs all dashboard queries in parallel on the server so the client only
 * performs a single API request instead of many sequential client → server →
 * database round trips.
 */
export async function getDashboardData(
  projectId: number,
): Promise<Record<string, Row[]>> {
  const types = [
    'rfi',
    'query',
    'dispatch',
    'wip',
    'qc',
    'task',
    'timesheet',
    'standard',
    'scope',
    'input',
  ] as const

  const results = await Promise.all(
    types.map((type) => getByProject(projectId, type)),
  )

  return Object.fromEntries(
    types.map((type, index) => [type, results[index]]),
  )
}

// Backwards compatibility for existing call sites.
export const countsByProject = getCountsByProject
