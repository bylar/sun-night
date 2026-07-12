/**
 * 数据访问层（SQLite + Drizzle）。
 * 鉴权模型：盟主（users/sessions）拥有房间（rooms），并向他人发放分享链接（shares）。
 * 所有读写走 server/db 的 Drizzle 实例，表结构见 server/db/schema.ts。
 * @libsql/client 为异步驱动，故以下辅助函数均为 async，调用方需 await。
 */
import { eq, and, asc, desc, sql } from 'drizzle-orm'
import { randomBytes, randomUUID } from 'node:crypto'
import { db, ready, client, schema } from '~/server/db'
import type { DayData, TaskItem } from '@/types/gantt'
import { dateOf } from '@/utils/ganttLayout'
import { normalizeCode } from './code'

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

// ====== 盟主账号 / 会话 ======
export async function findUserByUsername(username: string): Promise<User | undefined> {
  await ready()
  return db.select().from(schema.users).where(eq(schema.users.username, username)).get()
}

export async function createUser(username: string, passwordHash: string): Promise<User> {
  await ready()
  const user: User = { id: genId(), username, passwordHash, disabled: 0, createdAt: Date.now() }
  await db.insert(schema.users).values(user)
  return user
}

export async function getUserById(id: string): Promise<User | undefined> {
  await ready()
  return db.select().from(schema.users).where(eq(schema.users.id, id)).get()
}

export async function createSession(userId: string): Promise<Session> {
  await ready()
  const session: Session = { id: genId(), token: genToken(), userId, kind: 'user', createdAt: Date.now() }
  await db.insert(schema.sessions).values(session)
  return session
}

export async function getUserBySession(token: string): Promise<User | undefined> {
  await ready()
  const s = await db.select().from(schema.sessions).where(eq(schema.sessions.token, token)).get()
  if (!s || s.kind !== 'user') return undefined
  const u = await db.select().from(schema.users).where(eq(schema.users.id, s.userId)).get()
  if (!u || u.disabled) return undefined
  return u
}

/** 按 token 取原始会话（含 kind），用于区分盟主与管理员会话 */
export async function getSessionByToken(token: string): Promise<Session | undefined> {
  await ready()
  return db.select().from(schema.sessions).where(eq(schema.sessions.token, token)).get()
}

/** 创建管理员会话（kind=admin，userId 形如 admin:<username>） */
export async function createAdminSession(username: string): Promise<Session> {
  await ready()
  const session: Session = {
    id: genId(),
    token: genToken(),
    userId: `admin:${username}`,
    kind: 'admin',
    createdAt: Date.now()
  }
  await db.insert(schema.sessions).values(session)
  return session
}

export async function deleteSession(token: string): Promise<void> {
  await ready()
  await db.delete(schema.sessions).where(eq(schema.sessions.token, token))
}

// ====== 房间 ======
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

// ====== 分享链接 ======
export async function createShare(roomId: string, name: string, canEdit: boolean): Promise<Share> {
  await ready()
  const share: Share = {
    id: genId(),
    roomId,
    token: await genShareToken(),
    name: name || '分享',
    canEdit: canEdit ? 1 : 0,
    enabled: 1,
    createdAt: Date.now()
  }
  await db.insert(schema.shares).values(share)
  return share
}

export async function listShares(roomId: string): Promise<Share[]> {
  await ready()
  return db.select().from(schema.shares).where(eq(schema.shares.roomId, roomId)).all()
}

export async function getShareByToken(token: string): Promise<Share | undefined> {
  await ready()
  return db.select().from(schema.shares).where(eq(schema.shares.token, token)).get()
}

export async function getShareById(roomId: string, id: string): Promise<Share | undefined> {
  await ready()
  return db.select().from(schema.shares).where(and(eq(schema.shares.id, id), eq(schema.shares.roomId, roomId))).get()
}

export async function updateShare(
  id: string,
  patch: { name?: string; canEdit?: boolean; enabled?: boolean }
): Promise<void> {
  await ready()
  const set: Record<string, unknown> = {}
  if (patch.name !== undefined) set.name = patch.name
  if (patch.canEdit !== undefined) set.canEdit = patch.canEdit ? 1 : 0
  if (patch.enabled !== undefined) set.enabled = patch.enabled ? 1 : 0
  await db.update(schema.shares).set(set).where(eq(schema.shares.id, id))
}

export async function deleteShare(id: string): Promise<void> {
  await ready()
  await db.delete(schema.shares).where(eq(schema.shares.id, id))
}

// ====== 房间内容（days / tasks） ======
/** 写入后调用：版本号 +1（供 SSE 广播做幂等替换），返回最新版本 */
export async function touch(roomId: string): Promise<number> {
  await db.update(schema.rooms)
    .set({ version: sql`${schema.rooms.version} + 1` })
    .where(eq(schema.rooms.id, roomId))
  return (await db.select({ v: schema.rooms.version })
    .from(schema.rooms)
    .where(eq(schema.rooms.id, roomId))
    .get())?.v ?? 0
}

/** 按房间组装前端所需的 days[]（含每天的任务，按开始时间排序） */
export async function loadDays(roomId: string): Promise<DayData[]> {
  await ready()
  const dayRows = await db.select().from(schema.days).where(eq(schema.days.roomId, roomId)).all()
  const result: DayData[] = []
  for (const d of dayRows) {
    const taskRows = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.dayId, d.id))
      .orderBy(asc(schema.tasks.startTime))
      .all()
    result.push({
      date: d.date,
      dayOfMonth: d.dayOfMonth,
      dayOfWeek: d.dayOfWeek,
      tasks: taskRows.map(rowToTask)
    })
  }
  return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** 按 id 定位任务（校验归属房间） */
export async function getTask(roomId: string, taskId: string): Promise<TaskItem | undefined> {
  await ready()
  const row = await db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.roomId, roomId)))
    .get()
  return row ? rowToTask(row) : undefined
}

/** 找到（或新建）房间内指定日期的 day，返回 dayId */
async function ensureDayId(roomId: string, dateStr: string): Promise<string> {
  const day = await db
    .select()
    .from(schema.days)
    .where(and(eq(schema.days.roomId, roomId), eq(schema.days.date, dateStr)))
    .get()
  if (day) return day.id
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dObj = new Date(y || 1970, (mo || 1) - 1, d || 1)
  const dayId = genId()
  await db.insert(schema.days).values({
    id: dayId,
    roomId,
    date: dateStr,
    dayOfMonth: dObj.getDate(),
    dayOfWeek: dObj.getDay()
  })
  return dayId
}

/** 新增任务，按 startTime 的日期归属到对应那天（不存在则创建当天） */
export async function createTask(roomId: string, task: TaskItem): Promise<TaskItem> {
  await ready()
  const dateStr = dateOf(task.startTime) || todayStr()
  const dayId = await ensureDayId(roomId, dateStr)
  const item: TaskItem = { ...task, id: task.id || genId() }
  await db.insert(schema.tasks).values(taskToRow(item, roomId, dayId))
  return item
}

/** 局部更新任务，返回更新后的完整任务（startTime 改到别的日期时会迁移归属天） */
export async function patchTask(roomId: string, taskId: string, patch: Partial<TaskItem>): Promise<TaskItem | undefined> {
  await ready()
  const existing = await db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.roomId, roomId)))
    .get()
  if (!existing) return undefined
  const merged: TaskItem = { ...rowToTask(existing), ...patch, id: taskId }
  // 若开始日期变化，迁移到目标天
  let dayId = existing.dayId
  const newDate = dateOf(merged.startTime)
  if (newDate) {
    const oldDay = await db.select().from(schema.days).where(eq(schema.days.id, existing.dayId)).get()
    if (!oldDay || oldDay.date !== newDate) {
      dayId = await ensureDayId(roomId, newDate)
    }
  }
  await db.update(schema.tasks)
    .set(taskToRow(merged, roomId, dayId))
    .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.roomId, roomId)))
  return merged
}

/** 删除任务 */
export async function deleteTask(roomId: string, taskId: string): Promise<void> {
  await ready()
  await db.delete(schema.tasks)
    .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.roomId, roomId)))
}

/** 清空房间内的日程与任务数据（盟主权限由调用方校验） */
export async function resetDays(roomId: string): Promise<void> {
  await ready()
  await db.delete(schema.tasks).where(eq(schema.tasks.roomId, roomId))
  await db.delete(schema.days).where(eq(schema.days.roomId, roomId))
}

// ====== 访问日志 ======
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

// ====== 后台管理：账号 ======
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

// ====== 后台管理：房间 ======
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

// ====== 内部：行 ↔ 领域对象互转 ======
function rowToTask(r: typeof schema.tasks.$inferSelect): TaskItem {
  return {
    id: r.id,
    name: r.name,
    priority: r.priority ?? 'medium',
    startTime: r.startTime,
    endTime: r.endTime ?? undefined,
    description: r.description ?? undefined,
    isHighlighted: !!r.isHighlighted,
    pavingMode: r.pavingMode ?? null,
    color: r.color ?? undefined,
    icon: r.icon ?? undefined,
    template: r.template ?? undefined,
    durationMin: r.durationMin ?? undefined,
    countMode: r.countMode ?? undefined,
    countValue: r.countValue ?? undefined,
    minDurationMin: r.minDurationMin ?? undefined,
    stepMin: r.stepMin ?? undefined,
    customEnd: !!r.customEnd,
    count: r.count ?? undefined
  }
}

function taskToRow(t: TaskItem, roomId: string, dayId: string) {
  return {
    id: t.id,
    roomId,
    dayId,
    name: t.name,
    startTime: t.startTime,
    endTime: t.endTime ?? null,
    priority: t.priority ?? 'medium',
    description: t.description ?? null,
    isHighlighted: t.isHighlighted ? 1 : 0,
    pavingMode: t.pavingMode ?? null,
    color: t.color ?? null,
    icon: t.icon ?? null,
    template: t.template ?? null,
    durationMin: t.durationMin ?? null,
    countMode: t.countMode ?? null,
    countValue: t.countValue ?? null,
    minDurationMin: t.minDurationMin ?? null,
    stepMin: t.stepMin ?? null,
    customEnd: t.customEnd ? 1 : 0,
    count: t.count ?? null
  }
}
