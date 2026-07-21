/**
 * 甘特图「可视模型」的纯构建层：把 store 天数据 → 像素化分段视图（ViewResult）。
 * 不依赖 Vue / ref，所有输入经参数传入，便于复用与单测。
 * 滚动 / 现在线 / 交互逻辑仍在 composables/useGanttView.ts。
 */
import { assignTracks, minutesOf, dateOf } from '@/utils/ganttLayout'
import { pavedCountBetween, paceSecAt } from '@/utils/taskTime'
import type { DayData, TaskItem } from '@/types/gantt'

// ====== 常量 ======
export const MINUTES_PER_DAY = 1440
// 宣战（declare）结束后自动追加的「宣战中」纯色块时长（分钟），需计入区间计算避免被覆盖
export const DECLARE_TRAIL_MIN = 60
// 每个「格子」的像素高度（恒定），格子间隔由 interval 控制，pxPerMin = CELL_PX / interval
export const CELL_PX = 48
// 每列宽度按内容自然决定（不再限制同屏最多 3 列）；列数过多时由 .plot 横向滚动查看
// 无限滚动：中心天上下各缓存天数
export const CONTEXT_DAYS = 6
// 与 CSS .timeline-scroll padding-top 保持一致
export const SCROLL_PAD_TOP = 48

// 铺路模式 → 每格耗时（秒，含夜间 ×3）见 utils/taskTime 的 paceSecAt

// 夜间时段（分钟）：0-1 浅夜、1-8 深夜、8-9 浅夜、9-24 正常
type DayPhase = 'deep' | 'shallow' | 'normal'
const PHASES: { start: number; end: number; phase: DayPhase }[] = [
  { start: 0, end: 60, phase: 'shallow' },
  { start: 60, end: 480, phase: 'deep' },
  { start: 480, end: 540, phase: 'shallow' },
  { start: 540, end: 1440, phase: 'normal' }
]
function phaseAtMinute(m: number): DayPhase | null {
  for (const p of PHASES) {
    if (m >= p.start && m < p.end) return p.phase
  }
  return null
}

const weekdayChar = ['日', '一', '二', '三', '四', '五', '六']
/** 由「今天」与偏移算日期（与 useGanttView.dateForOffset 同源） */
function dateForOffset(o: number): Date {
  const dt = new Date()
  dt.setHours(0, 0, 0, 0)
  dt.setDate(dt.getDate() + o)
  return dt
}
/** 时间轴日界标签：月-日 周X（去掉今天/明天/昨天，导出与轴统一） */
function monthDayForOffset(o: number): string {
  const dt = dateForOffset(o)
  return `${dt.getMonth() + 1}-${dt.getDate()} 周${weekdayChar[dt.getDay()]}`
}

const DEFAULT_TASK_COLOR = '#1989fa'

// 时间轴一个「时间格」：任务数 + 夜间相位（用于左侧轴 数字/月亮）
export interface CellInfo {
  top: number
  count: number
  phase: 'shallow' | 'deep' | null
}

// 计算每个时间格的任务数 + 夜间相位。即使当天无数据/无任务也照常计算（月亮与任务无关，夜间段始终显示）
// ranges 为「相对当天 [0,1440]」的可见区间；跨天任务在延伸到的每一天都传入各自片段 → 各天分别计数
function buildCells(ranges: [number, number][], stepM: number, pPerMin: number): CellInfo[] {
  const out: CellInfo[] = []
  for (let m = stepM / 2; m < MINUTES_PER_DAY; m += stepM) {
    const loC = m - stepM / 2
    const hiC = m + stepM / 2
    let count = 0
    for (const [s, e] of ranges) {
      if (s < hiC && e > loC) count++
    }
    const ph = phaseAtMinute(m)
    out.push({ top: m * pPerMin, count, phase: ph === 'shallow' || ph === 'deep' ? ph : null })
  }
  return out
}

export interface PositionedTask {
  task: TaskItem
  start: number
  end: number
  instant: boolean
  top: number
  height: number
  left: number
  width: number
  color: string
  paved: number | null
  ticks: { top: number; count: number }[]
  /** 该片段是否为任务的最前/最后一段（用于跨天卡片边界圆角与描边处理） */
  firstFrag: boolean
  lastFrag: boolean
  /** 片段唯一键（同任务跨天会有多个片段，避免 key 重复） */
  fid: string
  /** 纯色块（无文字/卡片描述），如宣战后的「宣战中」延续块 */
  silent?: boolean
}

/** 任务在某一天「可见片段」的预构建数据：aStart/aEnd 为相对 baseDate 的绝对分钟 */
interface Frag {
  task: TaskItem
  aStart: number
  aEnd: number
  /** 此片段是否对应任务的起始天 / 结束天 */
  first: boolean
  last: boolean
}

export interface DaySegment {
  dayIndex: number
  day: { dayOfMonth: number; dayOfWeek: number; tasks: TaskItem[] }
  dayTop: number
  dayHeight: number
  tasks: PositionedTask[]
  maxTotal: number
  colW: number
  /** 该段对应的具体日期 YYYY-MM-DD（长按时间轴新建事务时使用） */
  date: string
  dateLabel: string
  cells: CellInfo[]
}
export interface ViewResult {
  segments: DaySegment[]
  contentHeight: number
  maxTotalGlobal: number
  /** 绘图区总宽（各列内容宽度之和，可能超出屏宽触发横向滚动） */
  totalWidth: number
  /** 每条轨道的左偏移（长度 = maxTotalGlobal + 1，末项 = totalWidth） */
  colLefts: number[]
  /** 跨天任务合并后的卡片列表（同一任务在相邻天的片段合并为一根连续竖条） */
  mergedTasks: PositionedTask[]
}

/** 任务卡片的自然内容宽度（按名称+说明长度估算，最小 60；说明参与撑宽轨道） */
function naturalCardW(name: string, hasPave: boolean, description?: string): number {
  const nameLen = (name || '事务').length + (hasPave ? 4 : 0)
  // 名称 12px(约 12px/字)、说明 10px(约 10px/字)，标题单行最多 10 字后换行
  const nameText = Math.min(nameLen, 10) * 12
  const descText = Math.min((description || '').length, 12) * 10
  // 40 = 左侧色块(22) + 左右内边距(16) + 2px 余量
  return Math.max(60, 40 + Math.max(nameText, descText))
}
/** 将 #rrggbb / #rgb 转为带透明度的 rgba 字符串（用于宣战延续块等半透明色） */
function hexToRgba(hex: string, a: number): string {
  const c = (hex || '').replace('#', '')
  if (/^[0-9a-fA-F]{6}$/.test(c)) {
    const r = parseInt(c.slice(0, 2), 16)
    const g = parseInt(c.slice(2, 4), 16)
    const b = parseInt(c.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${a})`
  }
  if (/^[0-9a-fA-F]{3}$/.test(c)) {
    const r = parseInt(c[0] + c[0], 16)
    const g = parseInt(c[1] + c[1], 16)
    const b = parseInt(c[2] + c[2], 16)
    return `rgba(${r},${g},${b},${a})`
  }
  return hex
}
function estimateCardPx(name: string, hasPave: boolean): number {
  const w = naturalCardW(name, hasPave)
  const textW = Math.max(40, w - 22 - 16)
  const charW = 11
  const charsPerLine = Math.max(3, Math.floor(textW / charW))
  const len = (name || '事务').length + (hasPave ? 4 : 0)
  const lines = Math.max(1, Math.ceil(len / charsPerLine))
  return Math.min(Math.max(lines * 15 + 8, CELL_PX), 3 * CELL_PX)
}

function computePavedCount(task: TaskItem, absStart: number, absEnd: number, _interval: number): number | null {
  if (!task.pavingMode) return null
  return pavedCountBetween(absStart, absEnd, task.pavingMode)
}
/** 跨天合并卡片用：刻度相对任务起点 aStart（整根竖条只算一次），逐格按昼夜 pace 累计 */
function computeMergedPaveTicks(
  task: TaskItem,
  aStart: number,
  aEnd: number,
  pPerMin: number,
  interval: number
): { top: number; count: number }[] {
  if (!task.pavingMode) return []
  const mode = task.pavingMode
  const dur = Math.max(aEnd - aStart, 0)
  if (dur <= 0) return []
  // 逐格推进，记录每格完成时的绝对时间与累计格数
  const boundaries: { m: number; c: number }[] = []
  let t = aStart
  let count = 0
  while (t < aEnd) {
    const pace = paceSecAt(mode, t) / 60
    const next = t + pace
    if (next > aEnd) break
    count++
    boundaries.push({ m: next, c: count })
    t = next
  }
  const ticks: { top: number; count: number }[] = []
  let bi = 0
  for (let m = aStart + interval; m < aEnd; m += interval) {
    while (bi < boundaries.length && boundaries[bi].m <= m) bi++
    const c = bi > 0 ? boundaries[bi - 1].c : 0
    ticks.push({ top: (m - aStart) * pPerMin, count: c })
  }
  ticks.push({ top: dur * pPerMin, count })
  return ticks
}

function offsetForDateStr(dateStr: string, baseDate: Date | null): number {
  if (!baseDate) return 0
  const [y, m, d] = dateStr.split('-').map(Number)
  const t = new Date(y || 1970, (m || 1) - 1, d || 1)
  return Math.round((t.getTime() - baseDate.getTime()) / 86400000)
}
/** 相对 baseDate 的绝对分钟；跨天任务天然落在正确天数上 */
function relMin(s: string, baseDate: Date | null): number {
  const off = s ? offsetForDateStr(dateOf(s), baseDate) : 0
  return off * MINUTES_PER_DAY + minutesOf(s)
}

function buildSegment(
  offset: number,
  dayTop: number,
  frags: Frag[],
  maxTotal: number,
  input: BuildViewInput
): DaySegment {
  const pPerMin = input.pxPerMin
  const dayHeight = MINUTES_PER_DAY * pPerMin
  const dataIndex = input.todayIndex + offset
  const day = input.days[dataIndex]
  const dt = dateForOffset(offset)
  const dayStartAbs = (input.todayIndex + offset) * MINUTES_PER_DAY
  const segDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  const seg: DaySegment = {
    dayIndex: offset,
    day: day
      ? { dayOfMonth: day.dayOfMonth, dayOfWeek: day.dayOfWeek, tasks: day.tasks }
      : { dayOfMonth: 0, dayOfWeek: dt ? dt.getDay() : 0, tasks: [] },
    dayTop,
    dayHeight,
    tasks: [],
    maxTotal: 1,
    colW: 60,
    date: segDate,
    dateLabel: monthDayForOffset(offset),
    cells: []
  }
  // 左侧轴任务数：用「当天可见片段」统计，跨天任务在其延伸到的每一天都计入
  const dayRanges: [number, number][] = []
  for (const f of frags) {
    const visTop = Math.max(0, f.aStart - dayStartAbs)
    let visBottom = Math.min(MINUTES_PER_DAY, f.aEnd - dayStartAbs)
    // 宣战额外「宣战中」色块占用结束后 60 分钟，需一并计入左侧轴任务数（跨天部分次日自动统计）
    if (f.task.template === 'declare' && f.task.endTime) {
      visBottom = Math.min(MINUTES_PER_DAY, visBottom + DECLARE_TRAIL_MIN)
    }
    if (visBottom > visTop) dayRanges.push([visTop, visBottom])
  }
  seg.cells = buildCells(dayRanges, input.interval >= 30 ? input.interval : 30, pPerMin)

  // 卡片不再按天拆成片段，而是在 view 中跨天合并为单根竖条（见下方 mergedTasks）
  seg.tasks = []
  seg.maxTotal = maxTotal
  seg.colW = 60
  return seg
}

export interface BuildViewInput {
  days: DayData[]
  baseDate: Date | null
  todayIndex: number
  currentOffset: number
  interval: number
  pxPerMin: number
  plotWidth: number
}

/** 构建甘特图视图：分段 + 全局轨道分配 + 跨天合并卡片 */
export function buildView(input: BuildViewInput): ViewResult {
  const { days, baseDate, todayIndex, currentOffset, interval, pxPerMin, plotWidth } = input
  const center = currentOffset
  const lo = center - CONTEXT_DAYS
  const hi = center + CONTEXT_DAYS
  const ti = todayIndex

  // 1. 收集所有任务整体区间（用于全局轨道分配）+ 按覆盖天数拆出每日片段
  const globalItems: { id: string; start: number; end: number }[] = []
  const fragsByOffset: Frag[][] = []
  for (let i = 0; i <= hi - lo; i++) fragsByOffset.push([])
  const taskById = new Map<string, TaskItem>()
  if (baseDate) {
    const seen = new Set<string>()
    for (const day of days) {
      for (const t of day.tasks) {
        if (seen.has(t.id)) continue
        seen.add(t.id)
        taskById.set(t.id, t)
        const aStart = relMin(t.startTime, baseDate)
        const dur = t.endTime ? Math.max(relMin(t.endTime, baseDate) - aStart, 0) : 0
        const aEnd = aStart + dur
        // 卡片视觉有最小高度（CSS .g-col min-height:48px），真实时长不足该高度的短任务会被撑高。
        // 仅对这类短任务补充「最小高度差」对应的占位分钟，长任务占位为 0，
        // 避免长任务被无谓延后结束时间、把后续本可复用的轨道挤到后面（造成左侧空白）。
        const MIN_CARD_PX = 48
        const realHpx = dur * pxPerMin
        const padMin = Math.max(0, (MIN_CARD_PX - realHpx) / pxPerMin)
        // 宣战额外「宣战中」色块占用结束后 60 分钟，需把这段时间也计入全局区间：
        // 否则该时间段内的其它任务会被轨道分配判为不重叠、在同轨道覆盖掉 trail 色块。
        const trailMin = t.template === 'declare' && t.endTime ? DECLARE_TRAIL_MIN : 0
        globalItems.push({ id: t.id, start: aStart, end: aEnd + padMin + trailMin })
        // 任务覆盖的「相对今天」偏移范围
        const startOff = Math.floor(aStart / MINUTES_PER_DAY) - ti
        const endOff = Math.floor(aEnd / MINUTES_PER_DAY) - ti
        const from = Math.max(startOff, lo)
        const to = Math.min(endOff, hi)
        if (from <= to) {
          for (let o = from; o <= to; o++) {
            fragsByOffset[o - lo].push({
              task: t,
              aStart,
              aEnd,
              first: o === startOff,
              last: o === endOff
            })
          }
        }
      }
    }
  }

  // 2. 全局轨道分配（合并所有天到同一时间轴，跨天段与延伸到的每一天都避让）
  const layout = assignTracks(globalItems, 0)
  const globalTracks = layout.tracks
  const maxTotal = layout.totalTracks || 1

  // 每条轨道的「内容宽度」：取该轨道内任务卡片的自然宽度（按内容），最小 60；
  // 不再强制同屏最多 3 列，列数过多时由 .plot 横向滚动查看。
  const trackWidths: number[] = new Array(maxTotal).fill(60)
  for (const gi of globalItems) {
    const tr = globalTracks[gi.id] ?? 0
    const t = taskById.get(gi.id)
    const w = t ? naturalCardW(t.name, !!t.pavingMode, t.description) : 60
    if (w > trackWidths[tr]) trackWidths[tr] = w
  }
  // colLefts[k] = 第 k 条轨道的左偏移（基于全局最宽卡片，仅供横向滚动指示器 +N 使用）；
  // colLefts[maxTotal] = 总宽
  const colLefts: number[] = [0]
  for (let k = 0; k < maxTotal; k++) colLefts.push(colLefts[k] + trackWidths[k])
  // 最右轨道不得超过可视区剩余宽度（left + 宽度 ≤ plotWidth），避免最右卡片溢出被截断
  if (maxTotal > 0) {
    const lastTr = maxTotal - 1
    const avail = plotWidth - colLefts[lastTr]
    if (trackWidths[lastTr] > avail) trackWidths[lastTr] = Math.max(60, avail)
    colLefts[maxTotal] = colLefts[lastTr] + trackWidths[lastTr]
  }

  // 每根竖条（全局任务）的「绝对时间范围 + 自然宽度」，按轨道分组。
  // 用于卡片按「相对时间范围」定位：左边各轨道只累加与本卡片时间范围重叠时的宽度，
  // 不同时间段的更宽卡片不再撑大本卡片所在轨道的占位（消除多余水平空隙）。
  const trackRanges = new Map<number, { s: number; e: number; w: number }[]>()
  for (const gi of globalItems) {
    const tr = globalTracks[gi.id] ?? 0
    const t = taskById.get(gi.id)
    const w = t ? naturalCardW(t.name, !!t.pavingMode, t.description) : 60
    const arr = trackRanges.get(tr) ?? []
    arr.push({ s: gi.start, e: gi.end, w })
    trackRanges.set(tr, arr)
  }
  // 轨道 tr 在时间段 [s,e] 内被占用的卡片最大宽度（无占用则 0）
  function trackWidthInRange(tr: number, s: number, e: number): number {
    const arr = trackRanges.get(tr)
    if (!arr) return 0
    let m = 0
    for (const r of arr) if (r.s < e && r.e > s) m = Math.max(m, r.w)
    return m
  }

  // 3. 逐天构建分段（仅轴/格/标签；卡片在下一步跨天合并）
  const segments: DaySegment[] = []
  let top = 0
  const dayHeight = MINUTES_PER_DAY * pxPerMin
  for (let i = 0; i <= hi - lo; i++) {
    const seg = buildSegment(lo + i, top, fragsByOffset[i], maxTotal, input)
    top += seg.dayHeight
    segments.push(seg)
  }
  // 每列宽度由 colLefts 决定，无需统一 colW

  // 4. 跨天任务合并为单张卡片：同一任务在相邻天的片段合并成一根连续竖条，
  //    名称只显示一次、仅首尾圆角，从视觉上消除「被拆成两张卡片」的割裂感。
  const merged: PositionedTask[] = []
  const byId = new Map<string, { task: TaskItem; aStart: number; aEnd: number; absTop: number; absBottom: number }[]>()
  for (let i = 0; i <= hi - lo; i++) {
    const o = lo + i
    const dayTop = i * dayHeight
    const dayStartAbs = (ti + o) * MINUTES_PER_DAY
    for (const f of fragsByOffset[i]) {
      const visTop = Math.max(0, f.aStart - dayStartAbs)
      const visBottom = Math.min(MINUTES_PER_DAY, f.aEnd - dayStartAbs)
      if (visBottom <= visTop) continue
      const arr = byId.get(f.task.id) ?? []
      arr.push({
        task: f.task,
        aStart: f.aStart,
        aEnd: f.aEnd,
        absTop: dayTop + visTop * pxPerMin,
        absBottom: dayTop + visBottom * pxPerMin
      })
      byId.set(f.task.id, arr)
    }
  }
  for (const [id, frags] of byId) {
    frags.sort((a, b) => a.absTop - b.absTop)
    const first = frags[0]
    const last = frags[frags.length - 1]
    const track = globalTracks[id] ?? 0
    const color = first.task.color || DEFAULT_TASK_COLOR
    // 相对时间范围定位：左偏移只累加「左边各轨道在『本卡片时间范围』内重叠时的宽度」，
    // 这样其它时间段更宽的卡片不会撑大本卡片所在轨道的占位，消除多余水平空隙。
    let left = 0
    for (let k = 0; k < track; k++) left += trackWidthInRange(k, first.aStart, last.aEnd)
    // 卡片宽度按自身内容（名称+自身说明）的自然宽度：有说明则宽、无说明则紧凑。
    const cardW = naturalCardW(first.task.name, !!first.task.pavingMode, first.task.description)
    merged.push({
      task: first.task,
      start: 0,
      end: 0,
      instant: !first.task.endTime,
      top: first.absTop,
      height: last.absBottom - first.absTop,
      left,
      width: cardW,
      color,
      paved: computePavedCount(first.task, first.aStart, first.aEnd, interval),
      ticks: computeMergedPaveTicks(first.task, first.aStart, first.aEnd, pxPerMin, interval),
      // 合并后整根即一个卡片：起点与终点都圆角
      firstFrag: true,
      lastFrag: true,
      fid: id
    })
    // 宣战（declare）结束后自动追加 1 小时「宣战中」纯色块：无文字、无卡片描述，
    // 接在宣战结束色块之后，颜色取宣战色的半透明延续色。
    if (first.task.template === 'declare' && first.task.endTime) {
      const trailColor = hexToRgba(first.task.color || '#ff976a', 0.4)
      merged.push({
        task: first.task,
        start: 0,
        end: 0,
        instant: false,
        top: last.absBottom,
        height: 60 * pxPerMin,
        left,
        width: 22,
        color: trailColor,
        paved: null,
        ticks: [],
        firstFrag: true,
        lastFrag: true,
        fid: id + ':trail',
        silent: true
      })
    }
  }
  merged.sort((a, b) => a.top - b.top || a.left - b.left)

  // 总宽按相对时间范围布局中实际出现的最右边缘（卡片 left+width 最大值），不足一屏则用屏宽
  let totalWidth = plotWidth
  for (const m of merged) totalWidth = Math.max(totalWidth, m.left + m.width)

  return { segments, contentHeight: top, maxTotalGlobal: maxTotal, totalWidth, colLefts, mergedTasks: merged }
}
