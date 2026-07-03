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

export interface AuthUser {
  uid: number
  mid: number | null
  role: string
  name: string
  email: string
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
  'Team Lead': 2, Admin: 2,
  Manager: 3,
  'Company Admin': 4
}
export function rankOf(role: string): number {
  return ROLE_RANK[role] ?? 0
}

function sign(u: AuthUser): string {
  return jwt.sign(u, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] })
}

export function authRequired(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) {
    res.status(401).json({ ok: false, error: 'Not authenticated' })
    return
  }
  try {
    req.user = jwt.verify(token, env.jwtSecret) as AuthUser
    next()
  } catch {
    res.status(401).json({ ok: false, error: 'Session expired — please sign in again' })
  }
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
        uid: user.id, mid: user.memberId, role: user.role,
        name: user.member?.name ?? email, email
      }
      res.json({ ok: true, data: { token: sign(authUser), user: authUser, mustReset: user.mustReset } })
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e) })
    }
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
        res.status(401).json({ ok: false, error: 'Current password is incorrect' })
        return
      }
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 10), mustReset: false } })
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
      await prisma.user.upsert({
        where: { email },
        create: { email, passwordHash, role: member.role, memberId, mustReset: true },
        update: { passwordHash, role: member.role, memberId, mustReset: true }
      })
      res.json({ ok: true, data: { email } })
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e) })
    }
  })

  return r
}
