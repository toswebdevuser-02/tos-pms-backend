"use strict";
// /**
//  * Real-time broadcast. A WebSocket server rides on the same HTTP server at /ws.
//  * After any successful mutation a route calls broadcast(event); every connected
//  * client receives it and refreshes the affected view.
//  *
//  * Connections authenticate with the JWT via ?token=… (same secret as the API).
//  */
// import { WebSocketServer, WebSocket } from 'ws'
// import type { Server } from 'http'
// import jwt from 'jsonwebtoken'
// import { env } from './env'
// import { invalidateByPrefix } from './redis'
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initWebSocket = initWebSocket;
exports.broadcast = broadcast;
// export interface ChangeEvent {
//   entity: 'project' | 'status' | 'item' | 'member' | 'projectMember' | 'attachment' | 'quote' | 'client' | 'wip' | 'dispatch'
//   action: 'create' | 'update' | 'delete'
//   type?: string // item type (rfi, query, …) when entity === 'item'
//   projectId?: number
// }
// const CACHE_PREFIX: Partial<Record<ChangeEvent['entity'], string>> = {
//   project: 'projects:all',
//   status: 'statuses:all',
//   member: 'members:all',
//   projectMember: 'projectMembers:', // covers projectMembers:all and projectMembers:{id}
//   client: 'clients:all',
//   quote: 'quotes:all',
// }
// const ITEM_ALL_CACHE_KEY: Record<string, string> = {
//   wip: 'all:wip',
//   dispatch: 'all:dispatches',
//   task: 'all:tasks',
//   timesheet: 'all:timesheets',
//   qc: 'all:qc',
//   rfi: 'all:rfi',
// }
// async function invalidateEventCaches(event: ChangeEvent): Promise<void> {
//   if (event.entity === 'item' && event.type) {
//     if (event.projectId != null && !Number.isNaN(event.projectId)) {
//       await invalidateByPrefix(`items:${event.type}:${event.projectId}`)
//       // Counts cache used by ProjectDetail tabs.
//       await invalidateByPrefix(`items:counts:${event.projectId}`)
//     }
//     await invalidateByPrefix(`items:${event.type}:`)
//     const allKey = ITEM_ALL_CACHE_KEY[event.type]
//     if (allKey) await invalidateByPrefix(allKey)
//     return
//   }
//   if (event.entity === 'status' && event.projectId != null && !Number.isNaN(event.projectId)) {
//     // Status affects counts shown on dashboards.
//     await invalidateByPrefix(`items:counts:${event.projectId}`)
//   }
//   const prefix = CACHE_PREFIX[event.entity]
//   if (prefix) await invalidateByPrefix(prefix)
// }
// let wss: WebSocketServer | null = null
// let heartbeat: NodeJS.Timeout | null = null
// export function initWebSocket(server: Server): void {
//   wss = new WebSocketServer({ server, path: '/ws' })
//   wss.on('connection', (socket: WebSocket, req) => {
//     ;(socket as WebSocket & { isAlive?: boolean }).isAlive = true
//     const url = new URL(req.url ?? '', 'http://localhost')
//     const token = url.searchParams.get('token') ?? ''
//     try {
//       jwt.verify(token, env.jwtSecret)
//     } catch {
//       socket.close(4001, 'unauthorized')
//       return
//     }
//     socket.on('pong', () => { (socket as WebSocket & { isAlive?: boolean }).isAlive = true })
//     socket.on('error', () => { /* ignore; close handles cleanup */ })
//   })
//   if (heartbeat) clearInterval(heartbeat)
//   heartbeat = setInterval(() => {
//     if (!wss) return
//     for (const client of wss.clients) {
//       const tracked = client as WebSocket & { isAlive?: boolean }
//       if (tracked.isAlive === false) {
//         client.terminate()
//         continue
//       }
//       tracked.isAlive = false
//       try { client.ping() } catch { client.terminate() }
//     }
//   }, 30000)
// }
// export async function broadcast(event: ChangeEvent): Promise<void> {
//   // Keep Redis cache coherent with any WS-driven data consumers.
//   await invalidateEventCaches(event)
//   if (!wss) return
//   const msg = JSON.stringify(event)
//   for (const client of wss.clients) {
//     if (client.readyState === WebSocket.OPEN) {
//       try { client.send(msg) } catch { /* drop */ }
//     }
//   }
// }
/**
 * Real-time broadcast. A WebSocket server rides on the same HTTP server at /ws.
 * After any successful mutation a route calls broadcast(event); every connected
 * client receives it and refreshes the affected view.
 *
 * Connections authenticate with the JWT via ?token=… (same secret as the API).
 */
const ws_1 = require("ws");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("./env");
const redis_1 = require("./redis");
const CACHE_PREFIX = {
    project: 'projects:all',
    status: 'statuses:all',
    member: 'members:all',
    projectMember: 'projectMembers:', // covers projectMembers:all and projectMembers:{id}
    client: 'clients:all',
    quote: 'quotes:all',
};
const ITEM_ALL_CACHE_KEY = {
    wip: 'all:wip',
    dispatch: 'all:dispatches',
    task: 'all:tasks',
    timesheet: 'all:timesheets',
    qc: 'all:qc',
    rfi: 'all:rfi',
};
async function invalidateEventCaches(event) {
    if (event.entity === 'item' && event.type) {
        if (event.projectId != null && !Number.isNaN(event.projectId)) {
            await (0, redis_1.invalidateByPrefix)(`items:${event.type}:${event.projectId}`);
            // Counts + dashboard caches used by ProjectDetail tabs.
            await (0, redis_1.invalidateByPrefix)(`projectCounts:${event.projectId}`);
            await (0, redis_1.invalidateByPrefix)(`projectDashboard:${event.projectId}`);
        }
        await (0, redis_1.invalidateByPrefix)(`items:${event.type}:`);
        const allKey = ITEM_ALL_CACHE_KEY[event.type];
        if (allKey)
            await (0, redis_1.invalidateByPrefix)(allKey);
        await (0, redis_1.invalidateByPrefix)('reminders:raw');
        return;
    }
    if (event.entity === 'status' && event.projectId != null && !Number.isNaN(event.projectId)) {
        // Status affects counts + dashboard shown on ProjectDetail.
        await (0, redis_1.invalidateByPrefix)(`projectCounts:${event.projectId}`);
        await (0, redis_1.invalidateByPrefix)(`projectDashboard:${event.projectId}`);
    }
    const prefix = CACHE_PREFIX[event.entity];
    if (prefix)
        await (0, redis_1.invalidateByPrefix)(prefix);
}
let wss = null;
let heartbeat = null;
function initWebSocket(server) {
    wss = new ws_1.WebSocketServer({ server, path: '/ws' });
    wss.on('connection', (socket, req) => {
        ;
        socket.isAlive = true;
        const url = new URL(req.url ?? '', 'http://localhost');
        const token = url.searchParams.get('token') ?? '';
        try {
            jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
        }
        catch {
            socket.close(4001, 'unauthorized');
            return;
        }
        socket.on('pong', () => { socket.isAlive = true; });
        socket.on('error', () => { });
    });
    if (heartbeat)
        clearInterval(heartbeat);
    heartbeat = setInterval(() => {
        if (!wss)
            return;
        for (const client of wss.clients) {
            const tracked = client;
            if (tracked.isAlive === false) {
                client.terminate();
                continue;
            }
            tracked.isAlive = false;
            try {
                client.ping();
            }
            catch {
                client.terminate();
            }
        }
    }, 30000);
}
async function broadcast(event) {
    // Keep Redis cache coherent with any WS-driven data consumers.
    await invalidateEventCaches(event);
    if (!wss)
        return;
    const msg = JSON.stringify(event);
    for (const client of wss.clients) {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            try {
                client.send(msg);
            }
            catch { /* drop */ }
        }
    }
}
//# sourceMappingURL=ws.js.map