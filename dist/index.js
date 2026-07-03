"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const fs_1 = __importDefault(require("fs"));
const env_1 = require("./env");
const prisma_1 = require("./prisma");
const routes_1 = require("./routes");
const auth_1 = require("./auth");
const ws_1 = require("./ws");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '5mb' }));
// Lightweight request log so we can see client traffic during development.
app.use((req, _res, next) => {
    if (req.path !== '/health')
        console.log(`${new Date().toISOString().substring(11, 19)} ${req.method} ${req.originalUrl}`);
    next();
});
// Ensure the attachment storage dir exists.
fs_1.default.mkdirSync(env_1.env.storageDir, { recursive: true });
// Health check — used by clients to confirm the server is reachable.
app.get('/health', async (_req, res) => {
    try {
        await prisma_1.prisma.$queryRaw `SELECT 1`;
        res.json({ ok: true, data: { status: 'up', time: new Date().toISOString() } });
    }
    catch (e) {
        res.status(503).json({ ok: false, error: `database unreachable: ${String(e)}` });
    }
});
// ── Routes ────────────────────────────────────────────────────────────────--
app.use('/auth', (0, auth_1.buildAuthRouter)()); // public: login; protected sub-routes self-guard
app.use('/api', auth_1.authRequired, (0, routes_1.buildRouter)()); // everything under /api needs a valid token
const server = http_1.default.createServer(app);
// Real-time updates ride on the same server at /ws.
(0, ws_1.initWebSocket)(server);
server.listen(env_1.env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Project Tracker server listening on http://0.0.0.0:${env_1.env.port}`);
});
async function shutdown() {
    await prisma_1.prisma.$disconnect();
    server.close();
    process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
//# sourceMappingURL=index.js.map