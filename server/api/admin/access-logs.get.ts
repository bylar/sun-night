import { getQuery } from 'h3'
import { requireAdmin } from '~/server/utils/auth'
import { listAccessLogs } from '~/server/utils/db'

/** 后台：访问日志（支持按房间码 / 身份 / 动作过滤） */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const q = getQuery(event)
  const roomCode = typeof q.roomCode === 'string' && q.roomCode ? q.roomCode : undefined
  const identityType = typeof q.identityType === 'string' && q.identityType ? q.identityType : undefined
  const action = typeof q.action === 'string' && q.action ? q.action : undefined
  const limit = typeof q.limit === 'string' ? Number(q.limit) || 200 : 200
  return { logs: await listAccessLogs({ roomCode, identityType, action, limit }) }
})
