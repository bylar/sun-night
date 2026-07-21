/**
 * 内置事务模板库与颜色/铺路选项常量（纯数据，供编辑器与模板选择器复用）。
 */
import type { TaskTemplateId } from '@/types/gantt'

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
  { id: 'transfer', name: '调动', icon: 'down', color: '#1989fa', customEnd: true },
  { id: 'build', name: '建造', icon: 'setting-o', color: '#ff976a', customEnd: true },
  { id: 'recurring', name: '周期计划', icon: 'replay', color: '#7232dd', customEnd: true },
  { id: 'custom', name: '自定义事务', icon: 'add-square', color: '#07c160', customEnd: true }
]

export const COLOR_PRESETS = [
  '#07c160', '#ee0a24', '#ff976a', '#1989fa',
  '#7232dd', '#ffcd00', '#323233', '#969799',
  '#00b8d4', '#e91e63'
]

export const pavingOptions = [
  { text: '不铺路', value: '' },
  { text: '自动铺路 (3分10秒/格·夜间×3)', value: 'auto' },
  { text: '接力铺路 (3分/格·夜间×3)', value: 'relay' }
]
