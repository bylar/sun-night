import { readBody, createError } from 'h3'
import { getBearerToken, getAdminFromSession } from '~/server/utils/auth'
import { getUserBySession, getUserById, createRoom, getRoomByCode, genUniqueCode } from '~/server/utils/db'
import { normalizeCode } from '~/server/utils/code'

/** 创建房间：盟主创建归属自己；管理员可指定 ownerId 为他人创建 */
export default defineEventHandler(async (event) => {
  const token = getBearerToken(event)
  if (!token) throw createError({ statusCode: 401, statusMessage: '请先登录' })

  const body = await readBody(event)
  const admin = await getAdminFromSession(event)
  let ownerId: string

  if (admin) {
    const claimed = String(body.ownerId || '').trim()
    if (!claimed) throw createError({ statusCode: 400, statusMessage: '管理员创建房间需指定盟主(ownerId)' })
    const u = await getUserById(claimed)
    if (!u) throw createError({ statusCode: 400, statusMessage: '指定的盟主不存在' })
    ownerId = claimed
  } else {
    const user = await getUserBySession(token)
    if (!user) throw createError({ statusCode: 401, statusMessage: '登录失效' })
    ownerId = user.id
  }

  const name = String(body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: '房间名必填' })

  let code = String(body.code || '').trim().toUpperCase()
  if (code) {
    if (await getRoomByCode(code)) throw createError({ statusCode: 409, statusMessage: '房间码已存在' })
  } else {
    code = await genUniqueCode()
  }

  const { room, share } = await createRoom(code, name, ownerId)
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
