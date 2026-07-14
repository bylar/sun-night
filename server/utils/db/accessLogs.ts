/**
 * 访问日志 的数据访问。
 */
import { eq, and, desc } from 'drizzle-orm'
import { db, ready, schema } from '~/server/db'
import { genId } from './common'

export interface AccessLogRow {
  id: string
  roomCode: string
  identityType: string
  identityName: string | null
  action: string
  ip: string | null
  userAgent: string | null
  createdAt: number
}

export async function insertAccessLog(
  roomCode: string,
  identityType: string,
  identityName: string,
  action: string,
  ip: string,
  userAgent: string
): Promise<void> {
  await ready()
  await db.insert(schema.accessLogs).values({
    id: genId(),
    roomCode,
    identityType,
    identityName: identityName || null,
    action,
    ip: ip || null,
    userAgent: userAgent || null,
    createdAt: Date.now()
  })
}

export async function listAccessLogs(opts: {
  roomCode?: string
  identityType?: string
  action?: string
  limit?: number
}): Promise<AccessLogRow[]> {
  await ready()
  const conditions: any[] = []
  if (opts.roomCode) conditions.push(eq(schema.accessLogs.roomCode, opts.roomCode))
  if (opts.identityType) conditions.push(eq(schema.accessLogs.identityType, opts.identityType))
  if (opts.action) conditions.push(eq(schema.accessLogs.action, opts.action))
  const base = db.select().from(schema.accessLogs)
  const limit = opts.limit ?? 200
  if (conditions.length) {
    return base
      .where(and(...conditions))
      .orderBy(desc(schema.accessLogs.createdAt))
      .limit(limit)
      .all()
  }
  return base.orderBy(desc(schema.accessLogs.createdAt)).limit(limit).all()
}
