import { createError } from 'h3'
import { requireAdmin } from '~/server/utils/auth'
import { deleteRoomCascade } from '~/server/utils/db'

/** 后台：删除任意房间（级联删除内容） */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const code = event.context.params?.code
  if (!code) throw createError({ statusCode: 400, statusMessage: '缺少房间码' })
  try {
    await deleteRoomCascade(code)
  } catch (e: any) {
    throw createError({ statusCode: 404, statusMessage: e?.message || '房间不存在' })
  }
  return { ok: true }
})
