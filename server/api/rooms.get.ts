import { createError } from 'h3'
import { getBearerToken } from '~/server/utils/auth'
import { getUserBySession, listRoomsByOwner } from '~/server/utils/db'

/** 盟主房间列表（需登录） */
export default defineEventHandler(async (event) => {
  const token = getBearerToken(event)
  if (!token) throw createError({ statusCode: 401, statusMessage: '未登录' })
  const user = await getUserBySession(token)
  if (!user) throw createError({ statusCode: 401, statusMessage: '登录失效' })
  return { rooms: await listRoomsByOwner(user.id) }
})
