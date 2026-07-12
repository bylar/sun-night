import { ref } from 'vue'
import type { DayData, TaskItem } from '@/types/gantt'
import { dateOf } from '@/utils/ganttLayout'
import { useApi } from './useApi'
import { useAuth } from './useAuth'

// 模块级单例：所有组件共享同一份房间任务数据
const days = ref<DayData[]>([])
const loaded = ref(false)

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 找到（或按日期升序插入新建）指定日期的 DayData，返回该天引用 */
function ensureDay(dateStr: string): DayData {
  let day = days.value.find((d) => d.date === dateStr)
  if (day) return day
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dObj = new Date(y, (mo || 1) - 1, d || 1)
  day = { date: dateStr, dayOfMonth: dObj.getDate(), dayOfWeek: dObj.getDay(), tasks: [] }
  // 按 date 升序插入，保持 days[0] 为最早日期（视图基准依赖此顺序）
  const idx = days.value.findIndex((x) => x.date > dateStr)
  if (idx < 0) days.value.push(day)
  else days.value.splice(idx, 0, day)
  return day
}

/**
 * 房间级任务数据源（服务端 API 驱动）。
 * 数据来自 /api/rooms/:code/tasks，写入后乐观更新本地，并由 SSE 推送整体替换。
 * 权限由服务端按分享链接判定：guest 无编辑权时本地也禁止增删改。
 */
export function useTaskStore() {
  const api = useApi()
  const auth = useAuth()
  const roomCode = () => auth.currentRoom.value?.code

  async function load() {
    const code = roomCode()
    if (!code) return
    const res = await api(`/api/rooms/${code}/tasks`)
    days.value = res.days
    loaded.value = true
  }

  /** SSE 推送入口：整体替换任务数据（幂等） */
  function setDays(d: DayData[]) {
    days.value = d
  }

  function addTask(payload: Omit<TaskItem, 'id'>) {
    const code = roomCode()
    if (!code || !auth.currentRoom.value?.canEdit) return
    const id =
      globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)
    const task: TaskItem = { ...payload, id }
    // 归属日 = startTime 的日期部分（无日期的旧格式回退到今天）
    const dateStr = dateOf(task.startTime) || todayStr()
    ensureDay(dateStr).tasks.push(task)
    api(`/api/rooms/${code}/tasks`, { method: 'POST', body: { task } }).catch(() => {})
  }

  function updateTask(id: string, patch: Partial<TaskItem>) {
    const code = roomCode()
    if (!code || !auth.currentRoom.value?.canEdit) return
    for (const d of days.value) {
      const i = d.tasks.findIndex((t) => t.id === id)
      if (i < 0) continue
      const merged = { ...d.tasks[i], ...patch }
      const newDate = dateOf(merged.startTime)
      if (newDate && newDate !== d.date) {
        // 开始日期改变：从原天移除，移动到目标天
        d.tasks.splice(i, 1)
        ensureDay(newDate).tasks.push(merged)
        // 原天若已空则清理，避免残留空白天
        if (d.tasks.length === 0) days.value = days.value.filter((x) => x !== d)
      } else {
        d.tasks[i] = merged
      }
      break
    }
    api(`/api/rooms/${code}/tasks/${id}`, { method: 'PUT', body: { patch } }).catch(() => {})
  }

  function removeTask(id: string) {
    const code = roomCode()
    if (!code || !auth.currentRoom.value?.canEdit) return
    days.value = days.value.map((d) => ({
      ...d,
      tasks: d.tasks.filter((t) => t.id !== id)
    }))
    api(`/api/rooms/${code}/tasks/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  function resetData() {
    const code = roomCode()
    if (!code || !auth.currentRoom.value?.isOwner) return
    days.value = []
    api(`/api/rooms/${code}/tasks`, { method: 'DELETE' }).catch(() => {})
  }

  return { days, loaded, load, setDays, addTask, updateTask, removeTask, resetData }
}
