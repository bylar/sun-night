/**
 * 盟主账号 / 会话 的数据访问。
 */
import { eq } from 'drizzle-orm'
import { db, ready, schema } from '~/server/db'
import type { User, Session } from './common'
import { genId, genToken } from './common'

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
