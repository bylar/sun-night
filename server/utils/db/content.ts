/**
 * 房间内容（days / tasks）的数据访问与领域对象互转。
 */
import { eq, and, asc, sql } from 'drizzle-orm'
import { db, ready, schema } from '~/server/db'
import type { DayData, TaskItem } from '@/types/gantt'
import { dateOf } from '@/utils/ganttLayout'
import { genId, todayStr } from './common'

/** 写入后调用：版本号 +1（供 SSE 广播做幂等替换），返回最新版本 */
export async function touch(roomId: string): Promise<number> {
  await db.update(schema.rooms)
    .set({ version: sql`${schema.rooms.version} + 1` })
    .where(eq(schema.rooms.id, roomId))
  return (await db.select({ v: schema.rooms.version })
    .from(schema.rooms)
    .where(eq(schema.rooms.id, roomId))
    .get())?.v ?? 0
}

/** 按房间组装前端所需的 days[]（含每天的任务，按开始时间排序） */
export async function loadDays(roomId: string): Promise<DayData[]> {
  await ready()
  const dayRows = await db.select().from(schema.days).where(eq(schema.days.roomId, roomId)).all()
  const result: DayData[] = []
  for (const d of dayRows) {
    const taskRows = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.dayId, d.id))
      .orderBy(asc(schema.tasks.startTime))
      .all()
    result.push({
      date: d.date,
      dayOfMonth: d.dayOfMonth,
      dayOfWeek: d.dayOfWeek,
      tasks: taskRows.map(rowToTask)
    })
  }
  return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** 按 id 定位任务（校验归属房间） */
export async function getTask(roomId: string, taskId: string): Promise<TaskItem | undefined> {
  await ready()
  const row = await db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.roomId, roomId)))
    .get()
  return row ? rowToTask(row) : undefined
}

/** 找到（或新建）房间内指定日期的 day，返回 dayId */
async function ensureDayId(roomId: string, dateStr: string): Promise<string> {
  const day = await db
    .select()
    .from(schema.days)
    .where(and(eq(schema.days.roomId, roomId), eq(schema.days.date, dateStr)))
    .get()
  if (day) return day.id
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dObj = new Date(y || 1970, (mo || 1) - 1, d || 1)
  const dayId = genId()
  await db.insert(schema.days).values({
    id: dayId,
    roomId,
    date: dateStr,
    dayOfMonth: dObj.getDate(),
    dayOfWeek: dObj.getDay()
  })
  return dayId
}

/** 新增任务，按 startTime 的日期归属到对应那天（不存在则创建当天） */
export async function createTask(roomId: string, task: TaskItem): Promise<TaskItem> {
  await ready()
  const dateStr = dateOf(task.startTime) || todayStr()
  const dayId = await ensureDayId(roomId, dateStr)
  const item: TaskItem = { ...task, id: task.id || genId() }
  await db.insert(schema.tasks).values(taskToRow(item, roomId, dayId))
  return item
}

/** 局部更新任务，返回更新后的完整任务（startTime 改到别的日期时会迁移归属天） */
export async function patchTask(roomId: string, taskId: string, patch: Partial<TaskItem>): Promise<TaskItem | undefined> {
  await ready()
  const existing = await db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.roomId, roomId)))
    .get()
  if (!existing) return undefined
  const merged: TaskItem = { ...rowToTask(existing), ...patch, id: taskId }
  // 若开始日期变化，迁移到目标天
  let dayId = existing.dayId
  const newDate = dateOf(merged.startTime)
  if (newDate) {
    const oldDay = await db.select().from(schema.days).where(eq(schema.days.id, existing.dayId)).get()
    if (!oldDay || oldDay.date !== newDate) {
      dayId = await ensureDayId(roomId, newDate)
    }
  }
  await db.update(schema.tasks)
    .set(taskToRow(merged, roomId, dayId))
    .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.roomId, roomId)))
  return merged
}

/** 删除任务 */
export async function deleteTask(roomId: string, taskId: string): Promise<void> {
  await ready()
  await db.delete(schema.tasks)
    .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.roomId, roomId)))
}

/** 删除整个周期计划（按 seriesId 批量删除，校验归属房间） */
export async function deleteBySeries(roomId: string, seriesId: string): Promise<void> {
  await ready()
  await db.delete(schema.tasks)
    .where(and(eq(schema.tasks.roomId, roomId), eq(schema.tasks.seriesId, seriesId)))
}

/** 清空房间内的日程与任务数据（盟主权限由调用方校验） */
export async function resetDays(roomId: string): Promise<void> {
  await ready()
  await db.delete(schema.tasks).where(eq(schema.tasks.roomId, roomId))
  await db.delete(schema.days).where(eq(schema.days.roomId, roomId))
}

/** 导入房间内容：仅写入事务信息（days + tasks）。
 * 重新生成任务的全局唯一 id（避免与导入方/其他房间的任务主键冲突），
 * seriesId 保留以维持同一周期内任务的关联。 */
export async function importDays(roomId: string, daysData: DayData[]): Promise<void> {
  await ready()
  for (const day of daysData) {
    if (!day || !Array.isArray(day.tasks) || !day.date) continue
    const dayId = await ensureDayId(roomId, day.date)
    for (const t of day.tasks) {
      if (!t || !t.name) continue
      const item: TaskItem = { ...t, id: genId() }
      await db.insert(schema.tasks).values(taskToRow(item, roomId, dayId))
    }
  }
}

// ====== 内部：行 ↔ 领域对象互转 ======
function rowToTask(r: typeof schema.tasks.$inferSelect): TaskItem {
  return {
    id: r.id,
    name: r.name,
    priority: r.priority ?? 'medium',
    startTime: r.startTime,
    endTime: r.endTime ?? undefined,
    description: r.description ?? undefined,
    isHighlighted: !!r.isHighlighted,
    pavingMode: r.pavingMode ?? null,
    color: r.color ?? undefined,
    icon: r.icon ?? undefined,
    template: r.template ?? undefined,
    seriesId: r.seriesId ?? undefined,
    durationMin: r.durationMin ?? undefined,
    countMode: r.countMode ?? undefined,
    countValue: r.countValue ?? undefined,
    minDurationMin: r.minDurationMin ?? undefined,
    stepMin: r.stepMin ?? undefined,
    customEnd: !!r.customEnd,
    count: r.count ?? undefined
  }
}

function taskToRow(t: TaskItem, roomId: string, dayId: string) {
  return {
    id: t.id,
    roomId,
    dayId,
    name: t.name,
    startTime: t.startTime,
    endTime: t.endTime ?? null,
    priority: t.priority ?? 'medium',
    description: t.description ?? null,
    isHighlighted: t.isHighlighted ? 1 : 0,
    pavingMode: t.pavingMode ?? null,
    color: t.color ?? null,
    icon: t.icon ?? null,
    template: t.template ?? null,
    seriesId: t.seriesId ?? null,
    durationMin: t.durationMin ?? null,
    countMode: t.countMode ?? null,
    countValue: t.countValue ?? null,
    minDurationMin: t.minDurationMin ?? null,
    stepMin: t.stepMin ?? null,
    customEnd: t.customEnd ? 1 : 0,
    count: t.count ?? null
  }
}
