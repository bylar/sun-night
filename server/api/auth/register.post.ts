import { readBody, createError } from 'h3'
import { findUserByUsername, createUser, createSession } from '~/server/utils/db'
import { hashPassword } from '~/server/utils/auth'
import { getConfig } from '~/server/utils/config'

/** 盟主注册：账号密码制，成功后签发会话 token（受后台注册开关控制） */
export default defineEventHandler(async (event) => {
  const cfg = getConfig()
  if (!cfg.registration.enabled) {
    throw createError({ statusCode: 403, statusMessage: '注册已关闭，请联系管理员开通' })
  }
  const body = await readBody(event)
  const username = String(body.username || '').trim()
  const password = String(body.password || '')
  if (username.length < 2) throw createError({ statusCode: 400, statusMessage: '用户名至少 2 个字符' })
  if (password.length < 6) throw createError({ statusCode: 400, statusMessage: '密码至少 6 位' })
  if (await findUserByUsername(username)) throw createError({ statusCode: 409, statusMessage: '用户名已存在' })

  const user = await createUser(username, hashPassword(password))
  const session = await createSession(user.id)
  return { token: session.token, user: { id: user.id, username: user.username } }
})
