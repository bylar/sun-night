/** 任务优先级 */
export type TaskPriority = 'high' | 'medium' | 'low'

/** 铺路模式 */
export type PavingMode =
  | 'auto' // 自动铺路：占领 9 分钟 + 行路 10 秒 = 550 秒/格（深夜×3 = 1630 秒/格）
  | 'relay' // 接力铺路：省去行路，9 分钟 = 540 秒/格（深夜×3 = 1620 秒/格）
  | null // 不铺路

/** 内置事务模板类型（点击后自动填充参数） */
export type TaskTemplateId =
  | 'pave' // 铺路（手动单格耗时，无预设）
  | 'siege' // 攻城大营（固定 1 小时）
  | 'ally' // 同盟大营（固定 1.5 小时）
  | 'declare' // 宣战（默认 1h，可 10 分钟粒度自定义）
  | 'auto-pave' // 自动铺路（填格数 / 时间互转）
  | 'relay-pave' // 接力铺路（填格数 / 时间互转）
  | 'custom' // 自定义事务

/** 房间访问模式：盟主本身（owner）或分享链接匿名访客（guest） */
export type AccessMode = 'owner' | 'guest'

/** 进入房间后服务端下发的访问上下文 */
export interface RoomAccess {
  mode: AccessMode
  isOwner: boolean
  canEdit: boolean
  /** guest 模式下的分享分配名 */
  name?: string
}

/** 分享链接信息（盟主管理用） */
export interface ShareInfo {
  id: string
  name: string
  token: string
  /** 完整可分享 URL（含 ?token=） */
  url: string
  canEdit: boolean
  enabled: boolean
  createdAt: number
}

/** 盟主账号信息 */
export interface OwnerUser {
  id: string
  username: string
}

/** 盟主房间列表项 */
export interface RoomSummary {
  code: string
  name: string
  shareCount: number
}

/** 后台公开配置（无需鉴权） */
export interface PublicConfig {
  registrationEnabled: boolean
}

/** 后台：账号信息（含状态与房间数） */
export interface AdminUser {
  id: string
  username: string
  disabled: boolean
  createdAt: number
  roomCount: number
}

/** 后台：房间信息（含盟主名、分享数、任务数） */
export interface AdminRoom {
  code: string
  name: string
  ownerName: string
  shareCount: number
  taskCount: number
  createdAt: number
}

/** 后台：访问日志条目 */
export interface AccessLog {
  id: string
  roomCode: string
  identityType: 'owner' | 'guest' | 'admin'
  identityName: string | null
  action: string
  ip: string | null
  userAgent: string | null
  createdAt: number
}

/** 单个任务项 */
export interface TaskItem {
  id: string
  name: string
  priority: TaskPriority
  startTime: string // "HH:mm"
  endTime?: string // "HH:mm" 可选，持续型任务
  description?: string // 详细描述
  isHighlighted?: boolean // 高亮显示
  color?: string // 自定义颜色
  count?: number // 旧版手动计数（已被铺路自动计算取代，保留兼容）
  icon?: string // Vant图标名（模板默认图标）
  pavingMode?: PavingMode // 预设铺路模式（可选）
  template?: TaskTemplateId // 来源模板（用于默认命名 / 颜色提示，不参与渲染）
  durationMin?: number // 固定/默认时长（分钟），用于模板自动设定 endTime
  minDurationMin?: number // 最短时长（分钟），如宣战最小 1h
  stepMin?: number // 时间粒度（分钟），如宣战 10 分钟
  customEnd?: boolean // 是否允许用户改时长
  countMode?: 'count' | 'time' // 铺路填写方式：按格数 / 按时长
  countValue?: number // 铺路数值（格数或分钟，依 countMode）
}

/** 一天的数据 */
export interface DayData {
  date: string // "2024-01-17"
  dayOfMonth: number // 17
  dayOfWeek: number // 0-6 (0=周日)
  tasks: TaskItem[]
}

/** 甘特图配置 */
export interface GanttConfig {
  startHour: number // 开始时间(小时)
  endHour: number // 结束时间(小时)
  timeInterval: number // 时间间隔(分钟)
}
