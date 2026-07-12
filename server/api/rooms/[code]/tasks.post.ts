import { readBody, createError } from 'h3'
import { resolveAccess, requireCanEdit, logAccess } from '~/server/utils/auth'
import { createTask, touch, loadDays } from '~/server/utils/db'
import { broadcast } from '~/server/utils/realtime'
import type { TaskItem } from '@/types/gantt'

/** 新增任务（需编辑权限） */
export default defineEventHandler(async (event) => {
  const code = event.context.params?.code
  if (!code) throw createError({ statusCode: 400, statusMessage: '缺少房间码' })
  const ctx = await resolveAccess(event, code)
  requireCanEdit(ctx)

  const body = await readBody(event)
  const task = body.task as TaskItem | undefined
  if (!task || !task.name) throw createError({ statusCode: 400, statusMessage: '任务名称必填' })

  const t = await createTask(ctx.room.id, task)
  await logAccess(event, ctx, 'create_task')
  const version = await touch(ctx.room.id)
  broadcast(ctx.room.code, { type: 'tasks', payload: { days: await loadDays(ctx.room.id), version } })
  return { ok: true, task: t }
})
