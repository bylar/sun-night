import { readBody, createError } from 'h3'
import { getBearerToken } from '~/server/utils/auth'
import {
  createRoom,
  getRoomByCode,
  genUniqueCode,
  getUserBySession,
  importDays
} from '~/server/utils/db'
import type { DayData } from '@/types/gantt'

/**
 * 导入房间：盟主粘贴 base64 导出的数据，创建一个新房间并写入全部事务。
 * 房间名 / 房间码由本次导入指定（不取自导出数据，导出数据不含这些元信息）。
 * 任务的全局唯一 id 在写入时重新生成，避免与其他房间主键冲突。
 */
export default defineEventHandler(async (event) => {
  const token = getBearerToken(event)
  if (!token) throw createError({ statusCode: 401, statusMessage: '请先登录' })
  const user = await getUserBySession(token)
  if (!user) throw createError({ statusCode: 401, statusMessage: '登录失效' })

  const body = await readBody(event)
  const raw = String(body?.data || '').trim()
  if (!raw) throw createError({ statusCode: 400, statusMessage: '缺少导入数据' })

  // base64 解码（容忍换行/空格），再解析 JSON
  let parsed: any
  try {
    const cleaned = raw.replace(/\s+/g, '')
    parsed = JSON.parse(Buffer.from(cleaned, 'base64').toString('utf8'))
  } catch {
    throw createError({ statusCode: 400, statusMessage: '数据无法解析（不是有效的 base64/JSON）' })
  }

  const days = Array.isArray(parsed?.days) ? (parsed.days as DayData[]) : null
  if (!days) throw createError({ statusCode: 400, statusMessage: '数据结构无效：缺少 days' })
  // 结构校验：每天须含 tasks 数组，且每个任务必须有名称
  for (const d of days) {
    if (!d || !Array.isArray(d.tasks)) throw createError({ statusCode: 400, statusMessage: '日期数据格式不正确' })
    for (const t of d.tasks) {
      if (!t || !t.name) throw createError({ statusCode: 400, statusMessage: '存在缺少名称的任务' })
    }
  }

  const name = String(body?.name || '').trim() || '导入的同盟'
  let code = String(body?.code || '').trim().toUpperCase()
  if (code) {
    if (await getRoomByCode(code)) throw createError({ statusCode: 409, statusMessage: '房间码已存在' })
  } else {
    code = await genUniqueCode()
  }

  const { room, share } = await createRoom(code, name, user.id)
  await importDays(room.id, days)

  return {
    room: { code: room.code, name: room.name },
    share: {
      id: share.id,
      name: share.name,
      token: share.token,
      url: `/r/${room.code}?token=${share.token}`,
      canEdit: !!share.canEdit,
      enabled: !!share.enabled,
      createdAt: share.createdAt
    }
  }
})
