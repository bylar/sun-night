/**
 * 任务编辑：内置事务模板库 + 新增/编辑弹窗的全部状态与交互。
 * 对外暴露弹窗可见性、表单、各类 Picker 确认处理，以及保存/删除。
 * 不负责 UI 渲染（由 TaskEditDialog / TemplatePicker 子组件承载）。
 */
import { ref, computed } from 'vue'
import { showConfirmDialog, showToast } from 'vant'
import type { TaskItem, TaskPriority, TaskTemplateId } from '@/types/gantt'
import { useTaskStore } from '@/composables/useTaskStore'
import { parseDateTime, absMinutes, dateOf } from '@/utils/ganttLayout'

// ====== 铺路节奏（与视图一致）======
const PAVING_PACE_MIN: Record<'auto' | 'relay', number> = {
  auto: (3 * 60 + 10) / 60,
  relay: 3
}

// ====== 大营夜间暂停（与夜间相位一致：normal 段 = 09:00–24:00，即分钟 540–1440）======
// 大营仅在白天推进，夜间 00:00–09:00 暂停。例：23:30 建 1.5h 同盟大营 → 次日 10:00 完成。
const CAMP_ACTIVE_START = 540
const DAY_MIN = 1440

/** 绝对分钟 → "YYYY-MM-DD HH:mm" */
function absMinutesToDateTime(abs: number): string {
  const dayNum = Math.floor(abs / DAY_MIN)
  const minutes = ((abs % DAY_MIN) + DAY_MIN) % DAY_MIN
  const d = new Date(dayNum * 86400000) // UTC 零点
  const y = d.getUTCFullYear()
  const mo = d.getUTCMonth() + 1
  const da = d.getUTCDate()
  return `${y}-${pad(mo)}-${pad(da)} ${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

/** 大营结束时间：从开始时间按「夜间暂停」推进 durationMin 分钟（仅白天 09:00–24:00 计耗时） */
function campEndTime(start: string, durationMin: number): string {
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

// ====== 内置事务模板库 ======
export interface TaskTemplate {
  id: TaskTemplateId
  name: string
  icon: string
  color: string
  durationMin?: number
  pavingMode?: '' | 'auto' | 'relay'
  countMode?: 'count' | 'time'
  countValue?: number
  minDurationMin?: number
  stepMin?: number
  customEnd?: boolean
}
export const TEMPLATES: TaskTemplate[] = [
  { id: 'siege', name: '攻城大营', icon: 'fire-o', color: '#ee0a24', durationMin: 60, pavingMode: '', customEnd: false },
  { id: 'ally', name: '同盟大营', icon: 'friends-o', color: '#7232dd', durationMin: 90, pavingMode: '', customEnd: false },
  { id: 'declare', name: '宣战', icon: 'warning-o', color: '#ff976a', durationMin: 60, customEnd: true },
  { id: 'auto-pave', name: '自动铺路', icon: 'logistics', color: '#07c160', pavingMode: 'auto', countMode: 'count', countValue: 10, customEnd: true },
  { id: 'relay-pave', name: '接力铺路', icon: 'exchange', color: '#00b8d4', pavingMode: 'relay', countMode: 'count', countValue: 10, customEnd: true },
  { id: 'custom', name: '自定义事务', icon: 'add-square', color: '#07c160', customEnd: true }
]

export const COLOR_PRESETS = [
  '#07c160', '#ee0a24', '#ff976a', '#1989fa',
  '#7232dd', '#ffcd00', '#323233', '#969799',
  '#00b8d4', '#e91e63'
]

export const pavingOptions = [
  { text: '不铺路', value: '' },
  { text: '自动铺路 (3分10秒/格)', value: 'auto' },
  { text: '接力铺路 (3分/格)', value: 'relay' }
]

// ====== vant 4 Picker @confirm 兼容取值 ======
function pickValues(val: unknown): (string | number)[] {
  if (val && typeof val === 'object' && 'selectedValues' in (val as Record<string, unknown>)) {
    const sv = (val as { selectedValues?: (string | number)[] }).selectedValues
    if (Array.isArray(sv)) return sv
  }
  return Array.isArray(val) ? (val as (string | number)[]) : [val as string | number]
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 今天日期 "YYYY-MM-DD" */
function todayDateStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Date → "YYYY-MM-DD HH:mm" */
function fmtDateTimeFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 在 datetime 基础上加分钟（支持跨天），返回 "YYYY-MM-DD HH:mm" */
function addMinutesToTime(start: string, mins: number): string {
  const { date, minutes } = parseDateTime(start)
  const base = date || todayDateStr()
  const [y, mo, d] = base.split('-').map(Number)
  const dt = new Date(y || 1970, (mo || 1) - 1, d || 1, 0, minutes + mins, 0, 0)
  return fmtDateTimeFromDate(dt)
}

/** 默认开始时间：今天日期 + 就近 5 分钟对齐的时刻 */
function defaultStart(): string {
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

export function useTaskEditor(onSaved?: (dateStr: string) => void) {
  const { addTask, updateTask, removeTask } = useTaskStore()

  const showEditPopup = ref(false)
  const showTemplatePopup = ref(false)
  const editingTask = ref<TaskItem | null>(null)
  const editForm = ref({
    name: '',
    startTime: defaultStart(),
    endTime: '',
    priority: 'medium' as TaskPriority,
    description: '',
    isHighlighted: false,
    pavingMode: '' as '' | 'auto' | 'relay',
    count: '' as string | number,
    color: '' as string,
    template: '' as TaskTemplateId | '',
    durationMin: 0 as number,
    countMode: 'count' as 'count' | 'time',
    countValue: 0 as number,
    minDurationMin: 0 as number,
    stepMin: 1 as number,
    customEnd: true as boolean,
    icon: '' as string
  })

  // 时间 / 铺路 / 间隔 选择器可见性
  const showStartPicker = ref(false)
  const showEndPicker = ref(false)
  const showPavingPicker = ref(false)

  // 时间选择器列：日期 + 时 + 分，1 分钟精度（vant 要求 {text,value} 对象数组）
  const weekdayChar = ['日', '一', '二', '三', '四', '五', '六']
  // 日期列：今天前 60 天 ~ 后 180 天
  const dateCols = Array.from({ length: 241 }, (_, i) => {
    const t = new Date()
    const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + (i - 60))
    const value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const diff = i - 60
    const label =
      diff === 0 ? '今天' : diff === -1 ? '昨天' : diff === 1 ? '明天' : `${d.getMonth() + 1}/${d.getDate()} 周${weekdayChar[d.getDay()]}`
    return { text: label, value }
  })
  const hourCols = Array.from({ length: 24 }, (_, i) => {
    const v = pad(i)
    return { text: v, value: v }
  })
  const minuteCols = Array.from({ length: 60 }, (_, i) => {
    const v = pad(i)
    return { text: v, value: v }
  })
  const timeColumns = [dateCols, hourCols, minuteCols]
  /** datetime → [date, HH, MM]，供 Picker model-value */
  function splitTime(t: string): [string, string, string] {
    const { date, minutes } = parseDateTime(t)
    return [date || todayDateStr(), pad(Math.floor(minutes / 60)), pad(minutes % 60)]
  }

  function resetEditForm() {
    editForm.value = {
      name: '',
      startTime: defaultStart(),
      endTime: '',
      priority: 'medium',
      description: '',
      isHighlighted: false,
      pavingMode: '',
      count: '',
      color: '',
      template: '',
      durationMin: 0,
      countMode: 'count',
      countValue: 0,
      minDurationMin: 0,
      stepMin: 1,
      customEnd: true,
      icon: ''
    }
  }

  function openAdd() {
    editingTask.value = null
    resetEditForm()
    showTemplatePopup.value = true
  }

  function pickTemplate(t: TaskTemplate) {
    resetEditForm()
    editingTask.value = null
    editForm.value.name = t.name
    editForm.value.color = t.color
    editForm.value.icon = t.icon
    editForm.value.template = t.id
    editForm.value.pavingMode = (t.pavingMode ?? '') as '' | 'auto' | 'relay'
    editForm.value.countMode = t.countMode ?? 'count'
    editForm.value.countValue = t.countValue ?? 0
    editForm.value.durationMin = t.durationMin ?? 0
    editForm.value.minDurationMin = t.minDurationMin ?? 0
    editForm.value.stepMin = t.stepMin ?? 1
    editForm.value.customEnd = t.customEnd ?? true

    if (t.durationMin && t.durationMin > 0) {
      // 大营（customEnd=false）按夜间暂停推算；其余按固定时长
      editForm.value.endTime = t.customEnd === false
        ? campEndTime(editForm.value.startTime, t.durationMin)
        : addMinutesToTime(editForm.value.startTime, t.durationMin)
    } else if (t.pavingMode && t.countValue) {
      const pace = PAVING_PACE_MIN[t.pavingMode]
      const mins = Math.round(t.countValue * pace)
      editForm.value.endTime = addMinutesToTime(editForm.value.startTime, mins)
      editForm.value.count = t.countValue
    }

    showTemplatePopup.value = false
    showEditPopup.value = true
  }

  function syncPaveFromEndTime() {
    const pm = editForm.value.pavingMode
    if (!pm) return
    if (editForm.value.countMode === 'time') return
    const s = absMinutes(editForm.value.startTime)
    const e = editForm.value.endTime ? absMinutes(editForm.value.endTime) : s
    const dur = Math.max(0, e - s)
    editForm.value.count = Math.max(0, Math.round(dur / PAVING_PACE_MIN[pm]))
  }

  function onStartConfirm(val: unknown) {
    const v = pickValues(val)
    // [date, HH, MM]
    editForm.value.startTime = `${v[0]} ${v[1] ?? '00'}:${v[2] ?? '00'}`
    showStartPicker.value = false
    if (editForm.value.durationMin > 0) {
      // 大营改开始时间时也按夜间暂停重算结束时间
      editForm.value.endTime = editForm.value.customEnd === false
        ? campEndTime(editForm.value.startTime, editForm.value.durationMin)
        : addMinutesToTime(editForm.value.startTime, editForm.value.durationMin)
    } else {
      syncPaveFromEndTime()
    }
  }
  function onEndConfirm(val: unknown) {
    const arr = pickValues(val)
    // [date, HH, MM] → 绝对分钟
    let end = addMinutesToTime(`${arr[0]} 00:00`, Number(arr[1] ?? 0) * 60 + Number(arr[2] ?? 0))
    const step = editForm.value.stepMin || 1
    const min = editForm.value.minDurationMin || 0
    const s = absMinutes(editForm.value.startTime)
    let m = absMinutes(end)
    if (m - s < min) m = s + min
    if (step > 1) m = s + Math.round((m - s) / step) * step
    if (m < s) m = s
    end = addMinutesToTime(editForm.value.startTime, m - s)
    editForm.value.endTime = end
    showEndPicker.value = false
    syncPaveFromEndTime()
  }
  function onPavingConfirm(val: unknown) {
    const v = pickValues(val)[0]
    editForm.value.pavingMode = (typeof v === 'string' ? v : '') as '' | 'auto' | 'relay'
    if (editForm.value.pavingMode) {
      if (!editForm.value.countMode) editForm.value.countMode = 'count'
      if (!editForm.value.countValue) editForm.value.countValue = 10
    }
    syncPaveFromEndTime()
    showPavingPicker.value = false
  }
  function onCountValueInput(v: string) {
    editForm.value.countValue = Number(v) || 0
    const pm = editForm.value.pavingMode
    if (!pm) return
    const mins = Math.round(editForm.value.countValue * PAVING_PACE_MIN[pm])
    editForm.value.endTime = addMinutesToTime(editForm.value.startTime, mins)
    editForm.value.count = editForm.value.countValue
  }

  function clearEndTime() {
    editForm.value.endTime = ''
    syncPaveFromEndTime()
  }

  function openEdit(task: TaskItem) {
    editingTask.value = task
    resetEditForm()
    const ef = editForm.value
    const f = task
    ef.name = f.name
    ef.startTime = f.startTime
    ef.endTime = f.endTime || ''
    ef.priority = f.priority
    ef.description = f.description || ''
    ef.isHighlighted = !!f.isHighlighted
    ef.pavingMode = (f.pavingMode ?? '') as '' | 'auto' | 'relay'
    ef.count = f.count ?? ''
    ef.color = f.color ?? ''
    ef.template = f.template ?? ''
    ef.durationMin = f.durationMin ?? 0
    ef.countMode = f.countMode ?? 'count'
    ef.countValue = f.countValue ?? 0
    ef.minDurationMin = f.minDurationMin ?? 0
    ef.stepMin = f.stepMin ?? 1
    ef.customEnd = f.customEnd ?? true
    ef.icon = f.icon ?? ''
    showEditPopup.value = true
  }

  function saveTask() {
    if (!editForm.value.name.trim()) {
      showToast('请输入事务名称')
      return
    }
    const ef = editForm.value
    const count = ef.pavingMode
      ? typeof ef.count === 'number'
        ? ef.count
        : ef.countValue || undefined
      : ef.count === ''
        ? undefined
        : Number(ef.count)
    const payload = {
      name: ef.name.trim(),
      startTime: ef.startTime,
      endTime: ef.endTime || undefined,
      priority: ef.priority,
      description: ef.description.trim() || undefined,
      isHighlighted: ef.isHighlighted,
      pavingMode: ef.pavingMode || null,
      color: ef.color || undefined,
      icon: ef.icon || undefined,
      template: (ef.template || undefined) as TaskTemplateId | undefined,
      durationMin: ef.durationMin > 0 ? ef.durationMin : undefined,
      minDurationMin: ef.minDurationMin > 0 ? ef.minDurationMin : undefined,
      stepMin: ef.stepMin > 1 ? ef.stepMin : undefined,
      customEnd: ef.customEnd,
      countMode: ef.pavingMode ? ef.countMode : undefined,
      countValue: ef.pavingMode ? ef.countValue : undefined,
      count: count as number | undefined
    }
    if (editingTask.value) {
      updateTask(editingTask.value.id, payload)
      showToast('已更新')
    } else {
      addTask(payload)
      showToast('已新增')
    }
    showEditPopup.value = false
    // 保存后跳转到任务所在日期
    onSaved?.(dateOf(ef.startTime) || todayDateStr())
  }

  async function deleteTask(task: TaskItem) {
    try {
      await showConfirmDialog({ title: '删除确认', message: `确定删除「${task.name || '该事务'}」吗？` })
      removeTask(task.id)
      showToast('已删除')
    } catch {
      /* 取消 */
    }
  }

  // 铺路「按时间」显示的时长文案
  const paveDurationText = computed(() => {
    const pm = editForm.value.pavingMode
    if (!pm) return ''
    const s = absMinutes(editForm.value.startTime)
    const e = editForm.value.endTime ? absMinutes(editForm.value.endTime) : s
    const dur = Math.max(0, e - s)
    const n = Math.round(dur / PAVING_PACE_MIN[pm])
    return `${Math.floor(dur / 60)}时${dur % 60}分 · 约${n}格`
  })

  return {
    // 状态
    showEditPopup,
    showTemplatePopup,
    editingTask,
    editForm,
    showStartPicker,
    showEndPicker,
    showPavingPicker,
    timeColumns,
    paveDurationText,
    // 方法
    splitTime,
    openAdd,
    pickTemplate,
    onStartConfirm,
    onEndConfirm,
    onPavingConfirm,
    onCountValueInput,
    clearEndTime,
    openEdit,
    saveTask,
    deleteTask
  }
}
