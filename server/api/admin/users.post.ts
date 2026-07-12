import { readBody, createError } from 'h3'
import { requireAdmin, hashPassword } from '~/server/utils/auth'
import { findUserByUsername, createUser } from '~/server/utils/db'

/** 后台：新增盟主账号 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody(event)
  const username = String(body.username || '').trim()
  const password = String(body.password || '')
  if (username.length < 2) throw createError({ statusCode: 400, statusMessage: '用户名至少 2 个字符' })
  if (password.length < 6) throw createError({ statusCode: 400, statusMessage: '密码至少 6 位' })
  if (await findUserByUsername(username)) throw createError({ statusCode: 409, statusMessage: '用户名已存在' })

  const user = await createUser(username, hashPassword(password))
  return { user: { id: user.id, username: user.username } }
})
