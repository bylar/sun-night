<script setup lang="ts">
import { ref, computed, provide } from 'vue'
import { Icon, Popup, Picker } from 'vant'
import InfiniteScroll from './InfiniteScroll.vue'
import TemplatePicker from './TemplatePicker.vue'
import TaskEditDialog from './TaskEditDialog.vue'
import RecurringPlanDialog from './RecurringPlanDialog.vue'
import ExportDialog from './ExportDialog.vue'
import ExportPreview from './ExportPreview.vue'
import TaskTableDialog from './TaskTableDialog.vue'
import { useGanttView } from '@/composables/useGanttView'
import { useTaskStore } from '@/composables/useTaskStore'
import { useTaskEditor } from '@/composables/useTaskEditor'
import { useGanttExport } from '@/composables/useGanttExport'
import { dateOf } from '@/utils/ganttLayout'
import { nowAbsMinutes } from '@/utils/taskTime'
import { formatTime, PHASE_GRADIENT, buildGridStyle, buildTimeLabels } from '@/utils/ganttChartStyle'
import { tint } from '@/utils/ganttCanvasDraw'
import { useAuth } from '@/composables/useAuth'

// 每格间隔（可配置）
const INTERVAL_OPTIONS = [
  { text: '1分钟', value: 1 },
  { text: '5分钟', value: 5 },
  { text: '10分钟', value: 10 },
  { text: '30分钟', value: 30 },
  { text: '1小时', value: 60 },
  { text: '2小时', value: 120 },
  { text: '4小时', value: 240 },
  { text: '6小时', value: 360 },
  { text: '12小时', value: 720 },
  { text: '24小时', value: 1440 }
]
const interval = ref(30)
const intervalLabel = computed(
  () => INTERVAL_OPTIONS.find((o) => o.value === interval.value)?.text || '30分钟'
)
const intervalChip = computed(() => {
  const v = interval.value
  if (v < 60) return `${v}分钟`
  if (v === 60) return '1时'
  if (v === 720) return '12时'
  if (v === 1440) return '24时'
  return intervalLabel.value
})

// ====== 三大模块 composables（解构到顶层，模板自动解包）======
const {
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
  pxPerMin,
  dayHeight,
  titleForOffset,
  updateBackToNow,
  scrollToNow,
  scrollToDay,
  updateScrollIndicators,
  scrollPlotTo,
  prevDay,
  nextDay
} = useGanttView(interval)

// 底部统计：按当前时间将任务分为 进行中 / 未进行 / 已完成（依赖 nowTop 每分钟刷新）
const taskStats = computed(() => {
  nowTop.value // 建立依赖，使统计随当前时间每分钟更新
  const now = nowAbsMinutes()
  let doing = 0
  let todo = 0
  let done = 0
  for (const t of allTasks.value) {
    if (t.end < now) done++
    else if (t.start <= now) doing++
    else todo++
  }
  return { doing, todo, done }
})


// 保存任务后：把视图跳转到该任务所在日期
function offsetForDate(dateStr: string): number {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const t = new Date()
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate())
  const target = new Date(y, (mo || 1) - 1, d || 1)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}
const editor = useTaskEditor((dateStr: string) => {
  scrollToDay(offsetForDate(dateStr))
})
const { showTemplatePopup } = editor
provide('taskEditor', editor)

const exp = useGanttExport(interval, titleForOffset)
const { showExportPopup } = exp
provide('ganttExport', exp)

// 权限：viewer 只读，禁用编辑类交互
const auth = useAuth()
const canEdit = auth.canEdit
provide('canEdit', canEdit)

// ====== 时间轴长按 3s 唤起以该时刻为开始时间的新建事务 ======
const MINUTES_PER_DAY = 1440
let axisPressTimer: number | null = null
let axisPressTarget: HTMLElement | null = null
let axisPressStartY = 0

/** 由时间轴内相对 y（内容坐标）映射出 YYYY-MM-DD HH:mm（按当前每格粒度对齐） */
function axisTimeAtY(y: number): string | null {
  const segs = view.value.segments
  for (const s of segs) {
    if (y >= s.dayTop && y < s.dayTop + s.dayHeight) {
      let mins = Math.floor((y - s.dayTop) / pxPerMin.value)
      mins = Math.max(0, Math.min(MINUTES_PER_DAY - 1, mins))
      // 取所按格子上方的时刻：向下对齐到每格粒度（floor），而非四舍五入
      const step = interval.value
      mins = Math.floor(mins / step) * step
      const p = (n: number) => String(n).padStart(2, '0')
      return `${s.date} ${p(Math.floor(mins / 60))}:${p(mins % 60)}`
    }
  }
  return null
}

function startAxisPress(e: PointerEvent) {
  if (!canEdit.value) return
  axisPressStartY = e.clientY
  axisPressTarget = e.currentTarget as HTMLElement
  if (axisPressTimer !== null) clearTimeout(axisPressTimer)
  // 长按 3s 以上才触发，避免误触
  axisPressTimer = window.setTimeout(() => {
    if (!axisPressTarget) return
    const rect = axisPressTarget.getBoundingClientRect()
    const time = axisTimeAtY(axisPressStartY - rect.top)
    if (time) editor.openAddAtTime(time)
    axisPressTimer = null
    axisPressTarget = null
  }, 3000)
}

function cancelAxisPress() {
  if (axisPressTimer !== null) {
    clearTimeout(axisPressTimer)
    axisPressTimer = null
    axisPressTarget = null
  }
}

function onAxisPointerMove(e: PointerEvent) {
  // 长按过程中移动超过阈值则取消
  if (axisPressTimer !== null && Math.abs(e.clientY - axisPressStartY) > 12) {
    cancelAxisPress()
  }
}

// ====== 日历选天 ======
const taskStore = useTaskStore()
// 日期 → 当天任务数（跨天任务在其覆盖的每一天都计数）
const countByDate = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {}
  const p = (n: number) => String(n).padStart(2, '0')
  const seen = new Set<string>()
  for (const d of taskStore.days.value) {
    for (const t of d.tasks) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      // 解析不出日期（旧版纯时刻）时回退到任务所在天的 date
      const s = dateOf(t.startTime) || d.date
      const e = t.endTime ? dateOf(t.endTime) || s : s
      const end = e || s
      let cur = s
      while (cur <= end) {
        m[cur] = (m[cur] || 0) + 1
        const [y, mo, dd] = cur.split('-').map(Number)
        const nx = new Date(y, mo - 1, dd + 1)
        cur = `${nx.getFullYear()}-${p(nx.getMonth() + 1)}-${p(nx.getDate())}`
      }
    }
  }
  return m
})
const showCalendar = ref(false)
const calYear = ref(new Date().getFullYear())
const calMonth = ref(new Date().getMonth())
const weekHeaders = ['日', '一', '二', '三', '四', '五', '六']
function openCalendar() {
  const t = new Date()
  const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + currentOffset.value)
  calYear.value = d.getFullYear()
  calMonth.value = d.getMonth()
  showCalendar.value = true
}
function calPrevMonth() {
  if (calMonth.value === 0) {
    calMonth.value = 11
    calYear.value--
  } else calMonth.value--
}
function calNextMonth() {
  if (calMonth.value === 11) {
    calMonth.value = 0
    calYear.value++
  } else calMonth.value++
}
function makeCell(d: Date, inMonth: boolean) {
  const y = d.getFullYear()
  const mo = d.getMonth()
  const dn = d.getDate()
  const p = (n: number) => String(n).padStart(2, '0')
  const dateStr = `${y}-${p(mo + 1)}-${p(dn)}`
  const t = new Date()
  const isToday = y === t.getFullYear() && mo === t.getMonth() && dn === t.getDate()
  const offset = Math.round(
    (new Date(y, mo, dn).getTime() -
      new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) /
      86400000
  )
  return { dayNum: dn, inMonth, isToday, offset, count: countByDate.value[dateStr] || 0 }
}
const calCells = computed(() => {
  const y = calYear.value
  const mo = calMonth.value
  const startW = new Date(y, mo, 1).getDay()
  const daysInMonth = new Date(y, mo + 1, 0).getDate()
  const cells: ReturnType<typeof makeCell>[] = []
  for (let i = 0; i < startW; i++) {
    cells.push(makeCell(new Date(y, mo, 1 - (startW - i)), false))
  }
  for (let dn = 1; dn <= daysInMonth; dn++) {
    cells.push(makeCell(new Date(y, mo, dn), true))
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]
    cells.push(makeCell(new Date(calYear.value, calMonth.value, last.dayNum + 1), false))
  }
  return cells
})
async function pickDay(c: { offset: number }) {
  showCalendar.value = false
  await scrollToDay(c.offset)
}

// scrollRef / plotRef 仅用于模板 ref 绑定，显式引用以通过 noUnusedLocals 检查
void scrollRef
void plotRef

// 时间轴标签步长：间隔较密时用 30 分钟作为标签步长，避免拥挤
const labelStep = computed(() => (interval.value >= 30 ? interval.value : 30))
// 网格背景与时刻标签由 ganttChartStyle 提供（展示工具外置，降低组件复杂度）
const gridStyle = computed(() => buildGridStyle())
const timeLabels = computed(() => buildTimeLabels(pxPerMin.value, labelStep.value))

// 全部事务表格浮窗
const showTaskTable = ref(false)

// 间隔选择弹窗
const showIntervalPicker = ref(false)
function pickValues(val: unknown): (string | number)[] {
  if (val && typeof val === 'object' && 'selectedValues' in (val as Record<string, unknown>)) {
    const sv = (val as { selectedValues?: (string | number)[] }).selectedValues
    if (Array.isArray(sv)) return sv
  }
  return Array.isArray(val) ? (val as (string | number)[]) : [val as string | number]
}
function onIntervalConfirm(val: unknown) {
  const v = pickValues(val)[0]
  if (typeof v === 'number') interval.value = v
  showIntervalPicker.value = false
  updateBackToNow()
}

// 对外暴露任务状态统计，供页面头部展示
defineExpose({ taskStats })

</script>

<template>
  <div class="gantt-container">
    <!-- 浮动药丸：当前赛季天数（点标题打开日历选天） -->
    <div class="day-pill">
      <Icon name="arrow-left" size="16" color="#323233" @click="prevDay" />
      <span class="day-title" @click="openCalendar">{{ currentDayTitle }}</span>
      <Icon name="arrow" size="16" color="#323233" @click="nextDay" />
    </div>

    <!-- 导出图片：右上角 -->
    <button class="export-btn" type="button" @click="showExportPopup = true" aria-label="导出图片">
      <Icon name="photo-o" size="18" />
    </button>

    <!-- 甘特图主体：竖向时间轴，固定 00:00–24:00 -->
    <div class="timeline-wrap">
      <InfiniteScroll
        ref="scrollRef"
        :item-height="dayHeight"
        :buffer="6"
        :pad-top="48"
        :pad-bottom="72"
        v-model="currentOffset"
        @scroll="updateBackToNow"
      >
        <template #default="{ contentHeight: ch }">
          <div class="timeline-inner" :style="{ height: ch + 'px' }">
            <!-- 左侧时间轴（长按 3s 在该时刻新建事务） -->
            <div
              class="time-axis"
              @pointerdown="startAxisPress"
              @pointerup="cancelAxisPress"
              @pointerleave="cancelAxisPress"
              @pointercancel="cancelAxisPress"
              @pointermove="onAxisPointerMove"
              @contextmenu.prevent="cancelAxisPress"
            >
              <template v-for="seg in view.segments" :key="'seg' + seg.dayIndex">
                <div
                  class="phase-bg"
                  :style="{
                    top: seg.dayTop + 'px',
                    height: seg.dayHeight + 'px',
                    backgroundImage: PHASE_GRADIENT
                  }"
                ></div>
                <div
                  v-for="(c, i) in seg.cells"
                  :key="'cell' + seg.dayIndex + i"
                  class="cell-widget"
                  :style="{ top: seg.dayTop + c.top + 'px' }"
                >
                  <span v-if="c.phase" class="cell-moon" :class="'phase-' + c.phase">
                    <svg class="moon-icon" viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                  </span>
                  <span v-if="c.count > 0" class="cell-count">{{ c.count }}</span>
                </div>
                <div
                  v-for="(lab, i) in timeLabels"
                  :key="'t' + seg.dayIndex + i"
                  class="time-label"
                  :class="{ 'boundary-label': lab.boundary }"
                  :style="{ top: seg.dayTop + lab.top + 'px' }"
                >
                  {{ lab.boundary ? seg.dateLabel : lab.text }}
                </div>
              </template>
            </div>

            <!-- 右侧绘图区 -->
            <div class="plot" ref="plotRef" @scroll="updateScrollIndicators">
              <div
                class="plot-content"
                :style="[gridStyle, { width: view.totalWidth + 'px', minHeight: view.contentHeight + 'px' }]"
              >
                <div
                  v-for="t in allTasks"
                  :key="t.fid"
                  class="task-row"
                  :class="{ highlighted: t.task.isHighlighted, instant: t.instant, silent: t.silent }"
                  :style="{
                    top: t.top + 'px',
                    height: t.height + 'px',
                    left: t.left + 'px',
                    width: t.width + 'px'
                  }"
                  @click="canEdit && editor.openEdit(t.task)"
                >
                  <template v-if="t.silent">
                    <div
                      class="trail-block"
                      :class="{ highlighted: t.task.isHighlighted }"
                      :style="{ background: t.color }"
                    >⚔</div>
                  </template>
                  <template v-else>
                    <div
                      class="rail-block"
                      :class="{ highlighted: t.task.isHighlighted }"
                      :style="{
                        background: t.color,
                        borderRadius: (t.firstFrag ? 6 : 0) + 'px 0 0 ' + (t.lastFrag ? 6 : 0) + 'px',
                        boxShadow:
                          'inset 1px 0 0 rgba(255,255,255,0.25)' +
                          (t.firstFrag ? ', inset 0 1px 0 rgba(255,255,255,0.25)' : '') +
                          (t.lastFrag ? ', inset 0 -1px 0 rgba(255,255,255,0.25)' : '')
                      }"
                    >
                      <span
                        v-for="(tk, i) in t.ticks"
                        :key="i"
                        class="pave-tick"
                        :style="{ top: tk.top + 'px' }"
                        >{{ tk.count }}</span
                      >
                      <span v-if="t.task.template === 'transfer'" class="task-flag">🚩</span>
                      <span v-if="t.task.template === 'build'" class="task-flag">🔧</span>
                      <span v-if="t.task.template === 'recurring'" class="task-flag">♻</span>
                    </div>
                    <div
                      class="g-col"
                      :class="{ highlighted: t.task.isHighlighted }"
                      :style="{
                        borderRadius: '0 ' + (t.firstFrag ? 6 : 0) + 'px ' + (t.lastFrag ? 6 : 0) + 'px 0',
                        backgroundColor: tint(t.color, 0.1)
                      }"
                    >
                      <div class="col-head">
                        <span class="col-name" :style="{ color: t.color }">{{ t.task.name || '事务' }}</span>
                        <span v-if="t.task.pavingMode" class="col-pave">{{
                          t.task.pavingMode === 'auto' ? '自动' : '接力'
                        }}</span>
                      </div>
                      <div v-if="t.task.description" class="col-desc">{{ t.task.description }}</div>
                    </div>
                  </template>
                </div>
              </div>
            </div>
            <!-- 当前时间红线：仅在真实今天显示，随当前时间每分钟移动（导出图不绘制此线） -->
            <div v-if="showNowLine" class="now-line" :style="{ top: nowTop + 'px' }">
              <span class="now-line-label">现在</span>
            </div>
          </div>
        </template>
      </InfiniteScroll>

      <!-- 横向滚动提示 -->
      <div v-if="rightHidden > 0" class="scroll-ind right" @click="scrollPlotTo('right')">
        <Icon name="arrow" size="14" />
        <span>+{{ rightHidden }}</span>
      </div>
      <div v-if="leftHidden > 0" class="scroll-ind left" @click="scrollPlotTo('left')">
        <span>+{{ leftHidden }}</span>
        <Icon name="arrow-left" size="14" />
      </div>
    </div>

    <!-- 回到现在 -->
    <transition name="fade">
      <div v-if="showBackToNow" class="back-to-now" @click="scrollToNow">
        <Icon name="arrow-down" size="16" color="#ee0a24" />
        <span>回到现在</span>
      </div>
    </transition>

    <!-- 底部统计栏 + 中间圆形加号 -->
    <div class="stats-bar">
      <div class="stat-item stat-clickable" @click="showTaskTable = true">
        <Icon name="todo-list-o" />
        <span>共 {{ allTasks.length }} 项</span>
      </div>
      <span v-if="!canEdit" class="readonly-tag">只读</span>
      <div class="fab-plus" :class="{ disabled: !canEdit }" @click="canEdit && editor.openAdd()">
        <Icon name="plus" size="24" color="#fff" />
      </div>
      <div class="stat-group">
        <div class="stat-item" @click="showIntervalPicker = true">
          <span>每格 {{ intervalChip }}</span>
          <Icon name="underway-o" />
        </div>
      </div>
    </div>

    <!-- 间隔选择弹窗 -->
    <Popup v-model:show="showIntervalPicker" position="bottom" round>
      <Picker
        :columns="[INTERVAL_OPTIONS]"
        :model-value="[interval]"
        @confirm="onIntervalConfirm"
        @cancel="showIntervalPicker = false"
        title="每格间隔"
      />
    </Popup>

    <!-- 日历选天 -->
    <Popup v-model:show="showCalendar" round class="cal-popup" :overlay-style="{ background: 'rgba(0,0,0,0.35)' }">
      <div class="cal">
        <div class="cal-head">
          <Icon name="arrow-left" size="18" color="#323233" @click="calPrevMonth" />
          <span class="cal-title">{{ calYear }}年{{ calMonth + 1 }}月</span>
          <Icon name="arrow" size="18" color="#323233" @click="calNextMonth" />
        </div>
        <div class="cal-week">
          <span v-for="w in weekHeaders" :key="w">{{ w }}</span>
        </div>
        <div class="cal-grid">
          <div
            v-for="(c, i) in calCells"
            :key="i"
            class="cal-cell"
            :class="{ 'cal-out': !c.inMonth, 'cal-today': c.isToday, 'cal-sel': c.offset === currentOffset }"
            @click="pickDay(c)"
          >
            <span class="cal-num">{{ c.dayNum }}</span>
            <span v-if="c.count > 0" class="cal-badge">{{ c.count }}</span>
          </div>
        </div>
      </div>
    </Popup>

    <!-- 子组件：模板库 / 编辑 / 导出设置 / 预览 -->
    <TemplatePicker v-model:show="showTemplatePopup" @pick="editor.pickTemplate" />
    <TaskEditDialog />
    <RecurringPlanDialog />
    <ExportDialog />
    <ExportPreview />

    <!-- 全部事务表格浮窗（入口：底部事务数量统计） -->
    <TaskTableDialog v-model:show="showTaskTable" />
  </div>
</template>

<style scoped>
.gantt-container {
  position: relative;
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f7f8fa;
  overflow: hidden;
}

/* 当前赛季天数：浮动圆角药丸 */
.day-pill {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(6px);
  border-radius: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
}
.day-title {
  font-size: 14px;
  font-weight: 700;
  color: #323233;
  white-space: nowrap;
  cursor: pointer;
}

/* 导出图片按钮：右上角 */
.export-btn {
  position: absolute;
  top: 10px;
  right: 12px;
  z-index: 100;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  color: #323233;
  cursor: pointer;
}
.export-btn:active {
  transform: scale(0.94);
}

/* 甘特图主体 */
.timeline-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  margin: 8px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  background: #fff;
}
.timeline-inner {
  display: flex;
  position: relative;
}

/* 左侧时间轴 */
.time-axis {
  width: 62px;
  flex-shrink: 0;
  position: relative;
  background: rgba(250, 250, 250, 0.85);
  border-right: 1px solid #ebedf0;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: pan-y;
}
/* 时段状态：深夜/浅夜 平滑渐变（仅 Y 轴，半透明，置于最底层） */
.phase-bg {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 0;
  pointer-events: none;
}
/* 每格小部件：月亮在最左、任务数圆圈在右对齐，置于最上层避免被时刻文字遮挡 */
.cell-widget {
  position: absolute;
  left: 4px;
  right: 4px;
  z-index: 3;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
}
.cell-count {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid #ebedf0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  color: #323233;
  line-height: 1;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.cell-moon {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
}
.cell-moon.phase-shallow {
  background: #b9bcc4; /* 浅夜：灰色背景 */
}
.cell-moon.phase-deep {
  background: #2a2f45; /* 深夜：更黑的背景 */
}
.moon-icon {
  fill: #f5c542; /* 浅夜：金色月亮 */
}
.cell-moon.phase-deep .moon-icon {
  fill: #ffffff; /* 深夜：白色月亮 */
}
.time-label {
  position: absolute;
  right: 4px;
  z-index: 1;
  transform: translateY(-50%);
  font-size: 11px;
  color: #646566;
  font-family: monospace;
  font-weight: 600;
  white-space: nowrap;
}
.time-label.boundary-label {
  color: #1989fa;
  font-weight: 700;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}

/* 当前时间红线：贯穿时间轴与绘图区的红色虚线 */
.now-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  border-top: 1px dashed #ee0a24;
  z-index: 6;
  pointer-events: none;
}
.now-line-label {
  position: absolute;
  left: 2px;
  top: -8px;
  font-size: 9px;
  line-height: 14px;
  color: #fff;
  background: #ee0a24;
  padding: 0 4px;
  border-radius: 4px;
  white-space: nowrap;
}

/* 右侧绘图区 */
.plot {
  flex: 1;
  min-width: 0;
  position: relative;
  border-bottom: 1px solid #ebedf0;
  overflow-x: auto;
  overflow-x: overlay;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.plot::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
.plot-content {
  position: relative;
  min-height: 100%;
  min-width: 100%;
  width: 100%;
}
.task-row {
  position: absolute;
  min-width: 0;
  border-radius: 6px;
  z-index: 3;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.task-row:active {
  transform: scale(1.01);
}
.rail-block {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 22px;
  border-radius: 6px 0 0 6px;
  opacity: 0.95;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
}
.task-flag {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 13px;
  line-height: 1;
  filter: brightness(0) invert(1);
  pointer-events: none;
}
.pave-tick {
  position: absolute;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 10px;
  font-weight: 800;
  color: #fff;
  line-height: 1;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}
/* 宣战后的「宣战中」纯色块：与宣战卡片左侧的实心色条（rail-block）同宽(22px)、左对齐，
   无文字/描述，半透明延续色，接在宣战结束色块之后 */
.trail-block {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 22px;
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  line-height: 1;
  color: #ee0a24;
}
.trail-block.highlighted {
  box-shadow: inset 0 0 0 2px rgba(238, 10, 36, 0.6);
}
.g-col {
  position: absolute;
  top: 0;
  left: 22px;
  right: 0;
  min-height: 48px;
  max-height: 144px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 8px;
  background: #fff;
  border-radius: 0 6px 6px 0;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  z-index: 2;
}
.col-head {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 4px 5px;
  min-width: 0;
}
.cat-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 3px;
}
.col-name {
  flex: 1 1 100%;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  color: #323233;
  line-height: 1.35;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.col-desc {
  font-size: 10px;
  line-height: 1.3;
  color: #646566;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.col-pave {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  color: #07c160;
  background: #e8f8ef;
  padding: 0 5px;
  border-radius: 8px;
  line-height: 16px;
}
.col-repeat {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 16px;
}

/* 底部统计栏 */
.stats-bar {
  position: absolute;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  width: 80%;
  max-width: 360px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(8px);
  border-radius: 28px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.14);
  z-index: 99;
  font-size: 14px;
}
.stat-group {
  display: flex;
  justify-content: end;
  gap: 16px;
  flex: 1;
  align-items: center;
}
.stat-item {
  display: flex;
  align-items: center;
  gap: 5px;
}
.stat-clickable {
  cursor: pointer;
  border-radius: 14px;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: start;
  width: 0;
  box-sizing: border-box;
  transition: background 0.12s ease, transform 0.12s ease;
}
.stat-clickable:active {
  background: #f2f3f5;
  transform: scale(0.96);
}
.readonly-tag {
  font-size: 10px;
  font-weight: 700;
  color: #969799;
  background: #f0f1f3;
  padding: 1px 6px;
  border-radius: 8px;
}
.fab-plus {
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  margin: 0 6px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(102, 126, 234, 0.5);
  cursor: pointer;
  align-self: center;
  transform: translateY(-14px);
}
.fab-plus.disabled {
  background: #c8c9cc;
  box-shadow: none;
  cursor: not-allowed;
}
.fab-plus:active {
  transform: translateY(-14px) scale(0.94);
}

/* 回到现在 */
.back-to-now {
  position: absolute;
  bottom: 86px;
  right: 16px;
  z-index: 98;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  background: rgb(255 255 255 / 58%);
  backdrop-filter: blur(8px);
  border-radius: 18px;
  box-shadow: 0 3px 14px rgba(238, 10, 36, 0.22);
  border: 1px solid rgba(238, 10, 36, 0.25);
  font-size: 12px;
  font-weight: 700;
  color: #ee0a24;
  cursor: pointer;
  user-select: none;
}
.back-to-now:active {
  transform: scale(0.96);
}
.back-to-now .van-icon {
  transform: rotate(180deg);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* 横向滚动提示 */
.scroll-ind {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 7px 11px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.2);
  font-size: 13px;
  font-weight: 800;
  color: #323233;
  cursor: pointer;
  user-select: none;
}
.scroll-ind:active {
  transform: translateY(-50%) scale(0.96);
}
.scroll-ind.right {
  right: 8px;
}
.scroll-ind.left {
  left: 64px;
}
.scroll-ind .van-icon {
  color: #667eea;
}

/* 日历选天：放大整体尺寸，居中接在顶部按钮下方（不用 scale，直接放大） */
.cal-popup {
  background: transparent;
}
.cal-popup :deep(.van-popup) {
  position: fixed;
  top: 54px;
  left: 50%;
  bottom: auto;
  right: auto;
  width: min(820px, 96vw);
  max-height: 94vh;
  transform: translateX(-50%);
  overflow-y: auto;
  background: #fff;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
}
.cal {
  padding: 14px 16px 18px;
  background: #fff;
}
.cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 12px;
}
.cal-title {
  font-size: 14px;
  font-weight: 700;
  color: #323233;
}
.cal-week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  font-size: 11px;
  color: #969799;
  padding-bottom: 10px;
}
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 18px;
}
.cal-cell {
  position: relative;
  aspect-ratio: 1 / 1;
  box-sizing: border-box;
  padding: 8px;
  background-clip: content-box;
  border: 1px solid #ebedf0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 15px;
  color: #323233;
  cursor: pointer;
  user-select: none;
}
.cal-cell:active {
  background: #f2f3f5;
}
.cal-cell.cal-out {
  color: #c8c9cc;
}
.cal-cell.cal-today {
  font-weight: 700;
  color: #667eea;
}
.cal-cell.cal-sel {
  background: #667eea;
  color: #fff;
  border-color: transparent;
  border-radius: 8px;
}
.cal-cell.cal-sel.cal-today {
  color: #fff;
}
.cal-num {
  line-height: 1;
}
.cal-badge {
  position: absolute;
  top: -8px;
  left: -8px;
  z-index: 2;
  min-width: 22px;
  height: 22px;
  padding: 0 4px;
  border-radius: 11px;
  background: #8BC34A;
  color: #ffffff;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
}
</style>
