import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import http from 'http'
import fs from 'fs'
import { env } from './env'
import { prisma } from './prisma'
import { buildRouter } from './routes'
import { buildAuthRouter, authRequired } from './auth'
import { initWebSocket } from './ws'
import { runDigestTick } from './digest'
import { purgeExpired as projectsPurgeExpired } from './service/projectService'
import { initRedis } from './redis'

function newReqId(): string {
  return Math.random().toString(16).slice(2) + Date.now().toString(16)
}


const app = express()

const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(s => s.trim().replace(/\/$/, ''))
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}))

app.use(cookieParser())
app.use(express.json({ limit: '5mb' }))

// Prevent browsers from caching API responses. Without this, browsers may serve
// stale data after a WebSocket-triggered refetch, breaking real-time updates.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  next()
})

// Lightweight request log so we can see client traffic during development.
app.use((req, res, next) => {
  if (req.path !== '/health') console.log(`${new Date().toISOString().substring(11, 19)} ${req.method} ${req.originalUrl}`)

  // Request perf context (Auth / DB / Total)
  const reqAny = req as any
  reqAny.perf = {
    reqId: newReqId(),
    tTotalStart: performance.now(),
    tAuthStart: undefined as number | undefined,
    tDbMs: 0,
  }

  // Expose active request to Prisma middleware.
  ;(global as any).__activeReq = reqAny

  res.on('finish', () => {
    const p = (reqAny.perf ?? {}) as any
    const totalMs = performance.now() - (p.tTotalStart ?? performance.now())
    const authMs = typeof p.tAuthStart === 'number' && typeof p.tAuthEnd === 'number'
      ? p.tAuthEnd - p.tAuthStart
      : undefined
    console.log(
      `[perf] ${req.method} ${req.originalUrl}`,
      `| reqId=${p.reqId ?? 'n/a'}`,
      `| Total=${totalMs.toFixed(1)}ms`,
      authMs != null ? `| Auth=${authMs.toFixed(1)}ms` : '',
      `| DB=${(p.tDbMs ?? 0).toFixed(1)}ms`
    )

    // Clear active req after response.
    if ((global as any).__activeReq === reqAny) (global as any).__activeReq = undefined
  })


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

// Connect Redis (fail-open): the app must boot even when Redis is down.
;(async () => {
  try {
    await initRedis()
    // eslint-disable-next-line no-console
    console.log('[redis] connected')
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[redis] unavailable, continuing without Redis cache:', String(e))
  }

  server.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Project Tracker server listening on http://0.0.0.0:${env.port}`)
  })
})()

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
