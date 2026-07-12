import { resolveAccess } from '~/server/utils/auth'
import { loadDays } from '~/server/utils/db'

/** 读取房间任务数据（盟主或有效分享链接均可） */
export default defineEventHandler(async (event) => {
  const code = event.context.params?.code
  if (!code) return { days: [], version: 0 }
  const ctx = await resolveAccess(event, code)
  return { days: await loadDays(ctx.room.id), version: ctx.room.version }
})
