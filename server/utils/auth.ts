import { createError, getHeader, getQuery, getRequestIP } from 'h3'
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  getRoomByCode,
  getUserBySession,
  getShareByToken,
  getSessionByToken,
  insertAccessLog,
  type Room,
  type User
} from './db'
import type { AccessMode } from '@/types/gantt'

/** 密码哈希：salt + scrypt，存储为 "saltHex:hashHex" */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

/** 校验密码（恒定时间比较，防时序攻击） */
export function verifyPassword(stored: string, password: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const h = scryptSync(password, Buffer.from(salt, 'hex'), 64)
  try {
    return timingSafeEqual(h, Buffer.from(hash, 'hex'))
  } catch {
    return false
  }
}

/** 校验配置中的管理员密码（支持明文或 "scrypt:" 哈希） */
export function verifyAdminPassword(stored: string, input: string): boolean {
  if (stored.startsWith('scrypt:')) return verifyPassword(stored.slice('scrypt:'.length), input)
  return stored === input
}

/**
 * 从 Authorization 头取 Bearer token（盟主/管理员登录态）。
 * 也支持 query.session（EventSource 无法自定义 header，SSE 走此路）。
 */
export function getBearerToken(event: any): string | null {
  const h = getHeader(event, 'authorization')
  if (typeof h === 'string' && h.startsWith('Bearer ')) return h.slice(7)
  const q = getQuery(event).session
  if (typeof q === 'string' && q) return q
  return null
}

/** 从 URL query 取分享 token（匿名访客） */
export function getShareToken(event: any): string | null {
  const q = getQuery(event).token
  return typeof q === 'string' && q ? q : null
}

/** 若请求带有效盟主会话，返回该用户，否则返回 null（不抛错） */
async function getOwnerFromSession(event: any): Promise<User | null> {
  const token = getBearerToken(event)
  if (!token) return null
  return (await getUserBySession(token)) ?? null
}

/** 若请求带有效管理员会话，返回 { username }，否则返回 null */
export async function getAdminFromSession(event: any): Promise<{ username: string } | null> {
  const token = getBearerToken(event)
  if (!token) return null
  const s = await getSessionByToken(token)
  if (!s || s.kind !== 'admin') return null
  const username = s.userId.startsWith('admin:') ? s.userId.slice('admin:'.length) : s.userId
  return { username }
}

/** 校验当前请求是否为管理员会话，否则抛 401 */
export async function requireAdmin(event: any): Promise<{ username: string }> {
  const admin = await getAdminFromSession(event)
  if (!admin) throw createError({ statusCode: 401, statusMessage: '请先登录后台' })
  return admin
}

/** 房间访问上下文：区分盟主（owner）/分享访客（guest）/管理员（admin 视作 owner） */
export interface AccessContext {
  room: Room
  mode: AccessMode
  isOwner: boolean
  canEdit: boolean
  isAdmin?: boolean
  /** guest 模式下的分享分配名 */
  name?: string
  /** owner 模式下的盟主用户名（用于访问日志） */
  ownerName?: string
  /** admin 模式下的管理员用户名（用于访问日志） */
  adminName?: string
  shareId?: string
}

/**
 * 解析对某房间的访问权限，统一处理三种身份：
 * 1. 管理员会话（Bearer，kind=admin）→ 视作 owner，完全权限（可管理任意房间）。
 * 2. 盟主会话（Bearer）且该房间归属自己 → owner，完全权限。
 * 3. 分享链接 token（?token=）→ 校验启用状态与编辑权限 → guest。
 * 三者皆无或校验失败 → 抛 401/403。
 */
export async function resolveAccess(event: any, code: string): Promise<AccessContext> {
  const room = await getRoomByCode(code)
  if (!room) throw createError({ statusCode: 404, statusMessage: '房间不存在' })

  const admin = await getAdminFromSession(event)
  if (admin) {
    return { room, mode: 'owner', isOwner: true, canEdit: true, isAdmin: true, adminName: admin.username }
  }

  const owner = await getOwnerFromSession(event)
  if (owner && owner.id === room.ownerId) {
    return { room, mode: 'owner', isOwner: true, canEdit: true, ownerName: owner.username }
  }

  const token = getShareToken(event)
  if (token) {
    const share = await getShareByToken(token)
    if (!share || share.roomId !== room.id) {
      throw createError({ statusCode: 401, statusMessage: '分享链接无效' })
    }
    if (!share.enabled) {
      throw createError({ statusCode: 403, statusMessage: '该分享链接已关闭访问' })
    }
    return {
      room,
      mode: 'guest',
      isOwner: false,
      canEdit: !!share.canEdit,
      name: share.name,
      shareId: share.id
    }
  }

  throw createError({ statusCode: 401, statusMessage: '请使用分享链接或盟主账号访问' })
}

/** 校验当前访问是否可编辑，否则抛 403 */
export function requireCanEdit(ctx: AccessContext): void {
  if (!ctx.canEdit) throw createError({ statusCode: 403, statusMessage: '该分享链接无修改权限' })
}

/**
 * 记录一次房间访问/操作到 access_logs。
 * 身份由 ctx 推导：admin > owner > guest。
 */
export async function logAccess(event: any, ctx: AccessContext, action: string): Promise<void> {
  const type = ctx.isAdmin ? 'admin' : ctx.isOwner ? 'owner' : 'guest'
  const name = ctx.isAdmin
    ? ctx.adminName || 'admin'
    : ctx.isOwner
      ? ctx.ownerName || ''
      : ctx.name || ''
  const ip = getRequestIP(event) || ''
  const ua = getHeader(event, 'user-agent') || ''
  await insertAccessLog(ctx.room.code, type, name, action, ip, ua)
}
