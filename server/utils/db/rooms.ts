/**
 * 房间 的数据访问（含创建房间时自动生成主分享链接）。
 */
import { eq } from 'drizzle-orm'
import { db, ready, client, schema } from '~/server/db'
import { normalizeCode } from '~/server/utils/code'
import { genId } from './common'
import { createShare } from './shares'
import type { RoomWithShare } from './common'

export async function getRoomByCode(code: string): Promise<Room | undefined> {
  await ready()
  return db.select().from(schema.rooms).where(eq(schema.rooms.code, normalizeCode(code))).get()
}

/** 创建房间：归属盟主，自动生成一条「主分享」链接 */
export async function createRoom(code: string, name: string, ownerId: string): Promise<RoomWithShare> {
  await ready()
  const c = normalizeCode(code)
  const now = Date.now()
  const roomId = genId()
  await db.insert(schema.rooms).values({
    id: roomId,
    code: c,
    name: name || `${c} 同盟`,
    ownerId,
    createdAt: now,
    version: 0
  })
  const share = await createShare(roomId, '主分享', true)
  const room = (await db.select().from(schema.rooms).where(eq(schema.rooms.id, roomId)).get())!
  return { room, share }
}

/** 盟主房间列表（含分享数） */
export async function listRoomsByOwner(ownerId: string): Promise<{ code: string; name: string; shareCount: number }[]> {
  await ready()
  const rows = await client.execute({
    sql: `SELECT r.code, r.name,
                 (SELECT COUNT(*) FROM shares WHERE room_id = r.id) AS share_count
          FROM rooms r WHERE r.owner_id = ?
          ORDER BY r.created_at DESC`,
    args: [ownerId]
  })
  return rows.rows.map((r) => ({
    code: String(r.code),
    name: String(r.name),
    shareCount: Number(r.share_count)
  }))
}

/** 生成不重复的房间码：ALLY + 5 位大写字母数字 */
export async function genUniqueCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const c = 'ALLY' + Math.random().toString(36).slice(2, 7).toUpperCase()
    if (!(await getRoomByCode(c))) return c
  }
  return 'ALLY' + Date.now().toString(36).toUpperCase()
}
