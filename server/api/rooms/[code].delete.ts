import { createError } from 'h3'
import { resolveAccess, logAccess } from '~/server/utils/auth'
import { deleteRoomCascade } from '~/server/utils/db'

/** 删除房间（仅盟主本人或管理员可删除，级联清理 days/tasks/shares/access_logs） */
export default defineEventHandler(async (event) => {
  const code = event.context.params?.code
  if (!code) throw createError({ statusCode: 400, statusMessage: '缺少房间码' })

  const ctx = await resolveAccess(event, code)
  if (!ctx.isOwner) throw createError({ statusCode: 403, statusMessage: '仅盟主或管理员可删除房间' })

  await logAccess(event, ctx, 'delete')
  await deleteRoomCascade(code)
  return { ok: true }
})
