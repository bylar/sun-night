import { createError } from 'h3'
import { resolveAccess, requireCanEdit, logAccess } from '~/server/utils/auth'
import { deleteBySeries, touch, loadDays } from '~/server/utils/db'
import { broadcast } from '~/server/utils/realtime'

/** 删除整个周期计划（按 seriesId 批量删除，需编辑权限） */
export default defineEventHandler(async (event) => {
  const { code } = event.context.params || {}
  if (!code) throw createError({ statusCode: 400, statusMessage: '缺少房间码' })
  const ctx = await resolveAccess(event, code)
  requireCanEdit(ctx)

  const body = await readBody(event)
  const seriesId = body.seriesId as string | undefined
  if (!seriesId) throw createError({ statusCode: 400, statusMessage: '缺少 seriesId' })

  await deleteBySeries(ctx.room.id, seriesId)
  await logAccess(event, ctx, 'delete_series')
  const version = await touch(ctx.room.id)
  broadcast(ctx.room.code, { type: 'tasks', payload: { days: await loadDays(ctx.room.id), version } })
  return { ok: true }
})
