import { getBearerToken } from '~/server/utils/auth'
import { deleteSession } from '~/server/utils/db'

/** 退出登录：销毁当前会话 */
export default defineEventHandler(async (event) => {
  const token = getBearerToken(event)
  if (token) await deleteSession(token)
  return { ok: true }
})
