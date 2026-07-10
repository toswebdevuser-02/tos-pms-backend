import { PrismaClient } from '@prisma/client'

// Single shared Prisma client for the process.
export const prisma = new PrismaClient({
  log: [],
})

// Track DB time per request using Prisma middleware.
// NOTE: Some PrismaClient versions do not support `$use`.
// This code is guarded so the server can still boot.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyPrisma: any = prisma

if (typeof anyPrisma.$use === 'function') {
  anyPrisma.$use(async (params: any, next: any) => {
    const reqAny = (global as any).__activeReq
    if (!reqAny?.perf) return next(params)

    const start = performance.now()
    try {
      const result = await next(params)
      reqAny.perf.tDbMs = (reqAny.perf.tDbMs ?? 0) + (performance.now() - start)
      return result
    } catch (e) {
      reqAny.perf.tDbMs = (reqAny.perf.tDbMs ?? 0) + (performance.now() - start)
      throw e
    }
  })
}

