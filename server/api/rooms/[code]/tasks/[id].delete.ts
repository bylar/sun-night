import { createError } from 'h3'
import { resolveAccess, requireCanEdit, logAccess } from '~/server/utils/auth'
import { deleteTask, touch, loadDays } from '~/server/utils/db'
import { broadcast } from '~/server/utils/realtime'

/** 删除任务（需编辑权限） */
export default defineEventHandler(async (event) => {
  const { code, id } = event.context.params || {}
  if (!code || !id) throw createError({ statusCode: 400, statusMessage: '缺少参数' })
  const ctx = await resolveAccess(event, code)
  requireCanEdit(ctx)

  await deleteTask(ctx.room.id, id)
  await logAccess(event, ctx, 'delete_task')
  const version = await touch(ctx.room.id)
  broadcast(ctx.room.code, { type: 'tasks', payload: { days: await loadDays(ctx.room.id), version } })
  return { ok: true }
})
