import express from 'express'
import cors from 'cors'
import http from 'http'
import fs from 'fs'
import { env } from './env'
import { prisma } from './prisma'
import { buildRouter } from './routes'
import { buildAuthRouter, authRequired } from './auth'
import { initWebSocket } from './ws'
import { runDigestTick } from './digest'
import { projectsPurgeExpired } from './store'

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

// Scheduled weekly/daily digest: check every 15 minutes (plus once shortly
// after startup). runDigestTick() self-guards on the configured schedule and a
// per-day "already sent" marker, so repeated checks are safe.
setInterval(() => { void runDigestTick() }, 15 * 60 * 1000)
setTimeout(() => { void runDigestTick() }, 15000)

// Recycle bin auto-purge: permanently delete projects soft-deleted > 15 days ago.
// Hourly check (plus once shortly after startup).
const purgeExpired = async (): Promise<void> => {
  try {
    const n = await projectsPurgeExpired(15)
    // eslint-disable-next-line no-console
    if (n > 0) console.log(`Recycle bin: purged ${n} expired project(s)`)
  } catch (e) { /* eslint-disable-next-line no-console */ console.error('purgeExpired failed', e) }
}
setInterval(() => { void purgeExpired() }, 60 * 60 * 1000)
setTimeout(() => { void purgeExpired() }, 30000)

async function shutdown(): Promise<void> {
  await prisma.$disconnect()
  server.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
