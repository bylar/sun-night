import { createError } from 'h3'
import { resolveAccess, logAccess } from '~/server/utils/auth'

/** 进入房间：解析访问权限（盟主 owner / 管理员 admin / 分享链接 guest），返回房间与权限上下文 */
export default defineEventHandler(async (event) => {
  const code = event.context.params?.code
  if (!code) throw createError({ statusCode: 400, statusMessage: '缺少房间码' })
  const ctx = await resolveAccess(event, code)
  await logAccess(event, ctx, 'view')
  return {
    room: { code: ctx.room.code, name: ctx.room.name },
    access: { mode: ctx.mode, isOwner: ctx.isOwner, canEdit: ctx.canEdit, isAdmin: ctx.isAdmin, name: ctx.name }
  }
})
