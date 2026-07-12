import { readBody, createError } from 'h3'
import { findUserByUsername, createSession } from '~/server/utils/db'
import { verifyPassword } from '~/server/utils/auth'

/** 盟主登录：账号密码校验，成功后签发会话 token */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const username = String(body.username || '').trim()
  const password = String(body.password || '')
  const user = await findUserByUsername(username)
  if (!user || user.disabled || !verifyPassword(user.passwordHash, password)) {
    throw createError({ statusCode: 401, statusMessage: '用户名或密码错误' })
  }
  const session = await createSession(user.id)
  return { token: session.token, user: { id: user.id, username: user.username } }
})
