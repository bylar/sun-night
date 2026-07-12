import { createError } from 'h3'
import { resolveAccess } from '~/server/utils/auth'
import { loadDays } from '~/server/utils/db'
import { subscribe } from '~/server/utils/realtime'

// 协同核心：基于 SSE 的实时推送。客户端用 EventSource(`/api/rooms/:code/events?token=...`) 订阅。
export default defineEventHandler(async (event) => {
  const code = event.context.params?.code
  if (!code) throw createError({ statusCode: 400, statusMessage: '缺少房间码' })
  const ctx = await resolveAccess(event, code)

  const res = event.node?.res
  if (!res) throw createError({ statusCode: 500, statusMessage: '当前运行环境不支持 SSE' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (msg: unknown) => {
    res.write(`data: ${JSON.stringify(msg)}\n\n`)
  }

  // 初始快照：把当前任务一次性下发，客户端据此完成首屏渲染
  send({
    type: 'init',
    payload: { days: await loadDays(ctx.room.id), version: ctx.room.version }
  })

  const unsub = subscribe(ctx.room.code, send)
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000)

  const cleanup = () => {
    clearInterval(ping)
    unsub()
    try {
      res.end()
    } catch {
      /* 连接已关闭 */
    }
  }
  event.node.req.on('close', cleanup)

  // 保持响应打开，直到客户端断开
  return new Promise<void>((resolve) => {
    event.node.req.on('close', () => resolve())
  })
})
