import { readBody, createError, getQuery } from 'h3'
import { getConfig } from '~/server/utils/config'
import { verifyAdminPassword } from '~/server/utils/auth'
import { createAdminSession } from '~/server/utils/db'

/**
 * 后台管理员登录，支持三种由 config.toml 配置的鉴权方式（三选一）：
 *   1. password：body { username, password } 校验账号密码列表。
 *   2. token：    body { token } 或 query ?token= 校验固定 token。
 *   3. url：      仅由 /api/admin/url-login?key= 入口进入（见 url-login.get.ts）。
 * 校验通过后签发 admin 会话。
 */
export default defineEventHandler(async (event) => {
  const cfg = getConfig()
  if (!cfg.admin.enabled) {
    throw createError({ statusCode: 403, statusMessage: '后台未启用' })
  }
  const method = cfg.admin.authMethod

  if (method === 'password') {
    if (cfg.admin.accounts.length === 0) {
      throw createError({ statusCode: 403, statusMessage: '未配置任何管理员账号' })
    }
    const body = await readBody(event)
    const username = String(body.username || '').trim()
    const password = String(body.password || '')
    const account = cfg.admin.accounts.find((a) => a.username === username)
    if (!account || !verifyAdminPassword(account.password, password)) {
      throw createError({ statusCode: 401, statusMessage: '管理员账号或密码错误' })
    }
    const session = await createAdminSession(username)
    return { token: session.token, admin: { username } }
  }

  if (method === 'token') {
    const body = await readBody(event).catch(() => ({}))
    const q = getQuery(event)
    const token = typeof body.token === 'string' && body.token ? body.token : typeof q.token === 'string' ? q.token : ''
    if (!token || token !== cfg.admin.token) {
      throw createError({ statusCode: 401, statusMessage: 'Token 错误' })
    }
    const session = await createAdminSession('token')
    return { token: session.token, admin: { username: 'admin' } }
  }

  throw createError({ statusCode: 403, statusMessage: '当前登录方式不支持账号密码/Token 登录，请使用自定义链接进入' })
})
