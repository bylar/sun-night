import { readBody, createError } from 'h3'
import { resolveAccess, requireCanEdit, logAccess } from '~/server/utils/auth'
import { patchTask, touch, loadDays } from '~/server/utils/db'
import { broadcast } from '~/server/utils/realtime'

/** 局部更新任务（需编辑权限） */
export default defineEventHandler(async (event) => {
  const { code, id } = event.context.params || {}
  if (!code || !id) throw createError({ statusCode: 400, statusMessage: '缺少参数' })
  const ctx = await resolveAccess(event, code)
  requireCanEdit(ctx)

  const body = await readBody(event)
  const found = await patchTask(ctx.room.id, id, body.patch || {})
  if (!found) throw createError({ statusCode: 404, statusMessage: '任务不存在' })

  await logAccess(event, ctx, 'update_task')
  if (!found) throw createError({ statusCode: 404, statusMessage: '任务不存在' })

  const version = await touch(ctx.room.id)
  broadcast(ctx.room.code, { type: 'tasks', payload: { days: await loadDays(ctx.room.id), version } })
  return { ok: true }
})
