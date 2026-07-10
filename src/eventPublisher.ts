export type DomainEvent = {
  entity:
    | 'project'
    | 'member'
    | 'projectMember'
    | 'status'
    | 'item'
    | 'attachment'
    | 'quote'
    | 'client'
    | 'wip'
    | 'dispatch'
  action: 'create' | 'update' | 'delete'
  projectId?: number
  type?: string
  data?: unknown
  timestamp: string
}

type Handler = (evt: DomainEvent) => Promise<void> | void

const handlers = new Map<string, Handler[]>()

export function subscribe(eventKey: string, handler: Handler): void {
  const arr = handlers.get(eventKey) ?? []
  arr.push(handler)
  handlers.set(eventKey, arr)
}

export async function publish(evt: DomainEvent): Promise<void> {
  const keys = [`${evt.entity}:${evt.action}`]
  const direct = handlers.get(keys[0]) ?? []
  await Promise.allSettled(direct.map((h) => Promise.resolve(h(evt))))
}

