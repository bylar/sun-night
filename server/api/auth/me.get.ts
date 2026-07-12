import { createError } from 'h3'
import { getBearerToken } from '~/server/utils/auth'
import { getUserBySession } from '~/server/utils/db'

/** 当前登录的盟主信息（Bearer 鉴权） */
export default defineEventHandler(async (event) => {
  const token = getBearerToken(event)
  if (!token) throw createError({ statusCode: 401, statusMessage: '未登录' })
  const user = await getUserBySession(token)
  if (!user) throw createError({ statusCode: 401, statusMessage: '登录失效' })
  return { user: { id: user.id, username: user.username } }
})
