/**
 * 甘特图组件的「展示工具」：纯函数/常量（颜色转透明、网格背景、时刻标签、夜间渐变）。
 * 从 GanttChart.vue 的 <script> 抽出，降低组件复杂度，便于复用。
 */
import { CELL_PX, MINUTES_PER_DAY } from '@/utils/ganttViewBuild'
// 注：tint 唯一来源为 @/utils/ganttCanvasDraw，消费者请直接从该模块引入，此处不再 re-export。

export function formatTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// 深夜/浅夜 平滑渐变（仅用于 Y 轴时间轴背景），半透明以便透出时刻线
export const PHASE_GRADIENT =
  'linear-gradient(to bottom,' +
  'rgba(120,130,190,0.10) 0%,' +
  'rgba(46,54,92,0.22) 4.6%,' +
  'rgba(46,54,92,0.22) 32.6%,' +
  'rgba(120,130,190,0.10) 37%,' +
  'rgba(120,130,190,0.0) 39.5%,' +
  'rgba(120,130,190,0.0) 100%)'

// 网格背景：每 CELL_PX 画一条横线
export function buildGridStyle(): Record<string, string> {
  return {
    backgroundImage: 'linear-gradient(to bottom, #ebedf0 0 1px, transparent 1px)',
    backgroundSize: `100% ${CELL_PX}px`,
    backgroundRepeat: 'repeat-y'
  }
}

export interface TimeLabel {
  top: number
  text: string
  boundary: boolean
}

// 时间轴标签：每段只渲染 [0, 1440) 的标签；m=0 即「当天顶部 / 前一天 24:00」边界，
// 用日期代替时间，避免相邻两天 0:00 与 24:00 文字重叠
export function buildTimeLabels(pxPerMin: number, labelStep: number): TimeLabel[] {
  const arr: TimeLabel[] = []
  for (let m = 0; m < MINUTES_PER_DAY; m += labelStep) {
    arr.push({ top: m * pxPerMin, text: formatTime(m), boundary: m === 0 })
  }
  return arr
}
