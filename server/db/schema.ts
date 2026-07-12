/**
 * Drizzle ORM 模型（SQLite）。
 * 鉴权模型：盟主（账号密码）拥有创建房间的权限；其他人凭「分享链接 token」匿名访问。
 * 表结构（字段名 / 类型 / 约束）定义数据契约，运行时由 server/db/index.ts 的
 * CREATE TABLE IF NOT EXISTS 落地，也可用 `npx drizzle-kit` 基于此生成迁移脚本。
 */
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { TaskPriority, PavingMode, TaskTemplateId } from '@/types/gantt'

/** 盟主账号（账号密码制），唯一拥有创建房间权限的主体 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  /** 是否禁用（后台可禁用账号，禁用后无法登录且会话失效） */
  disabled: integer('disabled').notNull().default(0),
  createdAt: integer('created_at').notNull()
}, (t) => ({
  usernameUniq: uniqueIndex('users_username_uniq').on(t.username)
}))

/**
 * 登录会话：账号密码登录后签发，用于 Bearer 鉴权。
 * kind 区分普通盟主会话（user）与管理员会话（admin）。
 */
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  token: text('token').notNull(),
  userId: text('user_id').notNull(),
  kind: text('kind').notNull().default('user'),
  createdAt: integer('created_at').notNull()
}, (t) => ({
  tokenUniq: uniqueIndex('sessions_token_uniq').on(t.token)
}))

/** 访问日志：记录谁以何种身份对房间做了何种操作 */
export const accessLogs = sqliteTable('access_logs', {
  id: text('id').primaryKey(),
  roomCode: text('room_code').notNull(),
  identityType: text('identity_type').notNull(), // owner | guest | admin
  identityName: text('identity_name'),
  action: text('action').notNull(), // view | create_task | update_task | delete_task | reset
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at').notNull()
})

/** 房间（同盟作战室），以大写房间码唯一标识，归属某个盟主 */
export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull(),
  createdAt: integer('created_at').notNull(),
  version: integer('version').notNull().default(0)
}, (t) => ({
  codeUniq: uniqueIndex('rooms_code_uniq').on(t.code)
}))

/**
 * 分享链接：盟主为某人生成一条带 token 的链接，可单独设定：
 * - name：分配的名字（如「张三」）
 * - canEdit：是否有修改权限（0/1）
 * - enabled：是否启用（关闭则无法访问，0/1）
 */
export const shares = sqliteTable('shares', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull(),
  token: text('token').notNull(),
  name: text('name').notNull(),
  canEdit: integer('can_edit').notNull().default(1),
  enabled: integer('enabled').notNull().default(1),
  createdAt: integer('created_at').notNull()
}, (t) => ({
  tokenUniq: uniqueIndex('shares_token_uniq').on(t.token)
}))

/** 单天的数据容器（与前端 days[] 对应），按日期锚定 */
export const days = sqliteTable('days', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull(),
  date: text('date').notNull(),
  dayOfMonth: integer('day_of_month').notNull(),
  dayOfWeek: integer('day_of_week').notNull()
})

/** 任务项，归属到某一天的某一房间 */
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull(),
  dayId: text('day_id').notNull(),
  name: text('name').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time'),
  priority: text('priority').$type<TaskPriority>().notNull().default('medium'),
  description: text('description'),
  isHighlighted: integer('is_highlighted').notNull().default(0),
  pavingMode: text('paving_mode').$type<PavingMode>(),
  color: text('color'),
  icon: text('icon'),
  template: text('template').$type<TaskTemplateId>(),
  durationMin: integer('duration_min'),
  countMode: text('count_mode').$type<'count' | 'time'>(),
  countValue: integer('count_value'),
  minDurationMin: integer('min_duration_min'),
  stepMin: integer('step_min'),
  customEnd: integer('custom_end').notNull().default(1),
  count: integer('count')
})
