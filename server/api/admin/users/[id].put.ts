import { readBody, createError } from 'h3'
import { requireAdmin } from '~/server/utils/auth'
import { disableUser } from '~/server/utils/db'

/** 后台：启用/禁用账号 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: '缺少参数' })
  const body = await readBody(event)
  const disabled = body.disabled === true || body.disabled === 'true' || body.disabled === 1
  await disableUser(id, disabled)
  return { ok: true }
})
