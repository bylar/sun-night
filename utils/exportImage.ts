/**
 * 甘特图图片导出：用 Canvas 从数据模型「重绘」（而非截图），
 * 以便做到：高清（scale 倍设备像素）、精确（与屏幕同一套布局逻辑）、
 * 任意画幅（列宽 × 天数自由决定输出尺寸）、可选时间范围、可加水印。
 *
 * 绘制辅助（色彩/夜色渐变/圆角/文字换行/水印/任务几何）见 ganttCanvasDraw.ts，
 * 本文件只负责「主流程」：范围换算 → 布局 → 绘制 → 输出 PNG。
 *
 * 时间范围使用「绝对分钟」（相对今天 00:00），支持跨天 datetime 区间：
 * 每天按自身在 [startAbs, endAbs] 内的可见窗口裁剪，时间标签（Y 轴）绘制在裁剪区外。
 *
 * 超长范围（如 28 天）的处理：不使用「自动降低缩放比例 / 加粗时间粒度」（那样会牺牲清晰度），
 * 而是采用「多列」布局——把天数均分到若干列，每列竖向堆叠，列间用分割线隔开，
 * 从而把画布高度控制在浏览器单边长上限（约 16384px）之内，清晰度由用户选择的 scale 决定。
 */
import { assignTracks } from './ganttLayout'
import type { DayData, TaskItem } from '@/types/gantt'
// CELL_PX 唯一来源为 ganttViewBuild（ganttCanvasDraw 已改为从此引入）
import { CELL_PX, DECLARE_TRAIL_MIN } from '@/utils/ganttViewBuild'
import {
  DEFAULT_TASK_COLOR,
  nightGradient,
  fmtMin,
  tint,
  getBaseDate,
  todayIndexFromDays,
  monthDayForOffset,
  estimateCardPx,
  relMin,
  computeTicks,
  roundRect,
  wrapText,
  drawWatermark
} from './ganttCanvasDraw'

export interface ExportOptions {
  /** 全部天数据（与 store.days 结构一致） */
  days: DayData[]
  /** 每格间隔（分钟），决定像素密度 */
  interval: number
  /** 起始绝对分钟（相对今天 00:00，含天数，可跨天） */
  startAbs: number
  /** 结束绝对分钟（相对今天 00:00，须大于 startAbs） */
  endAbs: number
  /** 每列宽度（逻辑像素）：决定画幅横向尺寸 */
  colW: number
  /** 分辨率倍数：1=标准 / 2=高清 / 3=超清（任意高清） */
  scale: number
  /** 水印文字（空=不加水印） */
  watermark?: string
  /** 顶部标题（空=不加标题栏） */
  title?: string
  /** 顶部时间范围文字（如 "今天 15:00 ~ 明天 22:35"），空=不显示（与 title 任一存在即渲染标题栏） */
  rangeText?: string
  /** 自动隐藏首尾空时间格（将窗口收缩到任务实际占用范围） */
  autoTrim?: boolean
  /** 自动裁剪时首尾各保留的空白格数（美观留白，默认 2） */
  trimPadCells?: number
}

interface PlacedTask {
  task: TaskItem
  start: number
  end: number
  instant: boolean
  lane: number
  /** 所属列（多列布局下用于分列绘制） */
  col: number
  /** 是否为该任务的首个片段（仅首个片段绘制名称，跨列时名称不重复） */
  isFirst: boolean
  cardH: number
  color: string
  ticks: { top: number; count: number }[]
}

interface BuiltDay {
  offset: number
  dayStartAbs: number
  bodyY: number
  winStart: number
  winEnd: number
  winH: number
}

/** 从数据模型构建甘特图 Canvas（逻辑坐标，再按 scale 放大以保证高清） */
export function buildGanttCanvas(opts: ExportOptions): HTMLCanvasElement {
  const { days, interval, startAbs, endAbs, colW, scale, watermark, title, rangeText, autoTrim = false, trimPadCells = 2 } = opts
  const pxPerMin = CELL_PX / interval
  // 标题栏高度（提供 title 或 rangeText 任一即渲染）
  const TITLE_H = title || rangeText ? 44 : 0
  // 时间标签步长：间隔较密时用 30 分钟，避免拥挤（不做「加粗间隔」以牺牲清晰度）
  const labelStep = interval >= 30 ? interval : 30

  const base = getBaseDate(days)
  const ti = todayIndexFromDays(days)
  // startAbs/endAbs 是「相对今天」的绝对分钟；转为相对 baseDate 的统一绝对轴
  let startAbsBase = startAbs + ti * 1440
  let endAbsBase = endAbs + ti * 1440

  // 自动隐藏首尾空时间格：窗口收缩到「首个任务起点」~「末个任务终点」，两端各留 trimPadCells 格
  if (autoTrim) {
    let minStart = Infinity
    let maxEnd = -Infinity
    const seen0 = new Set<string>()
    for (const day of days) {
      for (const t of day.tasks) {
        if (seen0.has(t.id)) continue
        seen0.add(t.id)
        const aStart = relMin(t.startTime, base)
        const aEnd = t.endTime ? Math.max(relMin(t.endTime, base), aStart) : aStart
        if (aStart > endAbsBase || aEnd < startAbsBase) continue // 与窗口无交集
        minStart = Math.min(minStart, Math.max(aStart, startAbsBase))
        maxEnd = Math.max(maxEnd, Math.min(aEnd, endAbsBase))
      }
    }
    if (minStart !== Infinity && maxEnd >= minStart) {
      const pad = Math.max(0, trimPadCells) * interval
      const ns = Math.max(startAbsBase, Math.floor((minStart - pad) / interval) * interval)
      const ne = Math.min(endAbsBase, Math.ceil((maxEnd + pad) / interval) * interval)
      if (ne > ns) {
        startAbsBase = ns
        endAbsBase = ne
      }
    }
  }

  // 标题时间范围始终按「实际渲染范围」（autoTrim 收缩后）显示，而非用户原始选择范围
  const effOff0 = Math.floor(startAbsBase / 1440) - ti
  const effMin0 = ((startAbsBase % 1440) + 1440) % 1440
  const effOff1 = Math.floor(endAbsBase / 1440) - ti
  const effMin1 = ((endAbsBase % 1440) + 1440) % 1440
  const renderRange = `${monthDayForOffset(effOff0)} ${fmtMin(effMin0)} ~ ${monthDayForOffset(effOff1)} ${fmtMin(effMin1)}`

  const startDayOff = Math.floor(startAbsBase / 1440)
  const endDayOff = Math.floor(endAbsBase / 1440)

  // 全局轨道分配：合并所有天到同一绝对轴，跨天任务在延伸到的每一天都参与避让
  const globalItems: { id: string; start: number; end: number }[] = []
  const seen = new Set<string>()
  for (const day of days) {
    for (const t of day.tasks) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      const aStart = relMin(t.startTime, base)
      const dur = t.endTime ? Math.max(relMin(t.endTime, base) - aStart, 0) : 0
      const aEnd = aStart + dur
      // 与屏幕视图一致：仅对真实时长不足卡片最小高度（44px）的短任务补占位，
      // 长任务占位为 0，避免长任务被无谓延后结束时间、把后续本可复用的轨道挤到后面（左侧空白）。
      const MIN_CARD_PX = 44
      const realHpx = dur * pxPerMin
      const padMin = Math.max(0, (MIN_CARD_PX - realHpx) / pxPerMin)
      // 宣战额外「宣战中」色块占用结束后 60 分钟，需计入全局区间，避免导出图中该段时间被同轨道任务覆盖。
      const trailMin = t.template === 'declare' && t.endTime ? DECLARE_TRAIL_MIN : 0
      globalItems.push({ id: t.id, start: aStart, end: aEnd + padMin + trailMin })
    }
  }
  const layout = assignTracks(globalItems, 0)
  const globalTracks = layout.tracks
  const maxLanes = layout.totalTracks || 1
  const laneCount = Math.max(1, maxLanes)

  const GUTTER = 72
  const PAD = 8
  const RAIL_W = 20
  // 多列布局：列间留白（分割区）
  const DIV_W = 18

  // 只渲染 [startAbs, endAbs] 覆盖到的天，按每天各自的可见窗口裁剪
  const dayData: BuiltDay[] = []
  for (let o = startDayOff; o <= endDayOff; o++) {
    const dayStartAbs = o * 1440
    const dayEndAbs = (o + 1) * 1440
    const wStart = Math.max(startAbsBase, dayStartAbs)
    const wEnd = Math.min(endAbsBase, dayEndAbs)
    if (wEnd <= wStart) continue
    const offToday = o - ti
    dayData.push({
      offset: offToday,
      dayStartAbs,
      bodyY: 0,
      winStart: wStart - dayStartAbs,
      winEnd: wEnd - dayStartAbs,
      winH: (wEnd - wStart) * pxPerMin
    })
  }

  if (!dayData.length) {
    // 无可见天（理论上不会被调用，兜底返回 1x1 画布）
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    return c
  }

  // ===== 多列分块：按「每天窗口高度」贪心均衡分到若干列，使每列高度 <= 单边长上限 =====
  const MAX_CANVAS = 16384
  const dayHeights = dayData.map((d) => d.winH)
  const totalDaysHeight = dayHeights.reduce((a, b) => a + b, 0)
  // 单列目标高度（留标题与边距余量）；至少容纳一整天
  const targetPerCol = Math.max(1440 * pxPerMin, (MAX_CANVAS / Math.max(1, scale)) - TITLE_H - 40)
  const colDays: number[][] = []
  {
    let cur: number[] = []
    let curH = 0
    for (let di = 0; di < dayData.length; di++) {
      if (cur.length && curH + dayHeights[di] > targetPerCol) {
        colDays.push(cur)
        cur = []
        curH = 0
      }
      cur.push(di)
      curH += dayHeights[di]
    }
    if (cur.length) colDays.push(cur)
  }
  const K = colDays.length

  // 每列内的天，bodyY 重算为「相对画布顶部的绝对 y」（列从 TITLE_H 起竖向堆叠）
  const dayColumns: number[] = new Array(dayData.length).fill(0)
  const localBodyY: number[] = new Array(dayData.length).fill(0)
  const columnHeights: number[] = []
  const colX: number[] = []
  for (let c = 0; c < K; c++) {
    colX[c] = c * (GUTTER + laneCount * colW + DIV_W)
    let localY = TITLE_H
    let h = 0
    for (const di of colDays[c]) {
      dayColumns[di] = c
      localBodyY[di] = localY
      dayData[di].bodyY = localY
      localY += dayHeights[di]
      h += dayHeights[di]
    }
    columnHeights[c] = h
  }
  const maxColH = Math.max(...columnHeights, 0)
  const bodyW = laneCount * colW
  const contentW = GUTTER + bodyW // 单列宽度
  const fullW = K * contentW + (K - 1) * DIV_W // 整图宽度
  const contentH = TITLE_H + maxColH // 整图高度（取最高列）

  // 跨天任务：逐天裁剪为片段，同一列内连续天合并为一条竖条（名称仅首个片段绘制），
  // 跨列的任务自然在列边界处断开为多段（每列各一段，名称仍只在最前一段）。
  const placed: PlacedTask[] = []
  const seen2 = new Set<string>()
  for (const day of days) {
    for (const t of day.tasks) {
      if (seen2.has(t.id)) continue
      seen2.add(t.id)
      const aStart = relMin(t.startTime, base)
      const dur = t.endTime ? Math.max(relMin(t.endTime, base) - aStart, 0) : 0
      const aEnd = aStart + dur
      const effStart = Math.max(aStart, startAbsBase)
      const effEnd = Math.min(aEnd, endAbsBase)
      if (effEnd <= effStart) continue // 瞬时任务（无 endTime）在画布中不渲染
      const startIdx = Math.floor((effStart - startAbsBase) / 1440)
      const endIdx = Math.floor((effEnd - startAbsBase) / 1440)
      const frags: { di: number; f0: number; f1: number }[] = []
      for (let di = startIdx; di <= endIdx; di++) {
        const d = dayData[di]
        if (!d) continue
        const dayAbsStart = d.dayStartAbs + d.winStart
        const dayAbsEnd = d.dayStartAbs + d.winEnd
        const f0 = Math.max(effStart, dayAbsStart)
        const f1 = Math.min(effEnd, dayAbsEnd)
        if (f1 > f0) frags.push({ di, f0, f1 })
      }
      if (!frags.length) continue
      // 合并同一列且相邻天的片段为一条 bar
      let first = true
      let i = 0
      while (i < frags.length) {
        const col = dayColumns[frags[i].di]
        let j = i
        while (j + 1 < frags.length && dayColumns[frags[j + 1].di] === col && frags[j + 1].di === frags[j].di + 1) j++
        const fTop = frags[i]
        const fBot = frags[j]
        const topDay = dayData[fTop.di]
        const botDay = dayData[fBot.di]
        const top = localBodyY[fTop.di] + (fTop.f0 - (topDay.dayStartAbs + topDay.winStart)) * pxPerMin
        const bottom = localBodyY[fBot.di] + (fBot.f1 - (botDay.dayStartAbs + botDay.winStart)) * pxPerMin
        placed.push({
          task: t,
          start: top,
          end: bottom,
          instant: !t.endTime,
          lane: globalTracks[t.id] ?? 0,
          col,
          isFirst: first,
          cardH: estimateCardPx(t.name, !!t.pavingMode, colW),
          color: t.color || DEFAULT_TASK_COLOR,
          // 刻度相对任务起点（整段只算一次），按当前片段窗口过滤
          ticks: computeTicks(t, aStart, aEnd, pxPerMin, interval, fTop.f0, fBot.f1)
        })
        first = false
        i = j + 1
      }
    }
  }

  // 画布尺寸保护：仅在极端情况下（如单天配合超高 scale 仍超上限）对 scale 做兜底收缩，
  // 不再「加粗时间粒度」，清晰度由用户选择的 scale 决定。
  const finalScale = Math.min(scale, MAX_CANVAS / Math.max(1, fullW), MAX_CANVAS / Math.max(1, contentH))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(fullW * finalScale))
  canvas.height = Math.max(1, Math.round(contentH * finalScale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas // 极端情况画布仍失败，返回空画布由调用方处理
  ctx.scale(finalScale, finalScale)

  // 背景
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, fullW, contentH)

  // 标题栏：提供 title 或 rangeText 任一即渲染。左=标题，右=时间范围（含具体日期+时刻）
  if (title || rangeText) {
    ctx.fillStyle = '#f7f8fa'
    ctx.fillRect(0, 0, fullW, TITLE_H)
    ctx.textBaseline = 'middle'
    if (title) {
      ctx.fillStyle = '#323233'
      ctx.font = '700 18px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(title, PAD, TITLE_H / 2)
    }
    ctx.textAlign = 'right'
    if (rangeText) {
      ctx.fillStyle = '#1989fa'
      ctx.font = '600 14px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.fillText(renderRange, fullW - PAD, TITLE_H / 2)
    } else {
      ctx.fillStyle = '#969799'
      ctx.font = '500 12px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.fillText(`${monthDayForOffset(dayData[0].offset)} ~ ${monthDayForOffset(dayData[dayData.length - 1].offset)}`, fullW - PAD, TITLE_H / 2)
    }
  }

  // ===== 逐列绘制：背景/网格/夜色/时间轴 + 本列任务 =====
  for (let c = 0; c < K; c++) {
    ctx.save()
    ctx.translate(colX[c], 0)

    // 网格 + 夜色渐变 + 时间轴（仅左侧 gutter）
    for (const di of colDays[c]) {
      const d = dayData[di]
      const dayWinH = d.winH
      const bodyY = d.bodyY

      // 裁剪到当天可见时间窗
      ctx.save()
      ctx.beginPath()
      ctx.rect(GUTTER, bodyY, bodyW, dayWinH)
      ctx.clip()

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(GUTTER, bodyY, bodyW, dayWinH)

      // 网格线（按当天分钟窗口）
      ctx.lineWidth = 1
      for (let m = d.winStart; m <= d.winEnd + 0.001; m += labelStep) {
        const gy = bodyY + (m - d.winStart) * pxPerMin
        ctx.strokeStyle = Math.round(m) % 60 === 0 ? '#e3e5e9' : '#f0f1f3'
        ctx.beginPath()
        ctx.moveTo(GUTTER, gy)
        ctx.lineTo(GUTTER + bodyW, gy)
        ctx.stroke()
      }
      ctx.restore()

      // 夜色渐变背景（gutter）
      ctx.fillStyle = nightGradient(ctx, bodyY, dayWinH, d.winStart, d.winEnd)
      ctx.fillRect(0, bodyY, GUTTER, dayWinH)

      // 时间刻度：日界（m===0，即当天的 0:00）显示「月-日 周X」日期代替 00:00，
      // 与屏幕轴 boundary-label 一致；24:00（m===1440）是下一天的 0:00，由下一天在自身顶部绘制。
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#646566'
      ctx.font = '700 13.75px "PingFang SC", monospace'
      const firstM = Math.ceil(d.winStart / labelStep) * labelStep
      for (let m = firstM; m <= d.winEnd + 0.001; m += labelStep) {
        const gy = bodyY + (m - d.winStart) * pxPerMin
        if (m === 0) {
          ctx.fillStyle = '#1989fa'
          ctx.font = '700 13.75px "PingFang SC", sans-serif'
          ctx.fillText(monthDayForOffset(d.offset), GUTTER - 6, gy)
          ctx.fillStyle = '#646566'
          ctx.font = '700 13.75px "PingFang SC", monospace'
          continue
        }
        if (m === 1440) continue
        ctx.fillText(fmtMin(m), GUTTER - 6, gy)
      }
    }

    // 本列任务（裁剪到本列竖向区域）
    ctx.save()
    ctx.beginPath()
    ctx.rect(GUTTER, TITLE_H, bodyW, columnHeights[c])
    ctx.clip()
    for (const t of placed) {
      if (t.col !== c) continue
      const tEnd = t.instant ? t.start : t.end
      const top = t.start
      const height = Math.max(tEnd - t.start, 0)
      if (height <= 0) continue
      const cellX = GUTTER + t.lane * colW + 4
      const cellW = colW - 8
      const cardX = cellX + RAIL_W
      const cardW = cellW - RAIL_W
      let cardH = Math.max(height, 40)
      // 预留事务说明高度（与屏幕 .col-desc 对齐）：说明多行显示，卡片框高随之扩展，上限 144
      let descLines: string[] = []
      if (t.task.description) {
        ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif'
        descLines = wrapText(ctx, t.task.description, cardW - 16)
        const nameH = 6 + 3 * 15
        const paveH = t.task.pavingMode ? 20 : 0
        const descH = descLines.length * 14
        cardH = Math.max(cardH, Math.min(nameH + paveH + descH + 6, 144))
      }

      // 色块（整段连续）：左侧圆角与屏幕一致（仅左上/左下圆角）
      roundRect(ctx, cellX, top, RAIL_W, height, { tl: 6, tr: 0, br: 0, bl: 6 })
      ctx.fillStyle = t.color
      ctx.globalAlpha = 0.95
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.stroke()

      // 名称框（仅首个片段绘制，置于起点）：背景为任务色 10% 透明，右侧圆角
      if (t.isFirst) {
        roundRect(ctx, cardX, top, cardW, cardH, { tl: 0, tr: 6, br: 6, bl: 0 })
        ctx.fillStyle = tint(t.color, 0.1)
        ctx.fill()
        ctx.strokeStyle = t.task.isHighlighted ? '#ee0a24' : 'rgba(0,0,0,0.06)'
        ctx.lineWidth = t.task.isHighlighted ? 2 : 1
        ctx.stroke()

        // 名称（换行，最多 3 行）：颜色与屏幕一致，用任务色（非深灰）
        ctx.fillStyle = t.color
        ctx.font = '600 12px "PingFang SC", "Microsoft YaHei", sans-serif'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        const lines = wrapText(ctx, t.task.name || '事务', cardW - 16)
        let ly = top + 6
        for (const ln of lines.slice(0, 3)) {
          ctx.fillText(ln, cardX + 8, ly)
          ly += 15
        }

        // 铺路标签
        if (t.task.pavingMode) {
          const tag = t.task.pavingMode === 'auto' ? '自动' : '接力'
          ctx.font = '700 10px sans-serif'
          const tw = ctx.measureText(tag).width + 10
          ctx.fillStyle = '#e8f8ef'
          roundRect(ctx, cardX + 8, ly + 2, tw, 16, 8)
          ctx.fill()
          ctx.fillStyle = '#07c160'
          ctx.fillText(tag, cardX + 13, ly + 6)
        }

        // 事务说明（标题下方，10px 浅灰，多行，与屏幕 .col-desc 一致）
        if (descLines.length) {
          ctx.fillStyle = '#646566'
          ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif'
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          let dy = ly + (t.task.pavingMode ? 20 : 4)
          for (const ln of descLines) {
            if (dy > top + cardH - 12) break
            ctx.fillText(ln, cardX + 8, dy)
            dy += 14
          }
        }
      }

      // 累计铺路数（沿整根色块）
      if (t.ticks.length) {
        ctx.font = '800 10px sans-serif'
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        for (const tk of t.ticks) {
          const cy = top + tk.top
          if (cy < top + 4 || cy > top + height - 4) continue
          ctx.fillText(String(tk.count), cellX + RAIL_W / 2, cy)
        }
      }

      // 任务类型图标（色块内，白色，与屏幕 .task-flag 一致）：transfer 🚩 / build 🔧 / recurring ♻
      const railIcon =
        t.task.template === 'transfer' ? '🚩' :
        t.task.template === 'build' ? '🔧' :
        t.task.template === 'recurring' ? '♻' : ''
      if (railIcon) {
        ctx.save()
        // 与屏幕 filter: brightness(0) invert(1) 效果一致，将 emoji 转为白色
        ctx.filter = 'brightness(0) invert(1)'
        ctx.font = '13px sans-serif'
        ctx.fillStyle = '#fff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        // 若同时有累计铺路数，图标上移避免重叠；否则居中
        const cy = t.ticks.length ? top + Math.min(11, height / 2) : top + height / 2
        ctx.fillText(railIcon, cellX + RAIL_W / 2, cy)
        ctx.restore()
      }

      // 瞬时任务：圆点标记
      if (t.instant) {
        ctx.fillStyle = t.color
        ctx.beginPath()
        ctx.arc(cellX + RAIL_W / 2, top + 6, 4, 0, Math.PI * 2)
        ctx.fill()
      }

      // 宣战（declare）结束后追加 1 小时「宣战中」纯色块：与宣战色条同宽、半透明延续色、居中红色 ⚔，
      // 与屏幕视图一致（无名称/描述文字）
      if (t.task.template === 'declare' && t.task.endTime) {
        const trailH = 60 * pxPerMin
        const trTop = tEnd
        const hex = (t.color || '#ff976a').replace('#', '')
        const rgba =
          /^[0-9a-fA-F]{6}$/.test(hex)
            ? `rgba(${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)},0.4)`
            : t.color || '#ff976a'
        roundRect(ctx, cellX, trTop, RAIL_W, trailH, { tl: 6, tr: 0, br: 0, bl: 6 })
        ctx.fillStyle = rgba
        ctx.fill()
        ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'
        ctx.stroke()
        ctx.fillStyle = '#ee0a24'
        ctx.font = '700 20px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('⚔', cellX + RAIL_W / 2, trTop + trailH / 2)
      }
    }
    ctx.restore()

    ctx.restore()
  }

  // ===== 列间分割线（浅色条 + 中心细线），表现「分列」而不喧宾夺主 =====
  for (let c = 0; c < K - 1; c++) {
    const x = colX[c] + contentW + DIV_W / 2
    ctx.fillStyle = '#f0f1f3'
    ctx.fillRect(x - 3, TITLE_H, 6, contentH - TITLE_H)
    ctx.fillStyle = '#dcdee0'
    ctx.fillRect(x - 0.5, TITLE_H, 1, contentH - TITLE_H)
  }

  if (watermark) drawWatermark(ctx, watermark, fullW, contentH)

  return canvas
}

/** 触发浏览器下载 PNG */
export function saveCanvasAsPng(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, 'image/png')
}
