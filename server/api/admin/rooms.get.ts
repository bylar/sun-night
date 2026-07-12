import { requireAdmin } from '~/server/utils/auth'
import { listAllRooms } from '~/server/utils/db'

/** 后台：全部房间列表（含盟主名、分享数、任务数） */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { rooms: await listAllRooms() }
})
