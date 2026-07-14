/**
 * 后台管理 的数据访问：账号与房间。
 */
import { eq, and } from 'drizzle-orm'
import { db, ready, client, schema } from '~/server/db'
import { getRoomByCode } from './rooms'

export interface AdminUserRow {
  id: string
  username: string
  disabled: boolean
  createdAt: number
  roomCount: number
}

export async function listAllUsers(): Promise<AdminUserRow[]> {
  await ready()
  const rows = await client.execute({
    sql: `SELECT u.id, u.username, u.disabled, u.created_at,
                 (SELECT COUNT(*) FROM rooms WHERE owner_id = u.id) AS room_count
          FROM users u ORDER BY u.created_at DESC`,
    args: []
  })
  return rows.rows.map((r) => ({
    id: String(r.id),
    username: String(r.username),
    disabled: !!Number(r.disabled),
    createdAt: Number(r.created_at),
    roomCount: Number(r.room_count)
  }))
}

export async function disableUser(id: string, disabled: boolean): Promise<void> {
  await ready()
  await db.update(schema.users).set({ disabled: disabled ? 1 : 0 }).where(eq(schema.users.id, id))
  if (disabled) {
    // 禁用即令其现有会话失效
    await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, id), eq(schema.sessions.kind, 'user')))
  }
}

/** 级联删除账号：删除其房间（及房间内的 days/tasks/shares）、会话与账号本身 */
export async function deleteUserCascade(id: string): Promise<void> {
  await ready()
  const roomRows = await db.select({ id: schema.rooms.id, code: schema.rooms.code }).from(schema.rooms).where(eq(schema.rooms.ownerId, id)).all()
  for (const r of roomRows) {
    await db.delete(schema.tasks).where(eq(schema.tasks.roomId, r.id))
    await db.delete(schema.days).where(eq(schema.days.roomId, r.id))
    await db.delete(schema.shares).where(eq(schema.shares.roomId, r.id))
    await db.delete(schema.accessLogs).where(eq(schema.accessLogs.roomCode, r.code))
  }
  await db.delete(schema.rooms).where(eq(schema.rooms.ownerId, id))
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, id))
  await db.delete(schema.users).where(eq(schema.users.id, id))
}

export interface AdminRoomRow {
  code: string
  name: string
  ownerName: string
  shareCount: number
  taskCount: number
  createdAt: number
}

export async function listAllRooms(): Promise<AdminRoomRow[]> {
  await ready()
  const rows = await client.execute({
    sql: `SELECT r.code, r.name, r.created_at,
                 (SELECT username FROM users WHERE id = r.owner_id) AS owner_name,
                 (SELECT COUNT(*) FROM shares WHERE room_id = r.id) AS share_count,
                 (SELECT COUNT(*) FROM tasks WHERE room_id = r.id) AS task_count
          FROM rooms r ORDER BY r.created_at DESC`,
    args: []
  })
  return rows.rows.map((r) => ({
    code: String(r.code),
    name: String(r.name),
    ownerName: r.owner_name == null ? '(已删除)' : String(r.owner_name),
    shareCount: Number(r.share_count),
    taskCount: Number(r.task_count),
    createdAt: Number(r.created_at)
  }))
}

/** 级联删除房间：删除 days/tasks/shares/access_logs 与房间记录 */
export async function deleteRoomCascade(code: string): Promise<void> {
  await ready()
  const room = await getRoomByCode(code)
  if (!room) throw new Error('房间不存在')
  await db.delete(schema.tasks).where(eq(schema.tasks.roomId, room.id))
  await db.delete(schema.days).where(eq(schema.days.roomId, room.id))
  await db.delete(schema.shares).where(eq(schema.shares.roomId, room.id))
  await db.delete(schema.accessLogs).where(eq(schema.accessLogs.roomCode, room.code))
  await db.delete(schema.rooms).where(eq(schema.rooms.id, room.id))
}
