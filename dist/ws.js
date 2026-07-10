"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initWebSocket = initWebSocket;
exports.broadcast = broadcast;
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
        }
        await (0, redis_1.invalidateByPrefix)(`items:${event.type}:`);
        const allKey = ITEM_ALL_CACHE_KEY[event.type];
        if (allKey)
            await (0, redis_1.invalidateByPrefix)(allKey);
        return;
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