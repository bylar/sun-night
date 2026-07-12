import { createError } from 'h3'
import { resolveAccess, type AccessContext } from '~/server/utils/auth'
import { getShareById, deleteShare } from '~/server/utils/db'

/** 盟主删除一条分享链接 */
export default defineEventHandler(async (event) => {
  const { code, id } = event.context.params || {}
  if (!code || !id) throw createError({ statusCode: 400, statusMessage: '缺少参数' })
  const ctx: AccessContext = await resolveAccess(event, code)
  if (!ctx.isOwner) throw createError({ statusCode: 403, statusMessage: '仅盟主可管理分享' })

  const existing = await getShareById(ctx.room.id, id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: '分享不存在' })

  await deleteShare(id)
  return { ok: true }
})
