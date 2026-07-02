import express from 'express'
import cors from 'cors'
import http from 'http'
import fs from 'fs'
import { env } from './env'
import { prisma } from './prisma'
import { buildRouter } from './routes'
import { buildAuthRouter, authRequired } from './auth'
import { initWebSocket } from './ws'

const app = express()
app.use(cors())
app.use(express.json({ limit: '5mb' }))

// Lightweight request log so we can see client traffic during development.
app.use((req, _res, next) => {
  if (req.path !== '/health') console.log(`${new Date().toISOString().substring(11, 19)} ${req.method} ${req.originalUrl}`)
  next()
})

// Ensure the attachment storage dir exists.
fs.mkdirSync(env.storageDir, { recursive: true })

// Health check — used by clients to confirm the server is reachable.
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ ok: true, data: { status: 'up', time: new Date().toISOString() } })
  } catch (e) {
    res.status(503).json({ ok: false, error: `database unreachable: ${String(e)}` })
  }
})

// ── Routes ────────────────────────────────────────────────────────────────--
app.use('/auth', buildAuthRouter())   // public: login; protected sub-routes self-guard
app.use('/api', authRequired, buildRouter())  // everything under /api needs a valid token

const server = http.createServer(app)

// Real-time updates ride on the same server at /ws.
initWebSocket(server)

server.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Project Tracker server listening on http://0.0.0.0:${env.port}`)
})

async function shutdown(): Promise<void> {
  await prisma.$disconnect()
  server.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
