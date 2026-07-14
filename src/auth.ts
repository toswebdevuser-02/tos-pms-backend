/**
 * Authentication & authorization.
 *
 * - POST /auth/login   : email+password -> JWT (bcrypt verify)
 * - GET  /auth/me      : current user from token
 * - POST /auth/change-password : set a new password (used on first-login reset)
 * - POST /auth/users   : Company Admin creates/resets a member's login
 *
 * authRequired middleware verifies the JWT and sets req.user. requireRole(...)
 * gates routes by role. Identity for created_by/updated_by stamping comes from
 * the token (req.user), never the client.
 */
import { Router, Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { env } from './env'
import { getCachedJson, invalidateByPrefix } from './redis'


export interface AuthUser {
  uid: number
  mid: number | null
  role: string
  name: string
  email: string
  discipline?: string
}

// Augment Express Request with the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

// Tiers (high→low): Company Admin > Manager > Team Lead > Employee.
// Legacy 'Admin' = Team Lead, 'Member' = Employee.
const ROLE_RANK: Record<string, number> = {
  Employee: 1, Member: 1,
  'Project Lead': 2,
  'Team Lead': 3, Admin: 3,
  Manager: 4,
  'Company Admin': 5
}
export function rankOf(role: string): number {
  return ROLE_RANK[role] ?? 0
}

function signAccessToken(u: AuthUser): string {
  return jwt.sign(u, env.jwtSecret, { expiresIn: env.accessTokenExpiresIn as jwt.SignOptions['expiresIn'] })
}

function signRefreshToken(u: AuthUser): string {
  // Minimal payload — just enough to re-issue an access token.
  return jwt.sign({ uid: u.uid }, env.refreshSecret, { expiresIn: env.refreshTokenExpiresIn as jwt.SignOptions['expiresIn'] })
}

export async function authRequired(req: Request, res: Response, next: NextFunction): Promise<void> {
  const reqAny = req as any
  reqAny.perf = reqAny.perf ?? { tTotalStart: performance.now(), tAuthStart: undefined, tDbMs: 0 }

  const logAuth = (status: 'ok' | 'fail', extraError?: string) => {
    const p = reqAny.perf
    const headerMs = typeof p.tAuthHeaderMs === 'number' ? p.tAuthHeaderMs : 0
    const jwtMs = typeof p.tAuthJwtMs === 'number' ? p.tAuthJwtMs : 0
    const userQueryMs = typeof p.tAuthUserQueryMs === 'number' ? p.tAuthUserQueryMs : 0
    const buildUserMs = typeof p.tAuthBuildUserMs === 'number' ? p.tAuthBuildUserMs : 0
    const verifyTotalMs = typeof p.tAuthVerifyTotalMs === 'number' ? p.tAuthVerifyTotalMs : 0

    console.log(
      `[auth-perf] ${req.method} ${req.originalUrl}`,
      `| status=${status}`,
      `| Header=${headerMs.toFixed(1)}ms`,
      `| JWT Verify=${jwtMs.toFixed(1)}ms`,
      `| User Query=${userQueryMs.toFixed(1)}ms`,
      `| Build User=${buildUserMs.toFixed(1)}ms`,
      `| Verify Total=${verifyTotalMs.toFixed(1)}ms`,
      extraError ? `| Error=${extraError}` : ''
    )
  }

  const tVerifyStart = performance.now()

  // 1) Read Authorization header + parse token
  const tHeaderStart = performance.now()
  const header = req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  reqAny.perf.tAuthHeaderMs = performance.now() - tHeaderStart

  if (!token) {
    reqAny.perf.tAuthVerifyTotalMs = performance.now() - tVerifyStart
    logAuth('fail', 'Not authenticated (no bearer token)')
    res.status(401).json({ ok: false, error: 'Not authenticated' })
    return
  }

  // 2) JWT verify
  const tJwtStart = performance.now()
  let decoded: AuthUser
  try {
    decoded = jwt.verify(token, env.jwtSecret) as AuthUser
  } catch (e) {
    reqAny.perf.tAuthJwtMs = performance.now() - tJwtStart
    reqAny.perf.tAuthVerifyTotalMs = performance.now() - tVerifyStart
    logAuth('fail', 'Session expired')
    res.status(401).json({ ok: false, error: 'Session expired — please sign in again' })
    return
  }
  reqAny.perf.tAuthJwtMs = performance.now() - tJwtStart

  // 3) prisma.user.findUnique (cache-first)
  const tUserQueryStart = performance.now()
  let user: (typeof decoded) | (any)
  try {
    user = await getCachedJson(
      `authUser:${decoded.uid}`,
      300,
      () => prisma.user.findUnique({ where: { id: decoded.uid }, include: { member: true } }) as any
    )
  } catch (e) {
    reqAny.perf.tAuthUserQueryMs = performance.now() - tUserQueryStart
    reqAny.perf.tAuthVerifyTotalMs = performance.now() - tVerifyStart
    logAuth('fail', 'Authentication lookup failed')
    res.status(500).json({ ok: false, error: 'Authentication lookup failed' })
    return
  }
  reqAny.perf.tAuthUserQueryMs = performance.now() - tUserQueryStart


  if (!user) {
    reqAny.perf.tAuthVerifyTotalMs = performance.now() - tVerifyStart
    logAuth('fail', 'Account no longer exists')
    res.status(401).json({ ok: false, error: 'Account no longer exists' })
    return
  }


  // 4) Build req.user object
  const tBuildStart = performance.now()
  req.user = {
    uid: (user as any).id,
    mid: (user as any).memberId,
    role: (user as any).member?.role ?? (user as any).role,
    name: (user as any).member?.name ?? decoded.name ?? decoded.email,
    email: decoded.email,
    discipline: (user as any).member?.discipline ?? ''
  }
  reqAny.perf.tAuthBuildUserMs = performance.now() - tBuildStart

  // 5) Verify Total
  reqAny.perf.tAuthVerifyTotalMs = performance.now() - tVerifyStart
  reqAny.perf.tAuthEnd = performance.now()
  logAuth('ok')
  next()
}

export async function invalidateAuthCache(uid: number): Promise<void> {
  await invalidateByPrefix(`authUser:${uid}`)
}

export async function invalidateAuthCacheForMember(memberId: number): Promise<void> {
  const u = await prisma.user.findFirst({ where: { memberId }, select: { id: true } })
  if (u?.id) await invalidateAuthCache(u.id)
}

// Gate a route to one of the given roles (or higher rank).

export function requireRole(min: 'Admin' | 'Company Admin') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || rankOf(req.user.role) < rankOf(min)) {
      res.status(403).json({ ok: false, error: `Requires ${min} role` })
      return
    }
    next()
  }
}

export function buildAuthRouter(): Router {
  const r = Router()

  r.post('/login', async (req, res) => {
    try {
      const email = String(req.body.email ?? '').trim().toLowerCase()
      const password = String(req.body.password ?? '')
      const user = await prisma.user.findUnique({ where: { email }, include: { member: true } })
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        res.status(401).json({ ok: false, error: 'Invalid email or password' })
        return
      }
      const authUser: AuthUser = {
        uid: user.id, mid: user.memberId, role: user.member?.role ?? user.role,
        name: user.member?.name ?? email, email,
        discipline: user.member?.discipline ?? ''
      }

      const refreshToken = signRefreshToken(authUser)
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // true once served over HTTPS
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30d, matches refreshTokenExpiresIn
        path: '/auth' // scope the cookie to auth endpoints only
      })

      res.json({
        ok: true,
        data: { token: signAccessToken(authUser), user: authUser, mustReset: user.mustReset }
        // NOTE: no refresh token in the JSON body — it only ever lives in the cookie.
      })
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e) })
    }
  })

  r.post('/refresh', async (req, res) => {
    try {
      const token = req.cookies?.refreshToken
      if (!token) { res.status(200).json({ ok: false, error: 'No refresh token' }); return }

      let decoded: { uid: number }
      try {
        decoded = jwt.verify(token, env.refreshSecret) as { uid: number }
      } catch {
        res.clearCookie('refreshToken', { path: '/auth' })
        res.status(200).json({ ok: false, error: 'Refresh token invalid or expired' })
        return
      }

      const user = await prisma.user.findUnique({ where: { id: decoded.uid }, include: { member: true } })
      if (!user) { res.status(200).json({ ok: false, error: 'User not found' }); return }

      const authUser: AuthUser = {
        uid: user.id, mid: user.memberId, role: user.member?.role ?? user.role,
        name: user.member?.name ?? user.email, email: user.email,
        discipline: user.member?.discipline ?? ''
      }

      // Rotate the refresh token on every use — limits replay if one is ever stolen.
      const newRefreshToken = signRefreshToken(authUser)
      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/auth'
      })

      res.json({ ok: true, data: { token: signAccessToken(authUser) } })
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e) })
    }
  })

  r.post('/logout', (req, res) => {
    res.clearCookie('refreshToken', { path: '/auth' })
    res.json({ ok: true, data: {} })
  })

  r.get('/me', authRequired, (req, res) => {
    res.json({ ok: true, data: { user: req.user } })
  })

  r.post('/change-password', authRequired, async (req, res) => {
    try {
      const current = String(req.body.currentPassword ?? '')
      const next = String(req.body.newPassword ?? '')
      if (next.length < 6) {
        res.status(400).json({ ok: false, error: 'New password must be at least 6 characters' })
        return
      }
      const user = await prisma.user.findUnique({ where: { id: req.user!.uid } })
      if (!user || !(await bcrypt.compare(current, user.passwordHash))) {
        res.status(400).json({ ok: false, error: 'Current password is incorrect' })
        return
      }
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 10), mustReset: false } })
      await invalidateAuthCache(user.id)
      res.json({ ok: true, data: {} })
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e) })
    }
  })

  // Company Admin: create or reset a login for a member.
  r.post('/users', authRequired, requireRole('Company Admin'), async (req, res) => {
    try {
      const memberId = parseInt(String(req.body.memberId), 10)
      const password = String(req.body.password ?? '')
      const member = await prisma.member.findUnique({ where: { id: memberId } })
      if (!member || !member.email) {
        res.status(400).json({ ok: false, error: 'Member has no email to use as a login' })
        return
      }
      if (password.length < 6) {
        res.status(400).json({ ok: false, error: 'Password must be at least 6 characters' })
        return
      }
      const email = member.email.trim().toLowerCase()
      const passwordHash = await bcrypt.hash(password, 10)
      const upserted = await prisma.user.upsert({
        where: { email },
        create: { email, passwordHash, role: member.role, memberId, mustReset: false },
        update: { passwordHash, role: member.role, memberId, mustReset: false }
      })
      await invalidateAuthCache(upserted.id)
      res.json({ ok: true, data: { email } })
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e) })
    }
  })

  return r
}
