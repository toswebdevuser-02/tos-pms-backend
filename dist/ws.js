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
let wss = null;
function initWebSocket(server) {
    wss = new ws_1.WebSocketServer({ server, path: '/ws' });
    wss.on('connection', (socket, req) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        const token = url.searchParams.get('token') ?? '';
        try {
            jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
        }
        catch {
            socket.close(4001, 'unauthorized');
            return;
        }
        socket.on('error', () => { });
    });
}
function broadcast(event) {
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