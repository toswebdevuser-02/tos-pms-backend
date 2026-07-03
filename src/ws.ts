/**
 * Real-time broadcast. A WebSocket server rides on the same HTTP server at /ws.
 * After any successful mutation a route calls broadcast(event); every connected
 * client receives it and refreshes the affected view.
 *
 * Connections authenticate with the JWT via ?token=… (same secret as the API).
 */
import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import jwt from 'jsonwebtoken'
import { env } from './env'

export interface ChangeEvent {
  entity: 'project' | 'status' | 'item' | 'member' | 'projectMember' | 'attachment' | 'quote' | 'client'
  action: 'create' | 'update' | 'delete'
  type?: string // item type (rfi, query, …) when entity === 'item'
  projectId?: number
}

let wss: WebSocketServer | null = null

export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' })
  wss.on('connection', (socket: WebSocket, req) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    const token = url.searchParams.get('token') ?? ''
    try {
      jwt.verify(token, env.jwtSecret)
    } catch {
      socket.close(4001, 'unauthorized')
      return
    }
    socket.on('error', () => { /* ignore; close handles cleanup */ })
  })
}

export function broadcast(event: ChangeEvent): void {
  if (!wss) return
  const msg = JSON.stringify(event)
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg) } catch { /* drop */ }
    }
  }
}
