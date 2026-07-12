import { getQuery, createError } from 'h3'
import { getConfig } from '~/server/utils/config'
import { createAdminSession } from '~/server/utils/db'

/**
 * 自定义 URL 免密登录入口（auth_method = "url" 专用）。
 * 访问 /api/admin/url-login?key=<url_key> 校验通过后签发 admin 会话。
 * 注意：key 通过 query 传递，请确保该 URL 不被公开泄露。
 */
export default defineEventHandler(async (event) => {
  const cfg = getConfig()
  if (!cfg.admin.enabled) {
    throw createError({ statusCode: 403, statusMessage: '后台未启用' })
  }
  if (cfg.admin.authMethod !== 'url') {
    throw createError({ statusCode: 403, statusMessage: '当前未启用自定义 URL 登录方式' })
  }
  const q = getQuery(event)
  const key = typeof q.key === 'string' ? q.key : ''
  if (!key || key !== cfg.admin.urlKey) {
    throw createError({ statusCode: 401, statusMessage: '链接密钥错误' })
  }
  const session = await createAdminSession('url')
  return { token: session.token, admin: { username: 'admin' } }
})
