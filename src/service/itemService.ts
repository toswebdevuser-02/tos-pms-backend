// /**
//  * Item Service - Business logic for all generic items.
//  */

// import * as itemRepository from '../repository/itemRepository'
// import { broadcast } from '../ws'


// interface Row {
//   [key: string]: any
// }

// export async function getByProject(projectId: number, type: string): Promise<Row[]> {
//   return itemRepository.getByProject(projectId, type)
// }

// export async function getCountsByProject(projectId: number): Promise<Record<string, number>> {
//   return itemRepository.getCountsByProject(projectId)
// }

// export async function create(type: string, fields: Row, actor: string): Promise<number> {
//   const id = await itemRepository.create(type, fields, actor)
//   const projectId = Number(fields.project_id)
//   await broadcast({
//     entity: 'item',
//     action: 'create',
//     type,
//     projectId,
//   })
//   return id
// }


// export async function update(type: string, id: number, fields: Row, actor: string): Promise<void> {
//   await itemRepository.update(type, id, fields, actor)
//   const projectId = Number(fields.project_id)
//   await broadcast({
//     entity: 'item',
//     action: 'update',
//     type,
//     projectId,
//   })
// }


// export async function delete_(type: string, id: number, projectId?: number): Promise<void> {
//   await itemRepository.delete_(type, id)
//   await broadcast({
//     entity: 'item',
//     action: 'delete',
//     type,
//     projectId,
//   })
// }



// export async function getProjectId(type: string, id: number): Promise<number | undefined> {
//   return itemRepository.getProjectId(type, id)
// }

// export async function getData(type: string, id: number): Promise<Record<string, unknown> | undefined> {
//   return itemRepository.getData(type, id)
// }

// export async function allOpenWip(): Promise<Row[]> {
//   return itemRepository.allOpenWip()
// }
// export async function allDispatches(): Promise<Row[]> {
//   return itemRepository.allDispatches()
// }
// export async function allTasks(): Promise<Row[]> {
//   return itemRepository.allTasks()
// }
// export async function allTimesheets(): Promise<Row[]> {
//   return itemRepository.allTimesheets()
// }
// export async function allQc(): Promise<Row[]> {
//   return itemRepository.allQc()
// }
// export async function allRfis(): Promise<Row[]> {
//   return itemRepository.allRfis()
// }



/**
 * Item Service - Business logic for all generic items.
 */

import * as itemRepository from '../repository/itemRepository'
import { broadcast } from '../ws'

interface Row {
  [key: string]: any
}

export async function getByProject(projectId: number, type: string): Promise<Row[]> {
  return itemRepository.getByProject(projectId, type)
}

export async function getCountsByProject(projectId: number): Promise<Record<string, number>> {
  return itemRepository.getCountsByProject(projectId)
}

export async function getDashboardData(
  projectId: number,
): Promise<Record<string, Row[]>> {
  return itemRepository.getDashboardData(projectId)
}

export async function create(type: string, fields: Row, actor: string): Promise<number> {
  const id = await itemRepository.create(type, fields, actor)
  const projectId = Number(fields.project_id)

  await broadcast({
    entity: 'item',
    action: 'create',
    type,
    projectId,
  })

  return id
}

export async function update(
  type: string,
  id: number,
  fields: Row,
  actor: string,
): Promise<void> {
  await itemRepository.update(type, id, fields, actor)

  const projectId = Number(fields.project_id)

  await broadcast({
    entity: 'item',
    action: 'update',
    type,
    projectId,
  })
}

export async function delete_(
  type: string,
  id: number,
  projectId?: number,
): Promise<void> {
  await itemRepository.delete_(type, id)

  await broadcast({
    entity: 'item',
    action: 'delete',
    type,
    projectId,
  })
}

export async function getProjectId(
  type: string,
  id: number,
): Promise<number | undefined> {
  return itemRepository.getProjectId(type, id)
}

export async function getData(
  type: string,
  id: number,
): Promise<Record<string, unknown> | undefined> {
  return itemRepository.getData(type, id)
}

export async function allOpenWip(): Promise<Row[]> {
  return itemRepository.allOpenWip()
}

export async function allDispatches(): Promise<Row[]> {
  return itemRepository.allDispatches()
}

export async function allTasks(): Promise<Row[]> {
  return itemRepository.allTasks()
}

export async function allTimesheets(): Promise<Row[]> {
  return itemRepository.allTimesheets()
}

export async function allQc(): Promise<Row[]> {
  return itemRepository.allQc()
}

export async function allRfis(): Promise<Row[]> {
  return itemRepository.allRfis()
}