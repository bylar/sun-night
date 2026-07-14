/**
 * SQLite 连接与 Drizzle 实例（单例）。
 * 文件落在 .data/app.db；首次请求前按 schema 建表（幂等）。
 * 使用 @libsql/client（WASM/预编译原生桥），无需本地编译，跨平台一致。
 *
 * 鉴权模型：users(盟主) / sessions(登录态) / rooms(房间) / shares(分享链接)
 *           / days / tasks。旧的 members 表已废弃，这里显式 DROP 清理。
 */
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdirSync } from 'node:fs'
import * as schema from './schema'

const DATA_DIR = '.data'
mkdirSync(DATA_DIR, { recursive: true })

const client = createClient({ url: 'file:.data/app.db' })
export const db = drizzle(client, { schema })
export { schema, client }

// 与 server/db/schema.ts 保持一致的建表语句（CREATE TABLE IF NOT EXISTS 幂等）
const DDL = [
  // 清理旧版本遗留的 members 表（RBAC 模型已废弃）
  `DROP TABLE IF EXISTS members`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_username_uniq ON users(username)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_uniq ON sessions(token)`,
  `CREATE TABLE IF NOT EXISTS access_logs (
    id TEXT PRIMARY KEY,
    room_code TEXT NOT NULL,
    identity_type TEXT NOT NULL,
    identity_name TEXT,
    action TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS rooms_code_uniq ON rooms(code)`,
  `CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    token TEXT NOT NULL,
    name TEXT NOT NULL,
    can_edit INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS shares_token_uniq ON shares(token)`,
  `CREATE TABLE IF NOT EXISTS days (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    date TEXT NOT NULL,
    day_of_month INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    day_id TEXT NOT NULL,
    name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    description TEXT,
    is_highlighted INTEGER NOT NULL DEFAULT 0,
    paving_mode TEXT,
    color TEXT,
    icon TEXT,
    template TEXT,
    series_id TEXT,
    duration_min INTEGER,
    count_mode TEXT,
    count_value INTEGER,
    min_duration_min INTEGER,
    step_min INTEGER,
    custom_end INTEGER NOT NULL DEFAULT 1,
    count INTEGER
  )`
]

// 为已有数据库补齐后续新增的列（幂等：列已存在时忽略报错）
const ALTERS = [
  `ALTER TABLE tasks ADD COLUMN series_id TEXT`
]

let schemaReady: Promise<void> | null = null

/** 确保表已创建（幂等，仅首次执行一次） */
export function ready(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const sql of DDL) {
        await client.execute(sql)
      }
      for (const sql of ALTERS) {
        try {
          await client.execute(sql)
        } catch {
          /* 列已存在则忽略 */
        }
      }
    })()
  }
  return schemaReady
}
