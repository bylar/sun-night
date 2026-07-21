/**
 * 任务编辑器相关的时间/铺路计算工具（纯函数，无 Vue 依赖）。
 * 铺路节奏与「大营夜间暂停」逻辑与甘特图视图保持一致。
 */
import { parseDateTime, absMinutes } from '@/utils/ganttLayout'

// ====== 铺路节奏（与视图一致）======
// 每格基础分钟：白天/浅夜（08:00–次日 01:00）= 3 分；夜间（01:00–08:00）翻 3 倍 = 9 分。
// 自动铺路额外固定 +10 秒「行路」（不随昼夜翻倍），接力无附加。
const PAVING_CELL_MIN = 3
const PAVING_OVERHEAD_SEC: Record<'auto' | 'relay', number> = { auto: 10, relay: 0 }
export const PAVING_NIGHT_MULT = 3
export const PAVING_NIGHT_START = 60 // 01:00
export const PAVING_NIGHT_END = 480 // 08:00

/** 某绝对分钟处「当前格」的耗时（秒）：夜间（01:00–08:00）基础分钟 ×3，固定 +10s 行路不翻倍 */
export function paceSecAt(mode: 'auto' | 'relay', absMin: number): number {
  const mod = ((absMin % 1440) + 1440) % 1440
  const night = mod >= PAVING_NIGHT_START && mod < PAVING_NIGHT_END
  const base = PAVING_CELL_MIN * 60 * (night ? PAVING_NIGHT_MULT : 1)
  return base + PAVING_OVERHEAD_SEC[mode]
}

/** 从 startAbs 起铺 count 格，返回结束绝对分钟（逐格按昼夜取 pace） */
export function pavedEndAbs(startAbs: number, count: number, mode: 'auto' | 'relay'): number {
  let t = startAbs
  for (let i = 0; i < count; i++) t += paceSecAt(mode, t) / 60
  return t
}

/** [absStart, absEnd) 内完成的铺路格数（不足一格不计入，逐格按昼夜取 pace） */
export function pavedCountBetween(absStart: number, absEnd: number, mode: 'auto' | 'relay'): number {
  if (absEnd <= absStart) return 0
  let t = absStart
  let c = 0
  while (t < absEnd) {
    const pace = paceSecAt(mode, t) / 60
    const remain = absEnd - t
    if (remain >= pace) {
      c++
      t += pace
    } else break
  }
  return c
}

// ====== 大营夜间暂停（与夜间相位一致：normal 段 = 09:00–24:00，即分钟 540–1440）======
// 大营仅在白天推进，夜间 00:00–09:00 暂停。例：23:30 建 1.5h 同盟大营 → 次日 10:00 完成。
export const CAMP_ACTIVE_START = 540
export const DAY_MIN = 1440

export const pad = (n: number) => String(n).padStart(2, '0')

/** 当前时刻（相对今天 00:00 的绝对分钟），与 ganttLayout.absMinutes 同基准 */
export function nowAbsMinutes(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}


/** 今天日期 "YYYY-MM-DD" */
export function todayDateStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Date → "YYYY-MM-DD HH:mm" */
export function fmtDateTimeFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 在 datetime 基础上加分钟（支持跨天），返回 "YYYY-MM-DD HH:mm" */
export function addMinutesToTime(start: string, mins: number): string {
  const { date, minutes } = parseDateTime(start)
  const base = date || todayDateStr()
  const [y, mo, d] = base.split('-').map(Number)
  const dt = new Date(y || 1970, (mo || 1) - 1, d || 1, 0, minutes + mins, 0, 0)
  return fmtDateTimeFromDate(dt)
}

/** 默认开始时间：今天日期 + 就近 5 分钟对齐的时刻 */
export function defaultStart(): string {
  const now = new Date()
  let m = now.getHours() * 60 + now.getMinutes()
  m = Math.round(m / 5) * 5
  m = Math.max(0, Math.min(24 * 60 - 1, m))
  return `${todayDateStr()} ${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/** datetime 友好显示：今天/明天/昨天 或 M/D，加时刻 */
export function fmtDateTime(s: string): string {
  const { date, minutes } = parseDateTime(s)
  const hhmm = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
  if (!date) return hhmm
  const [y, mo, d] = date.split('-').map(Number)
  const t = new Date()
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate())
  const target = new Date(y, (mo || 1) - 1, d || 1)
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000)
  const dayLabel = diff === 0 ? '今天' : diff === -1 ? '昨天' : diff === 1 ? '明天' : `${mo}/${d}`
  return `${dayLabel} ${hhmm}`
}

/** 绝对分钟 → "YYYY-MM-DD HH:mm" */
export function absMinutesToDateTime(abs: number): string {
  const dayNum = Math.floor(abs / DAY_MIN)
  const minutes = ((abs % DAY_MIN) + DAY_MIN) % DAY_MIN
  const d = new Date(dayNum * 86400000) // UTC 零点
  const y = d.getUTCFullYear()
  const mo = d.getUTCMonth() + 1
  const da = d.getUTCDate()
  return `${y}-${pad(mo)}-${pad(da)} ${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

/** 大营结束时间：从开始时间按「夜间暂停」推进 durationMin 分钟（仅白天 09:00–24:00 计耗时） */
export function campEndTime(start: string, durationMin: number): string {
  let cur = absMinutes(start)
  let remaining = durationMin
  while (remaining > 0) {
    const dayStart = Math.floor(cur / DAY_MIN) * DAY_MIN
    const activeStart = dayStart + CAMP_ACTIVE_START
    const activeEnd = dayStart + DAY_MIN
    if (cur < activeStart) cur = activeStart // 跳过夜间，跳到当天早上
    const avail = activeEnd - cur
    if (remaining <= avail) {
      cur += remaining
      remaining = 0
    } else {
      remaining -= avail
      cur = activeEnd // 当天白天用完，跨到次日早上继续
    }
  }
  return absMinutesToDateTime(cur)
}
