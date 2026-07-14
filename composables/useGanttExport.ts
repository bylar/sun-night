/**
 * 导出图片：时间范围（datetime）+ 参数（清晰度/画幅/水印/标题）→ 生成画布 → 预览 → 保存。
 * 对外暴露弹窗可见性、范围状态、各类 Picker 确认处理，以及 doExport / 预览确认保存。
 */
import { ref, computed, shallowRef } from 'vue'
import { showToast } from 'vant'
import { useTaskStore } from '@/composables/useTaskStore'
import { buildGanttCanvas, saveCanvasAsPng } from '@/utils/exportImage'
import { hasTasksInRange } from '@/utils/ganttCanvasDraw'

// vant 4 Picker @confirm 兼容取值
function pickValues(val: unknown): (string | number)[] {
  if (val && typeof val === 'object' && 'selectedValues' in (val as Record<string, unknown>)) {
    const sv = (val as { selectedValues?: (string | number)[] }).selectedValues
    if (Array.isArray(sv)) return sv
  }
  return Array.isArray(val) ? (val as (string | number)[]) : [val as string | number]
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function useGanttExport(
  interval: { value: number },
  titleForOffset: (o: number) => string
) {
  const { days } = useTaskStore()

  const showExportPopup = ref(false)
  const exScale = ref(2)
  const exColW = ref(170)
  const exWatermark = ref('')
  const exUseWatermark = ref(false)
  const exTitle = ref('')
  const exActiveNames = ref<string[]>([])
  const exAutoTrim = ref(true) // 自动隐藏首尾空时间格（默认启用）
  const exTrimPad = ref(2) // 首尾保留的空白格数（默认 2）

  // ====== datetime 范围 ======
  function todayDate(): Date {
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth(), t.getDate())
  }
  function dateAt(offset: number, min: number): Date {
    const dt = todayDate()
    dt.setDate(dt.getDate() + offset)
    dt.setHours(Math.floor(min / 60), min % 60, 0, 0)
    return dt
  }
  function offsetOf(d: Date): number {
    return Math.round((d.getTime() - todayDate().getTime()) / 86400000)
  }
  function minOf(d: Date): number {
    return d.getHours() * 60 + d.getMinutes()
  }
  function formatTime(mins: number): string {
    return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`
  }
  function formatDateTime(d: Date): string {
    const off = offsetOf(d)
    const dayLabel =
      off === 0 ? '今天' : off === -1 ? '昨天' : off === 1 ? '明天' : `${d.getMonth() + 1}/${d.getDate()}`
    return `${dayLabel} ${formatTime(minOf(d))}`
  }

  const exStart = ref<Date>(dateAt(0, 0))
  const exEnd = ref<Date>(dateAt(0, 1439))

  // 时间选择器列：天 + 时 + 分（vant 4 Picker 需 {text,value} 对象格式，纯字符串列会导致 confirm 取不到值 → NaN）
  const hourCols = Array.from({ length: 24 }, (_, i) => ({ text: pad2(i), value: pad2(i) }))
  const minuteCols = Array.from({ length: 60 }, (_, i) => ({ text: pad2(i), value: pad2(i) }))
  const dayOptions = computed(() => {
    const arr: { text: string; value: number }[] = []
    for (let o = -2; o <= 10; o++) arr.push({ text: titleForOffset(o), value: o })
    return arr
  })
  const dateTimeColumns = computed(() => [dayOptions.value, hourCols, minuteCols])
  function modelOfDateTime(d: Date): (string | number)[] {
    const [hh, mm] = formatTime(minOf(d)).split(':')
    return [offsetOf(d), hh, mm]
  }

  const scaleOptions = [
    { text: '标准 1x', value: 1 },
    { text: '高清 2x', value: 2 },
    { text: '超清 3x', value: 3 }
  ]

  const showExStartPicker = ref(false)
  const showExEndPicker = ref(false)
  const showExScalePicker = ref(false)
  function onExStartConfirm(val: unknown) {
    const v = pickValues(val)
    const off = Number(v[0])
    const min = Number(v[1]) * 60 + Number(v[2] ?? 0)
    if (Number.isFinite(off) && Number.isFinite(min)) exStart.value = dateAt(off, min)
    showExStartPicker.value = false
  }
  function onExEndConfirm(val: unknown) {
    const v = pickValues(val)
    const off = Number(v[0])
    const min = Number(v[1]) * 60 + Number(v[2] ?? 0)
    if (Number.isFinite(off) && Number.isFinite(min)) exEnd.value = dateAt(off, min)
    showExEndPicker.value = false
  }
  function onExScaleConfirm(val: unknown) {
    const n = Number(pickValues(val)[0])
    if (n) exScale.value = n
    showExScalePicker.value = false
  }

  // ====== 预览 ======
  const showPreview = ref(false)
  const previewUrl = ref('')
  const previewName = ref('')
  const previewCanvas = shallowRef<HTMLCanvasElement | null>(null)

  function doExport() {
    const sOff = offsetOf(exStart.value)
    const eOff = offsetOf(exEnd.value)
    const startAbs = sOff * 1440 + minOf(exStart.value)
    const endAbs = eOff * 1440 + minOf(exEnd.value)
    if (endAbs <= startAbs) {
      showToast('结束时间需晚于开始时间')
      return
    }
    if (!hasTasksInRange(days.value, startAbs, endAbs)) {
      showToast('所选时间范围内没有任务，请重新选择范围')
      return
    }
    const canvas = buildGanttCanvas({
      days: days.value,
      interval: interval.value,
      startAbs,
      endAbs,
      colW: exColW.value,
      scale: exScale.value,
      watermark: exUseWatermark.value ? exWatermark.value : '',
      title: exTitle.value || undefined,
      rangeText: `${formatDateTime(exStart.value)} ~ ${formatDateTime(exEnd.value)}`,
      autoTrim: exAutoTrim.value,
      trimPadCells: exTrimPad.value
    })
    previewCanvas.value = canvas
    previewUrl.value = canvas.toDataURL('image/png')
    previewName.value = `甘特图_${titleForOffset(sOff)}-${titleForOffset(eOff)}.png`
    showExportPopup.value = false
    showPreview.value = true
  }
  function confirmSave() {
    if (previewCanvas.value) saveCanvasAsPng(previewCanvas.value, previewName.value)
    showPreview.value = false
    showToast('已导出图片')
  }
  function reEdit() {
    showPreview.value = false
    showExportPopup.value = true
  }

  return {
    // 状态
    showExportPopup,
    exScale,
    exColW,
    exUseWatermark,
    exWatermark,
    exTitle,
    exActiveNames,
    exAutoTrim,
    exTrimPad,
    exStart,
    exEnd,
    showExStartPicker,
    showExEndPicker,
    showExScalePicker,
    scaleOptions,
    dateTimeColumns,
    modelOfDateTime,
    formatDateTime,
    showPreview,
    previewUrl,
    previewName,
    // 方法
    onExStartConfirm,
    onExEndConfirm,
    onExScaleConfirm,
    doExport,
    confirmSave,
    reEdit
  }
}
