import { requireAdmin } from '~/server/utils/auth'
import { listAllUsers } from '~/server/utils/db'

/** 后台：账号列表（含状态与房间数） */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { users: await listAllUsers() }
})
