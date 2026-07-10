"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
// Single shared Prisma client for the process.
exports.prisma = new client_1.PrismaClient({
    log: [],
});
// Track DB time per request using Prisma middleware.
// NOTE: Some PrismaClient versions do not support `$use`.
// This code is guarded so the server can still boot.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyPrisma = exports.prisma;
if (typeof anyPrisma.$use === 'function') {
    anyPrisma.$use(async (params, next) => {
        const reqAny = global.__activeReq;
        if (!reqAny?.perf)
            return next(params);
        const start = performance.now();
        try {
            const result = await next(params);
            reqAny.perf.tDbMs = (reqAny.perf.tDbMs ?? 0) + (performance.now() - start);
            return result;
        }
        catch (e) {
            reqAny.perf.tDbMs = (reqAny.perf.tDbMs ?? 0) + (performance.now() - start);
            throw e;
        }
    });
}
//# sourceMappingURL=prisma.js.map