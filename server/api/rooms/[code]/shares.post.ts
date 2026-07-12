import { readBody, createError } from 'h3'
import { resolveAccess, type AccessContext } from '~/server/utils/auth'
import { createShare, type Share } from '~/server/utils/db'

function mapShare(code: string, s: Share) {
  return {
    id: s.id,
    name: s.name,
    token: s.token,
    url: `/r/${code}?token=${s.token}`,
    canEdit: !!s.canEdit,
    enabled: !!s.enabled,
    createdAt: s.createdAt
  }
}

/** 盟主新建一条分享链接（可指定分配名与是否可编辑） */
export default defineEventHandler(async (event) => {
  const code = event.context.params?.code
  if (!code) throw createError({ statusCode: 400, statusMessage: '缺少房间码' })
  const ctx: AccessContext = await resolveAccess(event, code)
  if (!ctx.isOwner) throw createError({ statusCode: 403, statusMessage: '仅盟主可管理分享' })

  const body = await readBody(event)
  const name = String(body.name || '').trim() || '分享'
  const canEdit = body.canEdit === true || body.canEdit === 'true' || body.canEdit === 1
  const share = await createShare(ctx.room.id, name, canEdit)
  return { share: mapShare(code, share) }
})
