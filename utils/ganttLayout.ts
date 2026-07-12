/**
 * 甘特图左侧色块的轨道（列）分配算法
 *
 * 设计目标：
 * 1. 每个任务是一个时间区间 [start, end]（分钟，跨天连续）。
 * 2. 持续时间用最左侧的一列（或多列）色块纵向延续表示。
 * 3. 当存在包含关系（如 1-9 包含 2-8 包含 3-7 包含 6-6）时，
 *    按「外 → 内」的顺序排在更靠左的轨道（track 0 最外，依次向右）。
 * 4. 当区间互相交叉（重叠但不包含）时，冲突的色块排到更右侧的轨道。
 * 5. 同一时刻可能有多个事务，它们被分配到不同轨道 → 在左侧平行并排。
 *
 * 核心思路（基于贪婪的区间着色）：
 * - 先按「开始时间升序、结束时间降序」排序：长区间（容器）先入列，
 *   天然得到外 → 内的嵌套顺序。
 * - 依次为每个区间分配「第一个空闲轨道」（该轨道最后一个任务的结束 <= 当前开始）。
 *   找不到空闲轨道就新开一条轨道。
 * 这样：包含的区间因为更长、更早起，落在更左（更小 track）轨道；
 *      交叉的区间因为冲突，被推向更右（更大 track）轨道；
 *      同时段多个区间自然落在不同轨道 → 平行并排。
 */

export interface TrackInput {
  id: string
  start: number // 绝对分钟
  end: number // 绝对分钟（瞬时任务 start === end）
}

export interface TrackResult {
  id: string
  track: number // 轨道列号，0 为最左（最外）
}

export interface TrackLayout {
  /** task id -> 轨道列号 */
  tracks: Record<string, number>
  /** 轨道总数（最大列 + 1） */
  totalTracks: number
}

/**
 * 为一组区间分配轨道。
 * @param items 任务区间集合
 * @param containmentBias 是否启用嵌套偏好（默认 true，使包含关系按外→内排列）
 */
export function assignTracks(items: TrackInput[], minGapMin = 0): TrackLayout {
  if (items.length === 0) {
    return { tracks: {}, totalTracks: 0 }
  }

  // 1. 排序：开始时间升序；开始相同则结束时间降序（更长/更外者在前）
  const sorted = [...items].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    return (b.end - b.start) - (a.end - a.start) // 时长降序
  })

  // 2. 贪婪分配
  //    每个轨道记录「已放置区间的有效结束时间」；
  //    有效结束 = max(真实结束, 开始 + minGapMin)，其中 minGapMin 为色块最小高度
  //    对应的分钟数，保证渲染时（按最小高度撑高）任意两色块不重叠。
  const trackEnds: number[] = [] // trackEnds[i] = 第 i 条轨道最后区间的有效结束分钟
  const tracks: Record<string, number> = {}

  for (const item of sorted) {
    // 有效结束：短任务 / 瞬时任务至少占 minGapMin 分钟，避免被后续任务盖住
    const effEnd = Math.max(item.end, item.start + minGapMin)

    // 跨轨道搜索第一个空闲轨道（最小空闲轨道）
    let placed = -1
    for (let t = 0; t < trackEnds.length; t++) {
      if (trackEnds[t] <= item.start) {
        placed = t
        break
      }
    }

    if (placed === -1) {
      placed = trackEnds.length
      trackEnds.push(effEnd)
    } else {
      trackEnds[placed] = effEnd
    }
    tracks[item.id] = placed
  }

  return { tracks, totalTracks: trackEnds.length }
}

/**
 * 解析 "HH:mm" 为当天分钟数。
 */
export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * 解析 datetime。兼容两种格式：
 * - 完整："YYYY-MM-DD HH:mm" → { date: 'YYYY-MM-DD', minutes: 当天分钟 }
 * - 旧版："HH:mm"           → { date: '', minutes: 当天分钟 }
 */
export function parseDateTime(s: string): { date: string; minutes: number } {
  if (!s) return { date: '', minutes: 0 }
  const parts = s.trim().split(/\s+/)
  if (parts.length >= 2) {
    return { date: parts[0], minutes: parseTimeToMinutes(parts[1]) }
  }
  // 单段：含 ':' 视为纯时刻；否则视为纯日期
  if (parts[0].includes(':')) return { date: '', minutes: parseTimeToMinutes(parts[0]) }
  return { date: parts[0], minutes: 0 }
}

/** datetime 的日期部分（"YYYY-MM-DD"，旧版纯时刻返回 ''） */
export function dateOf(s: string): string {
  return parseDateTime(s).date
}

/** datetime 的当天分钟（0-1439） */
export function minutesOf(s: string): number {
  return parseDateTime(s).minutes
}

/**
 * datetime 的「绝对分钟」= 自 1970-01-01 起的天数 * 1440 + 当天分钟。
 * 用于跨天时长计算（end - start）。旧版纯时刻（无日期）按同一天处理。
 */
export function absMinutes(s: string): number {
  const { date, minutes } = parseDateTime(s)
  if (!date) return minutes
  const [y, mo, d] = date.split('-').map(Number)
  const dayNum = Math.floor(Date.UTC(y || 1970, (mo || 1) - 1, d || 1) / 86400000)
  return dayNum * 1440 + minutes
}
