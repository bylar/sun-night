import { computed } from 'vue'

const ADMIN_KEY = 'sanguo_admin'

/**
 * 后台管理登录态（独立于盟主账号）。
 * 凭据来自服务端 config.toml 中配置的 [admin.accounts]，登录后签发 admin 会话 token，
 * 持久化于 localStorage，刷新后自动恢复。
 */
export const useAdmin = () => {
  const adminToken = useState<string>('admin_token', () => '')
  const adminUser = useState<{ username: string } | null>('admin_user', () => null)
  const adminPath = useState<string>('admin_path', () => 'admin')

  const loggedIn = computed(() => !!adminToken.value && !!adminUser.value)

  function setSession(token: string, username: string) {
    adminToken.value = token
    adminUser.value = { username }
    if (import.meta.client) localStorage.setItem(ADMIN_KEY, token)
  }
  function clearSession() {
    adminToken.value = ''
    adminUser.value = null
    if (import.meta.client) localStorage.removeItem(ADMIN_KEY)
  }

  /** 恢复后台登录态（刷新后） */
  async function restore(): Promise<boolean> {
    if (!adminToken.value && import.meta.client) {
      const t = localStorage.getItem(ADMIN_KEY)
      if (t) adminToken.value = t
    }
    if (!adminToken.value) return false
    try {
      const me = await $fetch<{ admin: { username: string } }>('/api/admin/me', {
        headers: { Authorization: `Bearer ${adminToken.value}` }
      })
      adminUser.value = me.admin
      return true
    } catch {
      clearSession()
      return false
    }
  }

  async function login(username: string, password: string) {
    const res = await $fetch<{ token: string; admin: { username: string } }>('/api/admin/login', {
      method: 'POST',
      body: { username, password }
    })
    setSession(res.token, res.admin.username)
    return res
  }

  /** Token 方式登录（auth_method = "token"）：直接凭配置中的固定 token 进入 */
  async function loginByToken(token: string) {
    const res = await $fetch<{ token: string; admin: { username: string } }>('/api/admin/login', {
      method: 'POST',
      body: { token }
    })
    setSession(res.token, res.admin.username)
    return res
  }

  /** 自定义 URL 方式登录（auth_method = "url"）：凭链接中的 key 免密进入 */
  async function loginByUrlKey(key: string) {
    const res = await $fetch<{ token: string; admin: { username: string } }>(
      `/api/admin/url-login?key=${encodeURIComponent(key)}`
    )
    setSession(res.token, res.admin.username)
    return res
  }

  /** 公开端点：返回当前后台登录方式，供前端渲染对应登录界面 */
  async function authMethod(): Promise<'password' | 'token' | 'url'> {
    const res = await $fetch<{ authMethod: 'password' | 'token' | 'url'; path: string }>('/api/admin/auth-method')
    if (res.path) adminPath.value = res.path
    return res.authMethod
  }

  /** 确保已拿到后台访问路径（供入口链接 / 跳转使用） */
  async function ensurePath(): Promise<string> {
    if (adminPath.value && adminPath.value !== 'admin') return adminPath.value
    try {
      const res = await $fetch<{ path: string }>('/api/admin/auth-method')
      if (res.path) adminPath.value = res.path
    } catch {
      /* 忽略，使用默认 admin */
    }
    return adminPath.value
  }

  async function logout() {
    try {
      await $fetch('/api/admin/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken.value}` }
      })
    } catch {
      /* 忽略 */
    }
    clearSession()
  }

  return { adminToken, adminUser, adminPath, loggedIn, setSession, clearSession, restore, login, loginByToken, loginByUrlKey, authMethod, ensurePath, logout }
}
