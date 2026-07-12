<template>
  <div class="list">
    <header class="bar">
      <div class="bar-user">
        <Icon name="manager-o" />
        <span>{{ auth.currentUser.value?.username }}</span>
      </div>
      <button class="bar-btn" type="button" @click="logout">退出</button>
    </header>

    <h2 class="title">我的同盟</h2>

    <div v-if="loading" class="hint">加载中…</div>
    <div v-else-if="rooms.length === 0" class="empty">
      <p>还没有房间，点击下方创建第一个同盟作战室。</p>
    </div>

    <div v-for="r in rooms" :key="r.code" class="room-card" @click="openRoom(r.code)">
      <div class="r-info">
        <span class="r-name">{{ r.name }}</span>
        <span class="r-code">#{{ r.code }}</span>
      </div>
      <span class="r-shares">{{ r.shareCount }} 条分享</span>
      <Icon
        name="delete-o"
        class="r-del"
        @click.stop="remove(r)"
      />
      <Icon name="arrow" class="r-arrow" />
    </div>

    <button class="fab" type="button" @click="showCreate = true">
      <Icon name="plus" size="24" color="#fff" />
    </button>

    <Popup v-model:show="showCreate" position="bottom" round :style="{ padding: '20px 16px 24px' }">
      <Field v-model="newName" label="房间名" placeholder="如 赤壁同盟" :border="false" />
      <Field v-model="newCode" label="房间码" placeholder="留空自动生成（如 ALLY1A2B3）" :border="false" />
      <Button block type="primary" :loading="creating" @click="create">创建并进入</Button>
    </Popup>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Icon, Button, Field, Popup, showToast, showConfirmDialog } from 'vant'
import { useAuth } from '@/composables/useAuth'
import type { RoomSummary } from '@/types/gantt'

const auth = useAuth()
const rooms = ref<RoomSummary[]>([])
const loading = ref(false)
const showCreate = ref(false)
const newCode = ref('')
const newName = ref('')
const creating = ref(false)

async function load() {
  loading.value = true
  try {
    const res = await $fetch<{ rooms: RoomSummary[] }>('/api/rooms', {
      headers: { Authorization: `Bearer ${auth.sessionToken.value}` }
    })
    rooms.value = res.rooms
  } catch {
    /* 忽略 */
  } finally {
    loading.value = false
  }
}

async function remove(r: RoomSummary) {
  try {
    await showConfirmDialog({
      title: '删除同盟',
      message: `确定删除「${r.name}」(#${r.code}) 吗？\n该房间内的全部日程、任务与分享链接都会被清除，且不可恢复。`
    })
  } catch {
    return // 用户取消
  }
  try {
    await $fetch(`/api/rooms/${encodeURIComponent(r.code)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${auth.sessionToken.value}` }
    })
    showToast('已删除')
    await load()
  } catch (e: any) {
    showToast(e?.data?.message || '删除失败')
  }
}

function openRoom(code: string) {
  navigateTo(`/r/${encodeURIComponent(code)}`)
}

async function create() {
  if (!newName.value.trim()) {
    showToast('请输入房间名')
    return
  }
  creating.value = true
  try {
    const res = await $fetch<{ room: { code: string; name: string } }>('/api/rooms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.sessionToken.value}` },
      body: { code: newCode.value.trim() || undefined, name: newName.value.trim() }
    })
    showCreate.value = false
    newCode.value = ''
    newName.value = ''
    await load()
    navigateTo(`/r/${encodeURIComponent(res.room.code)}`)
  } catch (e: any) {
    showToast(e?.data?.message || '创建失败')
  } finally {
    creating.value = false
  }
}

function logout() {
  auth.logout()
}

onMounted(load)
</script>

<style scoped>
.list {
  min-height: 100vh;
  background: #f7f8fa;
  padding: 0 12px 80px;
}
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 4px;
}
.bar-user {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 700;
  color: #323233;
}
.bar-btn {
  border: none;
  background: none;
  color: #1989fa;
  font-size: 14px;
  cursor: pointer;
}
.title {
  font-size: 16px;
  color: #646566;
  margin: 8px 4px 12px;
}
.hint,
.empty {
  text-align: center;
  color: #969799;
  font-size: 13px;
  padding: 30px 0;
}
.room-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border-radius: 12px;
  padding: 16px 14px;
  margin-bottom: 10px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  cursor: pointer;
}
.r-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
}
.r-name {
  font-size: 15px;
  font-weight: 700;
  color: #323233;
}
.r-code {
  font-size: 11px;
  color: #969799;
}
.r-shares {
  font-size: 12px;
  color: #1989fa;
}
.r-arrow {
  color: #c8c9cc;
}
.r-del {
  color: #ee0a24;
  font-size: 18px;
  padding: 4px 6px;
  margin-right: 2px;
}
.fab {
  position: fixed;
  right: 20px;
  bottom: 28px;
  width: 52px;
  height: 52px;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 18px rgba(102, 126, 234, 0.5);
  cursor: pointer;
}
</style>
