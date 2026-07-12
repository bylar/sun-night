import { readBody, createError } from 'h3'
import { resolveAccess, type AccessContext } from '~/server/utils/auth'
import { getShareById, updateShare } from '~/server/utils/db'

/** 盟主修改某条分享：改名 / 开关编辑权限 / 开关访问权限 */
export default defineEventHandler(async (event) => {
  const { code, id } = event.context.params || {}
  if (!code || !id) throw createError({ statusCode: 400, statusMessage: '缺少参数' })
  const ctx: AccessContext = await resolveAccess(event, code)
  if (!ctx.isOwner) throw createError({ statusCode: 403, statusMessage: '仅盟主可管理分享' })

  const existing = await getShareById(ctx.room.id, id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: '分享不存在' })

  const body = await readBody(event)
  const patch: { name?: string; canEdit?: boolean; enabled?: boolean } = {}
  if (typeof body.name === 'string') patch.name = body.name.trim() || existing.name
  if (body.canEdit !== undefined) patch.canEdit = body.canEdit === true || body.canEdit === 'true' || body.canEdit === 1
  if (body.enabled !== undefined) patch.enabled = body.enabled === true || body.enabled === 'true' || body.enabled === 1
  await updateShare(id, patch)
  return { ok: true }
})
