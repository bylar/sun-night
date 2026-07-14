/**
 * 甘特图「可视模型」：连续时间轴的布局与滚动逻辑。
 * 视图构建（store 天数据 → 分段视图）已抽到 utils/ganttViewBuild（纯函数），
 * 本 composable 负责相对轴、像素换算、现在线定位、横向滚动提示与交互。
 */
import { ref, computed, onMounted, onUnmounted, nextTick, watch, type Ref } from 'vue'
import { useTaskStore } from '@/composables/useTaskStore'
import type { ViewResult, CellInfo, PositionedTask, DaySegment } from '@/utils/ganttViewBuild'
import { CELL_PX, MINUTES_PER_DAY, CONTEXT_DAYS, SCROLL_PAD_TOP, buildView } from '@/utils/ganttViewBuild'
// 注：常量/类型的唯一来源为 @/utils/ganttViewBuild，消费者请直接从该模块引入；
// 此处不再 re-export，以避免 Nuxt 自动导入扫描到同名重复导出而告警。

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
  const currentDayTitle = computed(() => titleForOffset(currentOffset.value))

  // ====== 像素换算 ======
  const pxPerMin = computed(() => CELL_PX / interval.value)
  const dayHeight = computed(() => MINUTES_PER_DAY * pxPerMin.value)

  // ====== 视图构建（纯函数，见 utils/ganttViewBuild）======
  const view = computed<ViewResult>(() =>
    buildView({
      days: days.value,
      baseDate: baseDate.value,
      todayIndex: todayIndex.value,
      currentOffset: currentOffset.value,
      interval: interval.value,
      pxPerMin: pxPerMin.value,
      plotWidth: plotWidth.value
    })
  )

  const allTasks = computed(() => view.value.mergedTasks)

  // ====== 滚动定位到「现在」 ======
  const scrollRef = ref<InstanceType<typeof import('../components/InfiniteScroll.vue').default> | null>(null)
  const plotRef = ref<HTMLElement | null>(null)
  const plotWidth = ref(360)
  const showBackToNow = ref(false)

  // 每分钟刷新一次，驱动「现在线」随当前时间向下移动（变动率 1 分钟）
  const nowTick = ref(0)
  let nowTimer: ReturnType<typeof setInterval> | null = null

  const nowTop = computed(() => {
    nowTick.value // 建立依赖，每分钟重算
    const now = new Date()
    const mins = now.getHours() * 60 + now.getMinutes()
    // 仅锚定「真实今天」(dayIndex === 0)，避免切换到其他天时把现在线也带过去
    const seg = view.value.segments.find((s) => s.dayIndex === 0)
    if (!seg) return -1 // 今天不在可视渲染窗口内时不显示
    return seg.dayTop + mins * pxPerMin.value
  })
  const showNowLine = computed(() => nowTop.value >= 0)

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
    const top = nowTop.value
    if (top >= 0) scrollRef.value?.scrollToContent?.(top, 'center')
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
    const lefts = v.colLefts
    if (!el || lefts.length === 0) {
      leftHidden.value = 0
      rightHidden.value = 0
      return
    }
    const total = lefts.length - 1
    const sl = el.scrollLeft
    const sr = el.scrollLeft + el.clientWidth
    let first = 0
    while (first < total && lefts[first + 1] <= sl + 1e-6) first++
    let last = first
    while (last < total && lefts[last] < sr - 1e-6) last++
    last = Math.min(last, total - 1)
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
    () => [view.value.maxTotalGlobal, view.value.colLefts],
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
    // 每分钟刷新 nowTop，让现在线随当前时间移动；同时更新「回到现在」按钮显隐
    nowTimer = setInterval(() => {
      nowTick.value++
      updateBackToNow()
    }, 60_000)
  })

  onUnmounted(() => {
    if (nowTimer) clearInterval(nowTimer)
  })

  return {
    // 状态
    currentOffset,
    currentDayTitle,
    view,
    allTasks,
    nowTop,
    showNowLine,
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
