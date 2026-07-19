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

// ====== 铺路节奏 / 时间计算（抽到 utils/taskTime）======
import {
  PAVING_PACE_MIN,
  CAMP_ACTIVE_START,
  DAY_MIN,
  pad,
  todayDateStr,
  fmtDateTimeFromDate,
  addMinutesToTime,
  defaultStart,
  absMinutesToDateTime,
  campEndTime
} from '@/utils/taskTime'
// ====== 模板常量（抽到 utils/taskTemplates）======
import { type TaskTemplate } from '@/utils/taskTemplates'
// 注：模板常量/时间格式化的唯一来源为 @/utils/taskTemplates 与 @/utils/taskTime，
// 消费者请直接从对应模块引入；此处不再 re-export，避免 Nuxt 自动导入重复告警。

// ====== vant 4 Picker @confirm 兼容取值（仅本模块内部使用）======
function pickValues(val: unknown): (string | number)[] {
  if (val && typeof val === 'object' && 'selectedValues' in (val as Record<string, unknown>)) {
    const sv = (val as { selectedValues?: (string | number)[] }).selectedValues
    if (Array.isArray(sv)) return sv
  }
  return Array.isArray(val) ? (val as (string | number)[]) : [val as string | number]
}

export function useTaskEditor(onSaved?: (dateStr: string) => void) {
  const { addTask, updateTask, removeTask, addTasks, removeBySeries } = useTaskStore()

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

  // ====== 周期计划（批量添加 + 整周期删除）======
  const showRecurringPopup = ref(false)
  const showRStartPicker = ref(false)
  const showREndPicker = ref(false)
  const showRDatePicker = ref(false)
  const rName = ref('')
  const rColor = ref('')
  const rStartTime = ref('08:00')
  const rEndTime = ref('')
  const rCycle = ref<'day' | 'week'>('day')
  const rWeekdays = ref<number[]>([1, 2, 3, 4, 5])
  const rSpanType = ref<'days' | 'weeks' | 'count'>('days')
  const rSpanValue = ref(7)
  const rStartDate = ref(todayDateStr())
  const pendingDeleteTask = ref<TaskItem | null>(null)
  const showSeriesDelete = ref(false)

  // 仅时间选择器（不含日期）：[时, 分]
  const timeOnlyColumns = [hourCols, minuteCols]
  function splitTimeOnly(t: string): [string, string] {
    const [h, m] = (t || '00:00').split(':')
    return [pad(Number(h) || 0), pad(Number(m) || 0)]
  }
  const weekdayOptions = [
    { text: '日', value: 0 },
    { text: '一', value: 1 },
    { text: '二', value: 2 },
    { text: '三', value: 3 },
    { text: '四', value: 4 },
    { text: '五', value: 5 },
    { text: '六', value: 6 }
  ]
  const spanOptions = computed(() =>
    rCycle.value === 'day'
      ? [
          { text: '持续（天）', value: 'days' },
          { text: '次数', value: 'count' }
        ]
      : [
          { text: '持续（周）', value: 'weeks' },
          { text: '次数', value: 'count' }
        ]
  )

  function genId(): string {
    return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)
  }
  function addDays(dateStr: string, n: number): string {
    const [y, mo, d] = dateStr.split('-').map(Number)
    const dt = new Date(y, (mo || 1) - 1, (d || 1))
    dt.setDate(dt.getDate() + n)
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
  }
  function weekdayOf(dateStr: string): number {
    const [y, mo, d] = dateStr.split('-').map(Number)
    return new Date(y, (mo || 1) - 1, (d || 1)).getDay()
  }

  function resetRecurringForm() {
    rName.value = ''
    rColor.value = ''
    rStartTime.value = '08:00'
    rEndTime.value = ''
    rCycle.value = 'day'
    rWeekdays.value = [1, 2, 3, 4, 5]
    rSpanType.value = 'days'
    rSpanValue.value = 7
    rStartDate.value = todayDateStr()
  }
  function openRecurring() {
    resetRecurringForm()
    // 由「AFTER」唤起：预填周期起始日期与时刻为上一事务的结束时间
    if (presetStartTime.value) {
      rStartDate.value = dateOf(presetStartTime.value) || todayDateStr()
      rStartTime.value = (presetStartTime.value.split(' ')[1] || '08:00')
      presetStartTime.value = ''
    }
    showTemplatePopup.value = false
    showRecurringPopup.value = true
  }
  function onRCycleChange() {
    if (rCycle.value === 'day') {
      rSpanType.value = 'days'
      rSpanValue.value = 7
    } else {
      rSpanType.value = 'weeks'
      rSpanValue.value = 4
    }
  }
  function onRStartConfirm(val: unknown) {
    const v = pickValues(val)
    rStartTime.value = `${v[0]}:${v[1]}`
    showRStartPicker.value = false
  }
  function onREndConfirm(val: unknown) {
    const v = pickValues(val)
    rEndTime.value = `${v[0]}:${v[1]}`
    showREndPicker.value = false
  }
  function onRDateConfirm(val: unknown) {
    const v = pickValues(val)
    rStartDate.value = String(v[0])
    showRDatePicker.value = false
  }
  function clearREndTime() {
    rEndTime.value = ''
  }
  /** 根据重复规则生成所有出现日期（ISO YYYY-MM-DD） */
  function buildOccurrenceDates(): string[] {
    const dates: string[] = []
    const start = rStartDate.value
    const n = Math.max(1, Math.floor(rSpanValue.value))
    if (rCycle.value === 'day') {
      for (let i = 0; i < n; i++) dates.push(addDays(start, i))
    } else if (rSpanType.value === 'count') {
      let occ = 0
      let cur = start
      while (occ < n && dates.length < 400) {
        if (rWeekdays.value.includes(weekdayOf(cur))) {
          dates.push(cur)
          occ++
        }
        cur = addDays(cur, 1)
      }
    } else {
      const end = addDays(start, n * 7)
      let cur = start
      let guard = 0
      while (cur <= end && guard < 600) {
        if (rWeekdays.value.includes(weekdayOf(cur))) dates.push(cur)
        cur = addDays(cur, 1)
        guard++
      }
    }
    return dates
  }
  function saveRecurring() {
    if (!rName.value.trim()) {
      showToast('请输入计划名称')
      return
    }
    if (rCycle.value === 'week' && rWeekdays.value.length === 0) {
      showToast('请选择重复的星期')
      return
    }
    const dates = buildOccurrenceDates()
    if (dates.length === 0) {
      showToast('未生成任何日期')
      return
    }
    const seriesId = genId()
    const tasks: TaskItem[] = dates.map((date) => ({
      id: genId(),
      name: rName.value.trim(),
      startTime: `${date} ${rStartTime.value}`,
      endTime: rEndTime.value ? `${date} ${rEndTime.value}` : undefined,
      priority: 'medium',
      color: rColor.value || undefined,
      template: 'recurring',
      seriesId,
      customEnd: true,
      isHighlighted: false
    }))
    addTasks(tasks)
    showToast(`已新增 ${tasks.length} 项`)
    showRecurringPopup.value = false
    onSaved?.(rStartDate.value)
  }

  async function deleteTask(task: TaskItem) {
    if (task.seriesId) {
      pendingDeleteTask.value = task
      showSeriesDelete.value = true
      return
    }
    try {
      await showConfirmDialog({ title: '删除确认', message: `确定删除「${task.name || '该事务'}」吗？` })
      removeTask(task.id)
      showToast('已删除')
    } catch {
      /* 取消 */
    }
  }
  function confirmDeleteOne() {
    const t = pendingDeleteTask.value
    if (!t) return
    removeTask(t.id)
    showToast('已删除本次')
    showSeriesDelete.value = false
    showEditPopup.value = false
    pendingDeleteTask.value = null
  }
  function confirmDeleteSeries() {
    const t = pendingDeleteTask.value
    if (!t || !t.seriesId) return
    removeBySeries(t.seriesId)
    showToast('已删除整个周期')
    showSeriesDelete.value = false
    showEditPopup.value = false
    pendingDeleteTask.value = null
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

  // 预填开始时间：当由「AFTER」唤起新增时，新事务开始时间 = 当前事务结束时间
  const presetStartTime = ref('')

  /** 在当前事务之后新增：关闭编辑弹窗，唤起模板选择流程，并预填开始时间 */
  function addAfter(task: TaskItem) {
    // 瞬时任务无结束时间则退化为开始时间
    presetStartTime.value = task.endTime || task.startTime
    showEditPopup.value = false
    showTemplatePopup.value = true
  }

  function openAdd() {
    editingTask.value = null
    resetEditForm()
    showTemplatePopup.value = true
  }

  /** 在指定时间新建事务：以给定时刻作为预填开始时间，唤起模板选择流程 */
  function openAddAtTime(time: string) {
    presetStartTime.value = time
    showTemplatePopup.value = true
  }

  function pickTemplate(t: TaskTemplate) {
    if (t.id === 'recurring') {
      openRecurring()
      return
    }
    resetEditForm()
    editingTask.value = null
    // 由「AFTER」唤起：预填开始时间为上一事务的结束时间
    if (presetStartTime.value) {
      editForm.value.startTime = presetStartTime.value
      presetStartTime.value = ''
    }
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
    // 周期计划
    showRecurringPopup,
    showRStartPicker,
    showREndPicker,
    showRDatePicker,
    rName,
    rColor,
    rStartTime,
    rEndTime,
    rCycle,
    rWeekdays,
    rSpanType,
    rSpanValue,
    rStartDate,
    dateCols,
    timeOnlyColumns,
    splitTimeOnly,
    weekdayOptions,
    spanOptions,
    showSeriesDelete,
    pendingDeleteTask,
    // 方法
    splitTime,
    openAdd,
    addAfter,
    openAddAtTime,
    pickTemplate,
    onStartConfirm,
    onEndConfirm,
    onPavingConfirm,
    onCountValueInput,
    clearEndTime,
    openEdit,
    saveTask,
    deleteTask,
    openRecurring,
    onRCycleChange,
    onRStartConfirm,
    onREndConfirm,
    onRDateConfirm,
    clearREndTime,
    saveRecurring,
    confirmDeleteOne,
    confirmDeleteSeries
  }
}
