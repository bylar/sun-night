import { getBearerToken } from '~/server/utils/auth'
import { deleteSession } from '~/server/utils/db'

/** 后台退出登录：销毁 admin 会话 */
export default defineEventHandler(async (event) => {
  const token = getBearerToken(event)
  if (token) await deleteSession(token)
  return { ok: true }
})
