/**
 * 数据访问层公共部分：类型定义与通用生成器。
 * 其他实体模块（users/shares/rooms/content/accessLogs/admin）均从这里引入类型与 genId/genToken。
 */
import { eq } from 'drizzle-orm'
import { randomBytes, randomUUID } from 'node:crypto'
import { db, ready, schema } from '~/server/db'

export type User = typeof schema.users.$inferSelect
export type Session = typeof schema.sessions.$inferSelect
export type Room = typeof schema.rooms.$inferSelect
export type Share = typeof schema.shares.$inferSelect

export interface RoomWithShare {
  room: Room
  share: Share
}

export function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/** 登录会话 token（较长，用于 Bearer） */
export function genToken(): string {
  return randomUUID()
}

/** 分享链接 token（较短，便于放在 URL 上分发） */
export async function genShareToken(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const t = randomBytes(9).toString('base64url')
    const exists = await db.select({ id: schema.shares.id }).from(schema.shares).where(eq(schema.shares.token, t)).get()
    if (!exists) return t
  }
  return randomUUID()
}

/** 今天的日期字符串 "YYYY-MM-DD"，与前端 days[0] 锚定一致 */
export function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
