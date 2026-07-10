/**
 * Settings Repository - Application settings (AppSetting).
 */

import { prisma } from '../prisma'
import { Prisma } from '@prisma/client'

interface Row {
  [key: string]: any
}

const DEFAULT_SMTP = { host: '', port: 587, secure: false, user: '', pass: '', from: '' }
const DEFAULT_DIGEST = { enabled: false, frequency: 'weekly', dayOfWeek: 1, hour: 8, recipients: [], lastSent: '' }

export async function get(): Promise<Row> {
  const row = await prisma.appSetting.findUnique({ where: { id: 1 } })
  const data = (row?.data ?? {}) as Row
  const smtp = { ...DEFAULT_SMTP, ...((data.smtp as Row) ?? {}) }
  const digest = { ...DEFAULT_DIGEST, ...((data.digest as Row) ?? {}) }
  return { current_member_id: (data.current_member_id as number) ?? null, smtp, digest }
}

export async function update(patch: Row): Promise<Row> {
  const existing = await prisma.appSetting.findUnique({ where: { id: 1 } })
  const cur = (existing?.data ?? {}) as Row
  const curSmtp = (cur.smtp as Row) ?? {}
  const curDigest = (cur.digest as Row) ?? {}
  const next = {
    ...cur,
    ...patch,
    smtp: { ...curSmtp, ...((patch.smtp as Row) ?? {}) },
    digest: { ...curDigest, ...((patch.digest as Row) ?? {}) }
  } as Prisma.InputJsonValue

  await prisma.appSetting.upsert({
    where: { id: 1 },
    create: { id: 1, data: next },
    update: { data: next }
  })
  return get()
}
