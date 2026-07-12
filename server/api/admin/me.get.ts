import { requireAdmin } from '~/server/utils/auth'

/** 当前登录的后台管理员信息 */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  return { admin: { username: admin.username } }
})
