import { createError } from 'h3'
import { resolveAccess } from '~/server/utils/auth'
import { loadDays } from '~/server/utils/db'

/**
 * 导出房间内容：将房间内全部事务（days + tasks）序列化为 JSON 再编码为 base64。
 * 数据仅含事务信息，不含房间标题 / 房间码等元信息，可跨账号导入。
 * 仅盟主（owner / admin 视作 owner）可调用。
 */
export default defineEventHandler(async (event) => {
  const code = event.context.params?.code
  if (!code) throw createError({ statusCode: 400, statusMessage: '缺少房间码' })
  const ctx = await resolveAccess(event, code)
  if (!ctx.isOwner) throw createError({ statusCode: 403, statusMessage: '仅盟主可导出房间' })

  const days = await loadDays(ctx.room.id)
  const json = JSON.stringify({ days })
  const data = Buffer.from(json, 'utf8').toString('base64')
  return { data }
})
