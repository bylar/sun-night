<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Button, showToast, showConfirmDialog } from 'vant'
import { useAdmin } from '@/composables/useAdmin'
import type { AdminRoom } from '@/types/gantt'

const admin = useAdmin()
function authHeader() {
  return { Authorization: `Bearer ${admin.adminToken.value}` }
}

const rooms = ref<AdminRoom[]>([])

async function loadRooms() {
  const res = await $fetch<{ rooms: AdminRoom[] }>('/api/admin/rooms', { headers: authHeader() })
  rooms.value = res.rooms
}
function openRoom(code: string) {
  navigateTo(`/r/${encodeURIComponent(code)}?admin=1`)
}
async function removeRoom(r: AdminRoom) {
  try {
    await showConfirmDialog({ title: '删除房间', message: `确认删除房间「${r.name}」(#${r.code})？` })
  } catch {
    return
  }
  try {
    await $fetch(`/api/admin/rooms/${r.code}`, { method: 'DELETE', headers: authHeader() })
    rooms.value = rooms.value.filter((x) => x.code !== r.code)
    showToast('已删除')
  } catch (e: any) {
    showToast(e?.data?.message || '删除失败')
  }
}

onMounted(loadRooms)
</script>

<template>
  <div class="section">
    <div v-if="rooms.length === 0" class="empty">暂无房间</div>
    <div v-for="r in rooms" :key="r.code" class="row">
      <div class="row-main">
        <span class="row-name">{{ r.name }}</span>
        <span class="row-sub">#{{ r.code }} · {{ r.ownerName }} · {{ r.shareCount }} 分享 · {{ r.taskCount }} 任务</span>
      </div>
      <div class="row-ops">
        <button class="op" type="button" @click="openRoom(r.code)">打开</button>
        <button class="op op-danger" type="button" @click="removeRoom(r)">删除</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section {
  padding: 12px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
}
.row-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.row-name {
  font-size: 15px;
  font-weight: 700;
  color: #323233;
}
.row-sub {
  font-size: 12px;
  color: #969799;
}
.row-ops {
  display: flex;
  gap: 8px;
}
.op {
  border: 1px solid #ebedf0;
  background: #fff;
  color: #1989fa;
  font-size: 13px;
  border-radius: 8px;
  padding: 5px 12px;
  cursor: pointer;
}
.op-danger {
  color: #ee0a24;
  border-color: #f5c6c6;
}
.empty {
  text-align: center;
  color: #969799;
  font-size: 13px;
  padding: 30px 0;
}
</style>
