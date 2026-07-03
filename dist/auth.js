"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rankOf = rankOf;
exports.authRequired = authRequired;
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
// Tiers (high→low): Company Admin > Manager > Team Lead > Employee.
// Legacy 'Admin' = Team Lead, 'Member' = Employee.
const ROLE_RANK = {
    Employee: 1, Member: 1,
    'Team Lead': 2, Admin: 2,
    Manager: 3,
    'Company Admin': 4
};
function rankOf(role) {
    return ROLE_RANK[role] ?? 0;
}
function sign(u) {
    return jsonwebtoken_1.default.sign(u, env_1.env.jwtSecret, { expiresIn: env_1.env.jwtExpiresIn });
}
function authRequired(req, res, next) {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
        res.status(401).json({ ok: false, error: 'Not authenticated' });
        return;
    }
    try {
        req.user = jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
        next();
    }
    catch {
        res.status(401).json({ ok: false, error: 'Session expired — please sign in again' });
    }
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
                uid: user.id, mid: user.memberId, role: user.role,
                name: user.member?.name ?? email, email
            };
            res.json({ ok: true, data: { token: sign(authUser), user: authUser, mustReset: user.mustReset } });
        }
        catch (e) {
            res.status(400).json({ ok: false, error: String(e) });
        }
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
                res.status(401).json({ ok: false, error: 'Current password is incorrect' });
                return;
            }
            await prisma_1.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcryptjs_1.default.hash(next, 10), mustReset: false } });
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
            await prisma_1.prisma.user.upsert({
                where: { email },
                create: { email, passwordHash, role: member.role, memberId, mustReset: true },
                update: { passwordHash, role: member.role, memberId, mustReset: true }
            });
            res.json({ ok: true, data: { email } });
        }
        catch (e) {
            res.status(400).json({ ok: false, error: String(e) });
        }
    });
    return r;
}
//# sourceMappingURL=auth.js.map