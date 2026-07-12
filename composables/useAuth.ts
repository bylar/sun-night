import { computed } from 'vue'
import type { AccessMode, OwnerUser } from '@/types/gantt'

const SESSION_KEY = 'sanguo_session'

/** 当前进入的房间访问上下文 */
export interface CurrentRoom {
  code: string
  name: string
  mode: AccessMode
  isOwner: boolean
  canEdit: boolean
  /** 是否以后台管理员身份进入（用 admin 会话鉴权） */
  adminMode?: boolean
  /** guest 模式下用于后续请求的分享 token；owner 模式为 null */
  shareToken: string | null
  /** guest 模式下的分享分配名 */
  guestName?: string
}

/**
 * 全局登录态（盟主账号 + 当前房间访问上下文）。
 * - 盟主：账号密码登录，sessionToken 持久化到 localStorage，刷新后自动恢复。
 * - 房间：每次进入按 URL（?token）或登录态（Bearer）向服务端 resolve，得到 mode/canEdit。
 */
export const useAuth = () => {
  const sessionToken = useState<string>('auth_session', () => '')
  const currentUser = useState<OwnerUser | null>('auth_user', () => null)
  const currentRoom = useState<CurrentRoom | null>('auth_room', () => null)

  const loggedIn = computed(() => !!sessionToken.value && !!currentUser.value)
  const canEdit = computed(() => currentRoom.value?.canEdit ?? false)
  const isOwner = computed(() => currentRoom.value?.isOwner ?? false)

  function setSession(token: string, user: OwnerUser) {
    sessionToken.value = token
    currentUser.value = user
    if (import.meta.client) localStorage.setItem(SESSION_KEY, token)
  }
  function setRoom(r: CurrentRoom) {
    currentRoom.value = r
  }
  function clearSession() {
    sessionToken.value = ''
    currentUser.value = null
    if (import.meta.client) localStorage.removeItem(SESSION_KEY)
  }

  /** 恢复盟主登录态（刷新后） */
  async function restore(): Promise<boolean> {
    if (!sessionToken.value && import.meta.client) {
      const t = localStorage.getItem(SESSION_KEY)
      if (t) sessionToken.value = t
    }
    if (!sessionToken.value) return false
    try {
      const me = await $fetch<{ user: OwnerUser }>('/api/auth/me', {
        headers: { Authorization: `Bearer ${sessionToken.value}` }
      })
      currentUser.value = me.user
      return true
    } catch {
      clearSession()
      return false
    }
  }

  async function register(username: string, password: string) {
    const res = await $fetch<{ token: string; user: OwnerUser }>('/api/auth/register', {
      method: 'POST',
      body: { username, password }
    })
    setSession(res.token, res.user)
    return res
  }

  async function login(username: string, password: string) {
    const res = await $fetch<{ token: string; user: OwnerUser }>('/api/auth/login', {
      method: 'POST',
      body: { username, password }
    })
    setSession(res.token, res.user)
    return res
  }

  async function logout() {
    try {
      await $fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken.value}` }
      })
    } catch {
      /* 忽略 */
    }
    clearSession()
    currentRoom.value = null
  }

  /**
   * 进入房间：向服务端 resolve 访问权限。
   * - 若传入 adminToken → 以后台管理员身份进入（完整权限）。
   * - 否则若已登录且是房间盟主 → owner（完整权限）。
   * - 否则凭 URL 上的分享 token → guest。
   */
  async function enterRoom(code: string, urlToken?: string | null, adminToken?: string | null) {
    const headers: Record<string, string> = {}
    const isAdmin = !!adminToken
    if (isAdmin) headers.Authorization = `Bearer ${adminToken}`
    else if (sessionToken.value) headers.Authorization = `Bearer ${sessionToken.value}`
    const q = urlToken ? `?token=${encodeURIComponent(urlToken)}` : ''
    const res = await $fetch<{
      room: { code: string; name: string }
      access: { mode: AccessMode; isOwner: boolean; canEdit: boolean; isAdmin?: boolean; name?: string }
    }>(`/api/rooms/${encodeURIComponent(code)}/access${q}`, { headers })

    currentRoom.value = {
      code: res.room.code,
      name: res.room.name,
      mode: res.access.mode,
      isOwner: res.access.isOwner,
      canEdit: res.access.canEdit,
      adminMode: isAdmin,
      shareToken: res.access.mode === 'guest' ? urlToken || null : null,
      guestName: res.access.name
    }
    return res
  }

  function leaveRoom() {
    currentRoom.value = null
  }

  return {
    sessionToken,
    currentUser,
    currentRoom,
    loggedIn,
    canEdit,
    isOwner,
    setSession,
    setRoom,
    clearSession,
    restore,
    register,
    login,
    logout,
    enterRoom,
    leaveRoom
  }
}
