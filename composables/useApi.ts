import { useAuth } from './useAuth'
import { useAdmin } from './useAdmin'

/**
 * 带访问凭据的请求封装：根据当前房间访问上下文自动附加鉴权。
 * - adminMode（后台管理员进入）：附加 Authorization: Bearer <adminToken>。
 * - owner（盟主）：附加 Authorization: Bearer <sessionToken>。
 * - guest（分享链接）：在 URL 追加 ?token=<shareToken>。
 * 进入房间的 access 请求不走此处（currentRoom 尚未确定），由 useAuth.enterRoom 自行构造。
 */
export const useApi = () => {
  const auth = useAuth()
  const admin = useAdmin()
  return async (url: string, opts: any = {}) => {
    const headers: Record<string, string> = { ...(opts.headers || {}) }
    let u = url
    const room = auth.currentRoom.value
    if (room?.adminMode && admin.adminToken.value) {
      headers.Authorization = `Bearer ${admin.adminToken.value}`
    } else if (room && room.mode === 'owner' && auth.sessionToken.value) {
      headers.Authorization = `Bearer ${auth.sessionToken.value}`
    } else if (room && room.mode === 'guest' && room.shareToken) {
      const sep = u.includes('?') ? '&' : '?'
      u = `${u}${sep}token=${encodeURIComponent(room.shareToken)}`
    }
    return $fetch<any>(u, { ...opts, headers })
  }
}
