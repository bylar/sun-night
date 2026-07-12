import { createError } from 'h3'
import { resolveAccess, logAccess } from '~/server/utils/auth'
import { resetDays, touch, loadDays } from '~/server/utils/db'
import { broadcast } from '~/server/utils/realtime'

/** 重置为种子数据（仅盟主/管理员） */
export default defineEventHandler(async (event) => {
  const code = event.context.params?.code
  if (!code) throw createError({ statusCode: 400, statusMessage: '缺少房间码' })
  const ctx = await resolveAccess(event, code)
  if (!ctx.isOwner) throw createError({ statusCode: 403, statusMessage: '仅盟主可重置' })

  await resetDays(ctx.room.id)
  await logAccess(event, ctx, 'reset')
  const version = await touch(ctx.room.id)
  broadcast(ctx.room.code, { type: 'tasks', payload: { days: await loadDays(ctx.room.id), version } })
  return { ok: true }
})
