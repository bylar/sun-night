/**
 * 分享链接 的数据访问。
 */
import { eq, and } from 'drizzle-orm'
import { db, ready, schema } from '~/server/db'
import type { Share } from './common'
import { genId, genShareToken } from './common'

export async function createShare(roomId: string, name: string, canEdit: boolean): Promise<Share> {
  await ready()
  const share: Share = {
    id: genId(),
    roomId,
    token: await genShareToken(),
    name: name || '分享',
    canEdit: canEdit ? 1 : 0,
    enabled: 1,
    createdAt: Date.now()
  }
  await db.insert(schema.shares).values(share)
  return share
}

export async function listShares(roomId: string): Promise<Share[]> {
  await ready()
  return db.select().from(schema.shares).where(eq(schema.shares.roomId, roomId)).all()
}

export async function getShareByToken(token: string): Promise<Share | undefined> {
  await ready()
  return db.select().from(schema.shares).where(eq(schema.shares.token, token)).get()
}

export async function getShareById(roomId: string, id: string): Promise<Share | undefined> {
  await ready()
  return db.select().from(schema.shares).where(and(eq(schema.shares.id, id), eq(schema.shares.roomId, roomId))).get()
}

export async function updateShare(
  id: string,
  patch: { name?: string; canEdit?: boolean; enabled?: boolean }
): Promise<void> {
  await ready()
  const set: Record<string, unknown> = {}
  if (patch.name !== undefined) set.name = patch.name
  if (patch.canEdit !== undefined) set.canEdit = patch.canEdit ? 1 : 0
  if (patch.enabled !== undefined) set.enabled = patch.enabled ? 1 : 0
  await db.update(schema.shares).set(set).where(eq(schema.shares.id, id))
}

export async function deleteShare(id: string): Promise<void> {
  await ready()
  await db.delete(schema.shares).where(eq(schema.shares.id, id))
}
