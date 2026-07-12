/**
 * 甘特图「可视模型」：连续时间轴的布局与滚动逻辑。
 * 负责把 store 中的天数据 → 像素化的分段视图（view），以及「现在线」定位、横向滚动提示等。
 * 纯数据/几何计算，不依赖任何 UI 弹窗。
 */
import { ref, computed, onMounted, nextTick, watch, type Ref } from 'vue'
import type { TaskItem } from '@/types/gantt'
import { useTaskStore } from '@/composables/useTaskStore'
import { assignTracks, minutesOf, dateOf } from '@/utils/ganttLayout'

// ====== 常量 ======
export const MINUTES_PER_DAY = 1440
// 每个「格子」的像素高度（恒定），格子间隔由 interval 控制，pxPerMin = CELL_PX / interval
export const CELL_PX = 48
// 常态每屏约 3 列，超出则横向滚动
export const VISIBLE_COLS = 3
// 无限滚动：中心天上下各缓存天数
export const CONTEXT_DAYS = 6
// 与 CSS .timeline-scroll padding-top 保持一致
export const SCROLL_PAD_TOP = 48

// 铺路模式 → 每格耗时（秒）
const PAVING_PACE: Record<'auto' | 'relay', number> = { auto: 3 * 60 + 10, relay: 3 * 60 }

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

// 时间轴一个「时间格」：任务数 + 夜间相位（用于左侧轴 数字/月亮）
export interface CellInfo {
  top: number
  count: number
  phase: 'shallow' | 'deep' | null
}

// 计算每个时间格的任务数 + 夜间相位。即使当天无数据/无任务也照常计算（月亮与任务无关，夜间段始终显示）
// ranges 为「相对当天 [0,1440]」的可见区间；跨天任务在延伸到的每一天都传入各自片段 → 各天分别计数
function buildCells(
  ranges: [number, number][],
  stepM: number,
  pPerMin: number
): CellInfo[] {
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
  dateLabel: string
  cells: CellInfo[]
}
export interface ViewResult {
  segments: DaySegment[]
  contentHeight: number
  maxTotalGlobal: number
  colW: number
  /** 跨天任务合并后的卡片列表（同一任务在相邻天的片段合并为一根连续竖条） */
  mergedTasks: PositionedTask[]
}

export function useGanttView(interval: Ref<number>) {
  const { days } = useTaskStore()

  // ====== 相对轴：offset=0 即「今天 / 现在」，负数=过去，正数=未来 ======
  const currentOffset = ref(0)
  const weekdayChar = ['日', '一', '二', '三', '四', '五', '六']

  const todayDate = () => {
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth(), t.getDate())
  }
  function dateForOffset(o: number): Date {
    const dt = todayDate()
    dt.setDate(dt.getDate() + o)
    return dt
  }
  const baseDate = computed<Date | null>(() => {
    const d = days.value[0]
    if (!d?.date) return null
    const [y, m, day] = d.date.split('-').map(Number)
    return new Date(y, m - 1, day)
  })
  const todayIndex = computed<number>(() => {
    const base = baseDate.value
    if (!base) return 0
    return Math.round((todayDate().getTime() - base.getTime()) / 86400000)
  })
  function dataIndexForOffset(o: number): number {
    return todayIndex.value + o
  }
  function titleForOffset(o: number): string {
    if (o === 0) return '今天'
    if (o === -1) return '昨天'
    if (o === 1) return '明天'
    const dt = dateForOffset(o)
    return `${dt.getMonth() + 1}/${dt.getDate()} 周${weekdayChar[dt.getDay()]}`
  }
  /** 时间轴日界标签：月-日 周X（去掉今天/明天/昨天，导出与轴统一） */
  function monthDayForOffset(o: number): string {
    const dt = dateForOffset(o)
    return `${dt.getMonth() + 1}-${dt.getDate()} 周${weekdayChar[dt.getDay()]}`
  }
  const currentDayTitle = computed(() => titleForOffset(currentOffset.value))

  // ====== 像素换算 ======
  const pxPerMin = computed(() => CELL_PX / interval.value)
  const dayHeight = computed(() => MINUTES_PER_DAY * pxPerMin.value)

  // ====== 任务定位（分钟精度 + 轨道分配）======
  function computePavedCount(task: TaskItem, absStart: number, absEnd: number): number | null {
    if (!task.pavingMode) return null
    const pace = PAVING_PACE[task.pavingMode]
    const durSec = Math.max(absEnd - absStart, 0) * 60
    if (durSec <= 0) return 0
    return Math.floor(durSec / pace)
  }
  /** 跨天合并卡片用：刻度相对任务起点 aStart（整根竖条只算一次） */
  function computeMergedPaveTicks(
    task: TaskItem,
    aStart: number,
    aEnd: number,
    pPerMin: number
  ): { top: number; count: number }[] {
    if (!task.pavingMode) return []
    const pace = PAVING_PACE[task.pavingMode]
    const dur = Math.max(aEnd - aStart, 0)
    if (dur <= 0) return []
    const ticks: { top: number; count: number }[] = []
    for (let m = aStart + interval.value; m < aEnd; m += interval.value) {
      ticks.push({ top: (m - aStart) * pPerMin, count: Math.floor(((m - aStart) * 60) / pace) })
    }
    ticks.push({ top: dur * pPerMin, count: Math.floor((dur * 60) / pace) })
    return ticks
  }
  function estimateCardPx(name: string, hasPave: boolean, plotW: number): number {
    const colW = plotW / 3
    const textW = Math.max(40, colW - 22 - 16)
    const charW = 11
    const charsPerLine = Math.max(3, Math.floor(textW / charW))
    const len = (name || '事务').length + (hasPave ? 4 : 0)
    const lines = Math.max(1, Math.ceil(len / charsPerLine))
    return Math.min(Math.max(lines * 15 + 8, CELL_PX), 3 * CELL_PX)
  }

  const DEFAULT_TASK_COLOR = '#1989fa'

  // ====== 全局轨道分配（跨天完美避让）======
  // 把所有任务（含跨天任务在每一天延伸出的片段）放到「相对 baseDate 的同一绝对时间轴」上，
  // 一次性 assignTracks，得到每个任务唯一的全局轨道。渲染每一天时，跨天任务在该天的
  // 可见片段都用这同一个轨道 → 各天轨道对齐、互不重叠，跨天段视觉连续成一根竖条。
  function offsetForDateStr(dateStr: string): number {
    if (!baseDate.value) return 0
    const [y, m, d] = dateStr.split('-').map(Number)
    const t = new Date(y || 1970, (m || 1) - 1, d || 1)
    return Math.round((t.getTime() - baseDate.value.getTime()) / 86400000)
  }
  /** 相对 baseDate(=days[0]) 的绝对分钟；跨天任务天然落在正确天数上 */
  function relMin(s: string): number {
    const off = s ? offsetForDateStr(dateOf(s)) : 0
    return off * MINUTES_PER_DAY + minutesOf(s)
  }

  function buildSegment(
    offset: number,
    dayTop: number,
    frags: Frag[],
    maxTotal: number,
    pPerMin: number
  ): DaySegment {
    const dataIndex = dataIndexForOffset(offset)
    const day = days.value[dataIndex]
    const dt = dateForOffset(offset)
    const dayStartAbs = (todayIndex.value + offset) * MINUTES_PER_DAY
    const seg: DaySegment = {
      dayIndex: offset,
      day: day
        ? { dayOfMonth: day.dayOfMonth, dayOfWeek: day.dayOfWeek, tasks: day.tasks }
        : { dayOfMonth: 0, dayOfWeek: dt ? dt.getDay() : 0, tasks: [] },
      dayTop,
      dayHeight: dayHeight.value,
      tasks: [],
      maxTotal: 1,
      colW: plotWidth.value / VISIBLE_COLS,
      dateLabel: monthDayForOffset(offset),
      cells: []
    }
    // 左侧轴任务数：用「当天可见片段」统计，跨天任务在其延伸到的每一天都计入
    const dayRanges: [number, number][] = []
    for (const f of frags) {
      const visTop = Math.max(0, f.aStart - dayStartAbs)
      const visBottom = Math.min(MINUTES_PER_DAY, f.aEnd - dayStartAbs)
      if (visBottom > visTop) dayRanges.push([visTop, visBottom])
    }
    seg.cells = buildCells(dayRanges, interval.value >= 30 ? interval.value : 30, pPerMin)

    // 卡片不再按天拆成片段，而是在 view 中跨天合并为单根竖条（见下方 mergedTasks）
    seg.tasks = []
    seg.maxTotal = maxTotal
    seg.colW = plotWidth.value / Math.min(maxTotal, VISIBLE_COLS)
    return seg
  }

  const view = computed<ViewResult>(() => {
    const center = currentOffset.value
    const lo = center - CONTEXT_DAYS
    const hi = center + CONTEXT_DAYS
    const pPerMin = pxPerMin.value
    const ti = todayIndex.value

    // 1. 收集所有任务整体区间（用于全局轨道分配）+ 按覆盖天数拆出每日片段
    const globalItems: { id: string; start: number; end: number }[] = []
    const fragsByOffset: Frag[][] = []
    for (let i = 0; i <= hi - lo; i++) fragsByOffset.push([])
    if (baseDate.value) {
      const seen = new Set<string>()
      for (const day of days.value) {
        for (const t of day.tasks) {
          if (seen.has(t.id)) continue
          seen.add(t.id)
          const aStart = relMin(t.startTime)
          const dur = t.endTime ? Math.max(relMin(t.endTime) - aStart, 0) : 0
          const aEnd = aStart + dur
          const cardH = estimateCardPx(t.name, !!t.pavingMode, plotWidth.value)
          globalItems.push({ id: t.id, start: aStart, end: aEnd + cardH / pPerMin })
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

    // 3. 逐天构建分段（仅轴/格/标签；卡片在下一步跨天合并）
    const segments: DaySegment[] = []
    let top = 0
    for (let i = 0; i <= hi - lo; i++) {
      const seg = buildSegment(lo + i, top, fragsByOffset[i], maxTotal, pPerMin)
      top += seg.dayHeight
      segments.push(seg)
    }
    const colW = plotWidth.value / Math.min(maxTotal, VISIBLE_COLS)
    segments.forEach((s) => (s.colW = colW))

    // 4. 跨天任务合并为单张卡片：同一任务在相邻天的片段合并成一根连续竖条，
    //    名称只显示一次、仅首尾圆角，从视觉上消除「被拆成两张卡片」的割裂感。
    const merged: PositionedTask[] = []
    const byId = new Map<string, { task: TaskItem; aStart: number; aEnd: number; absTop: number; absBottom: number }[]>()
    for (let i = 0; i <= hi - lo; i++) {
      const o = lo + i
      const dayTop = i * dayHeight.value
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
          absTop: dayTop + visTop * pPerMin,
          absBottom: dayTop + visBottom * pPerMin
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
      const nameLen = (first.task.name || '事务').length + (first.task.pavingMode ? 4 : 0)
      const lineChars = Math.min(nameLen, 10)
      let cardW = 22 + lineChars * 11 + 16
      cardW = Math.max(60, Math.min(cardW, colW))
      merged.push({
        task: first.task,
        start: 0,
        end: 0,
        instant: !first.task.endTime,
        top: first.absTop,
        height: last.absBottom - first.absTop,
        left: track * colW,
        width: cardW,
        color,
        paved: computePavedCount(first.task, first.aStart, first.aEnd),
        ticks: computeMergedPaveTicks(first.task, first.aStart, first.aEnd, pPerMin),
        // 合并后整根即一个卡片：起点与终点都圆角
        firstFrag: true,
        lastFrag: true,
        fid: id
      })
    }
    merged.sort((a, b) => a.top - b.top || a.left - b.left)

    return { segments, contentHeight: top, maxTotalGlobal: maxTotal, colW, mergedTasks: merged }
  })

  const allTasks = computed(() => view.value.mergedTasks)

  // ====== 滚动定位到「现在」 ======
  const scrollRef = ref<InstanceType<typeof import('../components/InfiniteScroll.vue').default> | null>(null)
  const plotRef = ref<HTMLElement | null>(null)
  const plotWidth = ref(360)
  const showBackToNow = ref(false)

  const nowTop = computed(() => {
    const now = new Date()
    const mins = now.getHours() * 60 + now.getMinutes()
    // 从实际渲染的当天分段定位「现在线」，兼容空房间仅展示单日的情况
    const seg =
      view.value.segments.find((s) => s.dayIndex === currentOffset.value) ??
      view.value.segments.find((s) => s.dayIndex === 0)
    const base = seg ? seg.dayTop : 0
    return base + mins * pxPerMin.value
  })

  function updateBackToNow() {
    const el = scrollRef.value?.getScrollEl?.()
    if (!el) {
      showBackToNow.value = false
      return
    }
    const centerInner = el.scrollTop + el.clientHeight / 2 - SCROLL_PAD_TOP
    showBackToNow.value = Math.abs(nowTop.value - centerInner) > el.clientHeight * 0.08
  }
  async function scrollToNow() {
    if (currentOffset.value !== 0) {
      currentOffset.value = 0
      await nextTick()
    }
    scrollRef.value?.scrollToContent?.(nowTop.value, 'center')
    showBackToNow.value = false
  }

  // 跳转到指定偏移天（供日历选天使用），把该天居中显示
  async function scrollToDay(offset: number) {
    if (currentOffset.value !== offset) {
      currentOffset.value = offset
      await nextTick()
    }
    const y = CONTEXT_DAYS * dayHeight.value + dayHeight.value / 2
    scrollRef.value?.scrollToContent?.(y, 'center')
    showBackToNow.value = offset !== 0
  }

  function measurePlot() {
    if (plotRef.value) plotWidth.value = plotRef.value.clientWidth
    updateScrollIndicators()
  }

  // ====== 横向滚动提示：卡片式 +N ======
  const leftHidden = ref(0)
  const rightHidden = ref(0)
  function updateScrollIndicators() {
    const el = plotRef.value
    const v = view.value
    if (!el || !v.colW || v.maxTotalGlobal <= VISIBLE_COLS) {
      leftHidden.value = 0
      rightHidden.value = 0
      return
    }
    const cw = v.colW
    const total = v.maxTotalGlobal
    const first = Math.max(0, Math.min(total - 1, Math.floor(el.scrollLeft / cw + 1e-6)))
    const last = Math.max(0, Math.min(total - 1, Math.ceil((el.scrollLeft + el.clientWidth) / cw) - 1))
    leftHidden.value = first
    rightHidden.value = total - 1 - last
  }
  function scrollPlotTo(dir: 'left' | 'right') {
    const el = plotRef.value
    if (!el) return
    el.scrollTo({ left: dir === 'right' ? el.scrollWidth : 0, behavior: 'smooth' })
  }

  // ====== 上一/下一天 ======
  function scrollByDays(n: number) {
    const el = scrollRef.value?.getScrollEl?.()
    if (!el) return
    el.scrollTop += n * dayHeight.value
  }
  function prevDay() {
    scrollByDays(-1)
  }
  function nextDay() {
    scrollByDays(1)
  }

  watch(
    () => [view.value.maxTotalGlobal, view.value.colW],
    () => nextTick(updateScrollIndicators)
  )
  onMounted(async () => {
    await nextTick()
    measurePlot()
    if (plotRef.value && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => measurePlot())
      ro.observe(plotRef.value)
    }
    scrollToNow()
  })

  return {
    // 状态
    currentOffset,
    currentDayTitle,
    view,
    allTasks,
    nowTop,
    showBackToNow,
    scrollRef,
    plotRef,
    leftHidden,
    rightHidden,
    dayHeight,
    pxPerMin,
    // 方法
    titleForOffset,
    updateBackToNow,
    scrollToNow,
    scrollToDay,
    updateScrollIndicators,
    scrollPlotTo,
    prevDay,
    nextDay
  }
}
