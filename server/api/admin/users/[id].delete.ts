import { createError } from 'h3'
import { requireAdmin } from '~/server/utils/auth'
import { deleteUserCascade } from '~/server/utils/db'

/** 后台：删除账号（级联删除其房间与会话） */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: '缺少参数' })
  await deleteUserCascade(id)
  return { ok: true }
})
