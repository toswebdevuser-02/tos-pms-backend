"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rankOf = rankOf;
exports.authRequired = authRequired;
exports.invalidateAuthCache = invalidateAuthCache;
exports.invalidateAuthCacheForMember = invalidateAuthCacheForMember;
exports.requireRole = requireRole;
exports.buildAuthRouter = buildAuthRouter;
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
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("./prisma");
const env_1 = require("./env");
const redis_1 = require("./redis");
// Tiers (high→low): Company Admin > Manager > Team Lead > Employee.
// Legacy 'Admin' = Team Lead, 'Member' = Employee.
const ROLE_RANK = {
    Employee: 1, Member: 1,
    'Project Lead': 2,
    'Team Lead': 3, Admin: 3,
    Manager: 4,
    'Company Admin': 5
};
function rankOf(role) {
    return ROLE_RANK[role] ?? 0;
}
function signAccessToken(u) {
    return jsonwebtoken_1.default.sign(u, env_1.env.jwtSecret, { expiresIn: env_1.env.accessTokenExpiresIn });
}
function signRefreshToken(u) {
    // Minimal payload — just enough to re-issue an access token.
    return jsonwebtoken_1.default.sign({ uid: u.uid }, env_1.env.refreshSecret, { expiresIn: env_1.env.refreshTokenExpiresIn });
}
async function authRequired(req, res, next) {
    const reqAny = req;
    reqAny.perf = reqAny.perf ?? { tTotalStart: performance.now(), tAuthStart: undefined, tDbMs: 0 };
    const logAuth = (status, extraError) => {
        const p = reqAny.perf;
        const headerMs = typeof p.tAuthHeaderMs === 'number' ? p.tAuthHeaderMs : 0;
        const jwtMs = typeof p.tAuthJwtMs === 'number' ? p.tAuthJwtMs : 0;
        const userQueryMs = typeof p.tAuthUserQueryMs === 'number' ? p.tAuthUserQueryMs : 0;
        const buildUserMs = typeof p.tAuthBuildUserMs === 'number' ? p.tAuthBuildUserMs : 0;
        const verifyTotalMs = typeof p.tAuthVerifyTotalMs === 'number' ? p.tAuthVerifyTotalMs : 0;
        console.log(`[auth-perf] ${req.method} ${req.originalUrl}`, `| status=${status}`, `| Header=${headerMs.toFixed(1)}ms`, `| JWT Verify=${jwtMs.toFixed(1)}ms`, `| User Query=${userQueryMs.toFixed(1)}ms`, `| Build User=${buildUserMs.toFixed(1)}ms`, `| Verify Total=${verifyTotalMs.toFixed(1)}ms`, extraError ? `| Error=${extraError}` : '');
    };
    const tVerifyStart = performance.now();
    // 1) Read Authorization header + parse token
    const tHeaderStart = performance.now();
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    reqAny.perf.tAuthHeaderMs = performance.now() - tHeaderStart;
    if (!token) {
        reqAny.perf.tAuthVerifyTotalMs = performance.now() - tVerifyStart;
        logAuth('fail', 'Not authenticated (no bearer token)');
        res.status(401).json({ ok: false, error: 'Not authenticated' });
        return;
    }
    // 2) JWT verify
    const tJwtStart = performance.now();
    let decoded;
    try {
        decoded = jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
    }
    catch (e) {
        reqAny.perf.tAuthJwtMs = performance.now() - tJwtStart;
        reqAny.perf.tAuthVerifyTotalMs = performance.now() - tVerifyStart;
        logAuth('fail', 'Session expired');
        res.status(401).json({ ok: false, error: 'Session expired — please sign in again' });
        return;
    }
    reqAny.perf.tAuthJwtMs = performance.now() - tJwtStart;
    // 3) prisma.user.findUnique (cache-first)
    const tUserQueryStart = performance.now();
    let user;
    try {
        user = await (0, redis_1.getCachedJson)(`authUser:${decoded.uid}`, 300, () => prisma_1.prisma.user.findUnique({ where: { id: decoded.uid }, include: { member: true } }));
    }
    catch (e) {
        reqAny.perf.tAuthUserQueryMs = performance.now() - tUserQueryStart;
        reqAny.perf.tAuthVerifyTotalMs = performance.now() - tVerifyStart;
        logAuth('fail', 'Authentication lookup failed');
        res.status(500).json({ ok: false, error: 'Authentication lookup failed' });
        return;
    }
    reqAny.perf.tAuthUserQueryMs = performance.now() - tUserQueryStart;
    if (!user) {
        reqAny.perf.tAuthVerifyTotalMs = performance.now() - tVerifyStart;
        logAuth('fail', 'Account no longer exists');
        res.status(401).json({ ok: false, error: 'Account no longer exists' });
        return;
    }
    // 4) Build req.user object
    const tBuildStart = performance.now();
    req.user = {
        uid: user.id,
        mid: user.memberId,
        role: user.member?.role ?? user.role,
        name: user.member?.name ?? decoded.name ?? decoded.email,
        email: decoded.email,
        discipline: user.member?.discipline ?? ''
    };
    reqAny.perf.tAuthBuildUserMs = performance.now() - tBuildStart;
    // 5) Verify Total
    reqAny.perf.tAuthVerifyTotalMs = performance.now() - tVerifyStart;
    reqAny.perf.tAuthEnd = performance.now();
    logAuth('ok');
    next();
}
async function invalidateAuthCache(uid) {
    await (0, redis_1.invalidateByPrefix)(`authUser:${uid}`);
}
async function invalidateAuthCacheForMember(memberId) {
    const u = await prisma_1.prisma.user.findFirst({ where: { memberId }, select: { id: true } });
    if (u?.id)
        await invalidateAuthCache(u.id);
}
// Gate a route to one of the given roles (or higher rank).
function requireRole(min) {
    return (req, res, next) => {
        if (!req.user || rankOf(req.user.role) < rankOf(min)) {
            res.status(403).json({ ok: false, error: `Requires ${min} role` });
            return;
        }
        next();
    };
}
function buildAuthRouter() {
    const r = (0, express_1.Router)();
    r.post('/login', async (req, res) => {
        try {
            const email = String(req.body.email ?? '').trim().toLowerCase();
            const password = String(req.body.password ?? '');
            const user = await prisma_1.prisma.user.findUnique({ where: { email }, include: { member: true } });
            if (!user || !(await bcryptjs_1.default.compare(password, user.passwordHash))) {
                res.status(401).json({ ok: false, error: 'Invalid email or password' });
                return;
            }
            const authUser = {
                uid: user.id, mid: user.memberId, role: user.member?.role ?? user.role,
                name: user.member?.name ?? email, email,
                discipline: user.member?.discipline ?? ''
            };
            const refreshToken = signRefreshToken(authUser);
            res.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production', // true once served over HTTPS
                sameSite: 'strict',
                maxAge: 30 * 24 * 60 * 60 * 1000, // 30d, matches refreshTokenExpiresIn
                path: '/auth' // scope the cookie to auth endpoints only
            });
            res.json({
                ok: true,
                data: { token: signAccessToken(authUser), user: authUser, mustReset: user.mustReset }
                // NOTE: no refresh token in the JSON body — it only ever lives in the cookie.
            });
        }
        catch (e) {
            res.status(400).json({ ok: false, error: String(e) });
        }
    });
    r.post('/refresh', async (req, res) => {
        try {
            const token = req.cookies?.refreshToken;
            if (!token) {
                res.status(200).json({ ok: false, error: 'No refresh token' });
                return;
            }
            let decoded;
            try {
                decoded = jsonwebtoken_1.default.verify(token, env_1.env.refreshSecret);
            }
            catch {
                res.clearCookie('refreshToken', { path: '/auth' });
                res.status(200).json({ ok: false, error: 'Refresh token invalid or expired' });
                return;
            }
            const user = await prisma_1.prisma.user.findUnique({ where: { id: decoded.uid }, include: { member: true } });
            if (!user) {
                res.status(200).json({ ok: false, error: 'User not found' });
                return;
            }
            const authUser = {
                uid: user.id, mid: user.memberId, role: user.member?.role ?? user.role,
                name: user.member?.name ?? user.email, email: user.email,
                discipline: user.member?.discipline ?? ''
            };
            // Rotate the refresh token on every use — limits replay if one is ever stolen.
            const newRefreshToken = signRefreshToken(authUser);
            res.cookie('refreshToken', newRefreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 30 * 24 * 60 * 60 * 1000,
                path: '/auth'
            });
            res.json({ ok: true, data: { token: signAccessToken(authUser) } });
        }
        catch (e) {
            res.status(400).json({ ok: false, error: String(e) });
        }
    });
    r.post('/logout', (req, res) => {
        res.clearCookie('refreshToken', { path: '/auth' });
        res.json({ ok: true, data: {} });
    });
    r.get('/me', authRequired, (req, res) => {
        res.json({ ok: true, data: { user: req.user } });
    });
    r.post('/change-password', authRequired, async (req, res) => {
        try {
            const current = String(req.body.currentPassword ?? '');
            const next = String(req.body.newPassword ?? '');
            if (next.length < 6) {
                res.status(400).json({ ok: false, error: 'New password must be at least 6 characters' });
                return;
            }
            const user = await prisma_1.prisma.user.findUnique({ where: { id: req.user.uid } });
            if (!user || !(await bcryptjs_1.default.compare(current, user.passwordHash))) {
                res.status(400).json({ ok: false, error: 'Current password is incorrect' });
                return;
            }
            await prisma_1.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcryptjs_1.default.hash(next, 10), mustReset: false } });
            await invalidateAuthCache(user.id);
            res.json({ ok: true, data: {} });
        }
        catch (e) {
            res.status(400).json({ ok: false, error: String(e) });
        }
    });
    // Company Admin: create or reset a login for a member.
    r.post('/users', authRequired, requireRole('Company Admin'), async (req, res) => {
        try {
            const memberId = parseInt(String(req.body.memberId), 10);
            const password = String(req.body.password ?? '');
            const member = await prisma_1.prisma.member.findUnique({ where: { id: memberId } });
            if (!member || !member.email) {
                res.status(400).json({ ok: false, error: 'Member has no email to use as a login' });
                return;
            }
            if (password.length < 6) {
                res.status(400).json({ ok: false, error: 'Password must be at least 6 characters' });
                return;
            }
            const email = member.email.trim().toLowerCase();
            const passwordHash = await bcryptjs_1.default.hash(password, 10);
            const upserted = await prisma_1.prisma.user.upsert({
                where: { email },
                create: { email, passwordHash, role: member.role, memberId, mustReset: false },
                update: { passwordHash, role: member.role, memberId, mustReset: false }
            });
            await invalidateAuthCache(upserted.id);
            res.json({ ok: true, data: { email } });
        }
        catch (e) {
            res.status(400).json({ ok: false, error: String(e) });
        }
    });
    return r;
}
//# sourceMappingURL=auth.js.map