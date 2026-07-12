import { createError } from 'h3'
import { resolveAccess, type AccessContext } from '~/server/utils/auth'
import { listShares, type Share } from '~/server/utils/db'

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

/** 盟主查看房间的全部分享链接 */
export default defineEventHandler(async (event) => {
  const code = event.context.params?.code
  if (!code) throw createError({ statusCode: 400, statusMessage: '缺少房间码' })
  const ctx: AccessContext = await resolveAccess(event, code)
  if (!ctx.isOwner) throw createError({ statusCode: 403, statusMessage: '仅盟主可管理分享' })
  const shares = await listShares(ctx.room.id)
  return { shares: shares.map((s) => mapShare(code, s)) }
})
