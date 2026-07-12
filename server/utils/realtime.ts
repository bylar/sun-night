import { normalizeCode } from './code'

type Client = (msg: unknown) => void
const clients = new Map<string, Set<Client>>()

/** 订阅某房间的 SSE 推送，返回取消订阅函数 */
export function subscribe(roomCode: string, cb: Client): () => void {
  const c = normalizeCode(roomCode)
  if (!clients.has(c)) clients.set(c, new Set())
  const set = clients.get(c)!
  set.add(cb)
  return () => set.delete(cb)
}

/** 向某房间内所有订阅者广播一条消息 */
export function broadcast(roomCode: string, msg: { type: string; payload: unknown }): void {
  const c = normalizeCode(roomCode)
  const set = clients.get(c)
  if (!set) return
  for (const cb of set) {
    try {
      cb(msg)
    } catch {
      /* 忽略单个客户端写入失败 */
    }
  }
}
