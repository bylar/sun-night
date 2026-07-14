<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Button, showToast } from 'vant'
import { useAdmin } from '@/composables/useAdmin'
import type { AccessLog } from '@/types/gantt'

const admin = useAdmin()
function authHeader() {
  return { Authorization: `Bearer ${admin.adminToken.value}` }
}

const logs = ref<AccessLog[]>([])
const filters = ref({ roomCode: '', identityType: '', action: '' })

const actionText: Record<string, string> = {
  view: '查看',
  create_task: '新增任务',
  update_task: '修改任务',
  delete_task: '删除任务',
  reset: '重置'
}
function identityLabel(t: string): string {
  return t === 'owner' ? '盟主' : t === 'guest' ? '访客' : t === 'admin' ? '管理员' : t
}
function fmtTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

async function loadLogs() {
  const q: string[] = []
  if (filters.value.roomCode.trim()) q.push(`roomCode=${encodeURIComponent(filters.value.roomCode.trim())}`)
  if (filters.value.identityType) q.push(`identityType=${filters.value.identityType}`)
  if (filters.value.action) q.push(`action=${filters.value.action}`)
  const qs = q.length ? `?${q.join('&')}` : ''
  const res = await $fetch<{ logs: AccessLog[] }>(`/api/admin/access-logs${qs}`, { headers: authHeader() })
  logs.value = res.logs
}

onMounted(loadLogs)
</script>

<template>
  <div class="section">
    <div class="filter">
      <input v-model="filters.roomCode" class="f-input" placeholder="房间码筛选" />
      <select v-model="filters.identityType" class="f-input">
        <option value="">全部身份</option>
        <option value="owner">盟主</option>
        <option value="guest">访客</option>
        <option value="admin">管理员</option>
      </select>
      <select v-model="filters.action" class="f-input">
        <option value="">全部动作</option>
        <option value="view">查看</option>
        <option value="create_task">新增任务</option>
        <option value="update_task">修改任务</option>
        <option value="delete_task">删除任务</option>
        <option value="reset">重置</option>
      </select>
      <Button size="small" type="primary" @click="loadLogs">查询</Button>
    </div>

    <div v-if="logs.length === 0" class="empty">暂无日志</div>
    <div v-for="l in logs" :key="l.id" class="log">
      <div class="log-top">
        <span class="log-room">#{{ l.roomCode }}</span>
        <span class="log-act">{{ actionText[l.action] || l.action }}</span>
        <span class="log-id">{{ identityLabel(l.identityType) }}·{{ l.identityName || '-' }}</span>
      </div>
      <div class="log-sub">{{ fmtTime(l.createdAt) }} · {{ l.ip || '' }}</div>
    </div>
  </div>
</template>

<style scoped>
.section {
  padding: 12px;
}
.filter {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.f-input {
  flex: 1;
  min-width: 90px;
  border: 1px solid #ebedf0;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 13px;
}
.log {
  background: #fff;
  border-radius: 12px;
  padding: 10px 14px;
  margin-bottom: 8px;
}
.log-top {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.log-room {
  font-weight: 700;
  color: #323233;
}
.log-act {
  color: #1989fa;
}
.log-id {
  color: #646566;
  margin-left: auto;
}
.log-sub {
  font-size: 11px;
  color: #969799;
  margin-top: 3px;
}
.empty {
  text-align: center;
  color: #969799;
  font-size: 13px;
  padding: 30px 0;
}
</style>
