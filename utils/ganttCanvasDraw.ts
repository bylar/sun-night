/**
 * 甘特图导出画布的「绘制辅助」：纯函数与常量（色彩/夜色渐变/圆角/文字换行/水印/任务几何）。
 * 与 buildGanttCanvas 主流程（见 exportImage.ts）分离，便于复用与单测。
 * 渲染逻辑刻意与 GanttChart.vue 对齐：轨道分配用 assignTracks、铺路节奏与组件一致、
 * 时段色带 / 网格 / 卡片样式镜像组件 CSS。
 */
import { minutesOf, dateOf } from './ganttLayout'
import type { DayData, TaskItem } from '@/types/gantt'
// CELL_PX 唯一来源为 ganttViewBuild，本模块仅引入使用，避免重复定义触发重复导入告警
import { CELL_PX } from '@/utils/ganttViewBuild'

export const DEFAULT_TASK_COLOR = '#1989fa'
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

// 铺路节奏（与组件一致）
export const PAVING_PACE: Record<'auto' | 'relay', number> = {
  auto: 3 * 60 + 10,
  relay: 3 * 60
}

// 深夜/浅夜 平滑渐变的颜色关键帧（按「分钟/天」定位），半透明以便透出时刻线
const NIGHT_KEYS: { m: number; c: string }[] = [
  { m: 0, c: 'rgba(120,130,190,0.10)' }, // 浅夜 0:00
  { m: 60, c: 'rgba(46,54,92,0.22)' }, // 深夜 1:00
  { m: 480, c: 'rgba(46,54,92,0.22)' }, // 深夜 8:00
  { m: 540, c: 'rgba(120,130,190,0.10)' }, // 浅夜 9:00
  { m: 1440, c: 'rgba(120,130,190,0.0)' } // 正常 24:00
]

// 生成「仅左侧 gutter 的 Y 轴夜间渐变」：相对当天分钟窗口平滑过渡，半透明
export function nightGradient(
  ctx: CanvasRenderingContext2D,
  bodyY: number,
  dayWinH: number,
  winStart: number,
  winEnd: number
): CanvasGradient {
  const span = Math.max(winEnd - winStart, 1)
  const g = ctx.createLinearGradient(0, bodyY, 0, bodyY + dayWinH)
  let lead = NIGHT_KEYS[0].c
  for (const k of NIGHT_KEYS) if (k.m <= winStart) lead = k.c
  g.addColorStop(0, lead)
  for (const k of NIGHT_KEYS) {
    const off = (k.m - winStart) / span
    if (off > 0 && off < 1) g.addColorStop(off, k.c)
  }
  let trail = NIGHT_KEYS[NIGHT_KEYS.length - 1].c
  for (let i = NIGHT_KEYS.length - 1; i >= 0; i--) if (NIGHT_KEYS[i].m >= winEnd) trail = NIGHT_KEYS[i].c
  g.addColorStop(1, trail)
  return g
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
export function fmtMin(m: number): string {
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`
}
// 将任务色转为带透明度的底色（与屏幕 GanttChart.tint 一致：g-col 用 10% 透明任务色）
export function tint(color: string, alpha: number): string {
  const c = (color || '').replace('#', '')
  if (/^[0-9a-fA-F]{6}$/.test(c)) {
    const r = parseInt(c.slice(0, 2), 16)
    const g = parseInt(c.slice(2, 4), 16)
    const b = parseInt(c.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }
  if (/^[0-9a-fA-F]{3}$/.test(c)) {
    const r = parseInt(c[0] + c[0], 16)
    const g = parseInt(c[1] + c[1], 16)
    const b = parseInt(c[2] + c[2], 16)
    return `rgba(${r},${g},${b},${alpha})`
  }
  return color
}
function todayMidnight(): Date {
  const t = new Date()
  return new Date(t.getFullYear(), t.getMonth(), t.getDate())
}
export function getBaseDate(days: DayData[]): Date | null {
  const d = days[0]
  if (!d?.date) return null
  const [y, m, day] = d.date.split('-').map(Number)
  return new Date(y, m - 1, day)
}
export function todayIndexFromDays(days: DayData[]): number {
  const base = getBaseDate(days)
  if (!base) return 0
  return Math.round((todayMidnight().getTime() - base.getTime()) / 86400000)
}
function dateForOffset(o: number): Date {
  const dt = todayMidnight()
  dt.setDate(dt.getDate() + o)
  return dt
}
export function monthDayForOffset(o: number): string {
  const dt = dateForOffset(o)
  return `${dt.getMonth() + 1}-${dt.getDate()} 周${WEEKDAY[dt.getDay()]}`
}

export function estimateCardPx(name: string, hasPave: boolean, colW: number): number {
  const textW = Math.max(40, colW - 22 - 16)
  const charW = 11
  const charsPerLine = Math.max(3, Math.floor(textW / charW))
  const len = (name || '事务').length + (hasPave ? 4 : 0)
  const lines = Math.max(1, Math.ceil(len / charsPerLine))
  const h = 8 + lines * 15 + 8
  return Math.min(Math.max(h, 44), 3 * CELL_PX)
}

/** 日期字符串相对 base 的天数差（用于跨天绝对轴） */
function dateDiffDays(base: Date, ds: string): number {
  if (!ds) return 0
  const [y, m, d] = ds.split('-').map(Number)
  const t = new Date(y || 1970, (m || 1) - 1, d || 1)
  return Math.round((t.getTime() - base.getTime()) / 86400000)
}
/** 相对 baseDate 的绝对分钟（跨天任务落在正确天数上） */
export function relMin(s: string, base: Date | null): number {
  if (!s) return 0
  const off = base ? dateDiffDays(base, dateOf(s)) : 0
  return off * 1440 + minutesOf(s)
}

export function computeTicks(
  task: TaskItem,
  aStart: number,
  aEnd: number,
  pxPerMin: number,
  interval: number,
  winStart: number,
  winEnd: number
): { top: number; count: number }[] {
  if (!task.pavingMode) return []
  const pace = PAVING_PACE[task.pavingMode]
  const dur = Math.max(aEnd - aStart, 0)
  if (dur <= 0) return []
  // 仅取导出窗口内的 tick（跨天任务只显示落在窗口内的刻度）
  const visStart = Math.max(aStart, winStart)
  const visEnd = Math.min(aEnd, winEnd)
  if (visEnd <= visStart) return []
  const ticks: { top: number; count: number }[] = []
  for (let m = aStart + interval; m < aEnd; m += interval) {
    if (m >= visStart && m <= visEnd) {
      ticks.push({ top: (m - visStart) * pxPerMin, count: Math.floor(((m - aStart) * 60) / pace) })
    }
  }
  ticks.push({ top: (visEnd - visStart) * pxPerMin, count: Math.floor((dur * 60) / pace) })
  return ticks
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | { tl: number; tr: number; br: number; bl: number }
) {
  let tl: number, tr: number, br: number, bl: number
  if (typeof r === 'number') {
    tl = tr = br = bl = r
  } else {
    tl = r.tl
    tr = r.tr
    br = r.br
    bl = r.bl
  }
  const m = (v: number) => Math.min(v, w / 2, h / 2)
  tl = m(tl)
  tr = m(tr)
  br = m(br)
  bl = m(bl)
  ctx.beginPath()
  ctx.moveTo(x + tl, y)
  ctx.arcTo(x + w, y, x + w, y + h, tr)
  ctx.arcTo(x + w, y + h, x, y + h, br)
  ctx.arcTo(x, y + h, x, y, bl)
  ctx.arcTo(x, y, x + w, y, tl)
  ctx.closePath()
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const chars = Array.from(text)
  const lines: string[] = []
  let cur = ''
  for (const ch of chars) {
    const test = cur + ch
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur)
      cur = ch
    } else {
      cur = test
    }
  }
  if (cur) lines.push(cur)
  return lines
}

export function drawWatermark(ctx: CanvasRenderingContext2D, text: string, w: number, h: number) {
  ctx.save()
  ctx.globalAlpha = 0.08
  ctx.fillStyle = '#000000'
  ctx.font = '700 22px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.translate(w / 2, h / 2)
  ctx.rotate(-Math.PI / 6)
  const stepX = 280
  const stepY = 170
  const span = Math.max(w, h) * 1.6
  for (let x = -span; x < span; x += stepX) {
    for (let y = -span; y < span; y += stepY) {
      ctx.fillText(text, x, y)
    }
  }
  ctx.restore()
}

/**
 * 判断导出范围内是否存在「会被渲染」的任务（有持续时长且与窗口相交）。
 * 与 buildGanttCanvas 的渲染包含逻辑保持一致：瞬时任务（无 endTime）在画布中不渲染，
 * 因此这里也排除纯瞬时任务，避免「判定有任务却导出空白图」的不一致。
 */
export function hasTasksInRange(days: DayData[], startAbs: number, endAbs: number): boolean {
  const base = getBaseDate(days)
  const ti = todayIndexFromDays(days)
  const startAbsBase = startAbs + ti * 1440
  const endAbsBase = endAbs + ti * 1440
  for (const day of days) {
    for (const t of day.tasks) {
      const aStart = relMin(t.startTime, base)
      const aEnd = t.endTime ? Math.max(relMin(t.endTime, base), aStart) : aStart
      if (aEnd > aStart && aStart < endAbsBase && aEnd > startAbsBase) return true
    }
  }
  return false
}
