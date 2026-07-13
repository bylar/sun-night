<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { Icon } from 'vant'
import GanttChart from '@/components/GanttChart.vue'
import ShareManager from '@/components/ShareManager.vue'
import { useAuth } from '@/composables/useAuth'
import { useAdmin } from '@/composables/useAdmin'
import { useTaskStore } from '@/composables/useTaskStore'

const route = useRoute()
const auth = useAuth()
const admin = useAdmin()
const store = useTaskStore()
const { canEdit, isOwner, currentRoom } = auth
const showShares = ref(false)
const loading = ref(true)
const error = ref('')

let es: EventSource | null = null

function stopSSE() {
  if (es) {
    es.close()
    es = null
  }
}

// 协同：订阅房间实时事件，整体替换本地任务数据保持多端一致
function startSSE() {
  stopSSE()
  const room = auth.currentRoom.value
  const code = room?.code
  if (!code) return
  let q = ''
  if (room.adminMode && admin.adminToken.value) {
    q = `?session=${encodeURIComponent(admin.adminToken.value)}`
  } else if (room.mode === 'owner' && auth.sessionToken.value) {
    q = `?session=${encodeURIComponent(auth.sessionToken.value)}`
  } else if (room.shareToken) {
    q = `?token=${encodeURIComponent(room.shareToken)}`
  }
  es = new EventSource(`/api/rooms/${encodeURIComponent(code)}/events${q}`)
  es.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data)
      if (msg.type === 'init' || msg.type === 'tasks') store.setDays(msg.payload.days)
    } catch {
      /* 忽略解析错误 */
    }
  }
  es.onerror = () => {}
}

async function enter() {
  loading.value = true
  error.value = ''
  try {
    const code = String(route.params.code || '')
    const urlToken = route.query.token ? String(route.query.token) : null
    const adminMode = route.query.admin === '1'
    if (adminMode && !admin.adminToken.value) {
      navigateTo(`/${admin.adminPath.value}`)
      return
    }
    await auth.enterRoom(code, urlToken, adminMode ? admin.adminToken.value : null)
    await store.load()
    startSSE()
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || '进入房间失败'
  } finally {
    loading.value = false
  }
}

function leave() {
  stopSSE()
  auth.leaveRoom()
  navigateTo('/')
}
function goHome() {
  navigateTo('/')
}

onMounted(async () => {
  await auth.restore()
  await admin.restore()
  await admin.ensurePath()
  await enter()
})
onBeforeUnmount(stopSSE)
</script>

<template>
  <div class="room">
    <div v-if="loading" class="state">加载中…</div>
    <div v-else-if="error" class="state">
      <p class="err-msg">{{ error }}</p>
      <button class="bar-btn" type="button" @click="goHome">返回首页</button>
    </div>
    <template v-else-if="currentRoom">
      <header class="app-bar">
        <button
          v-if="isOwner || currentRoom?.adminMode"
          class="bar-btn bar-back"
          type="button"
          @click="leave"
          aria-label="返回"
        >🏠</button>
        <div class="bar-room">
          <span class="bar-name">{{ currentRoom.name }}</span>
          <span class="bar-code">#{{ currentRoom.code }}</span>
          <span v-if="!canEdit" class="readonly-tag">只读</span>
        </div>
        <button
          v-if="isOwner || currentRoom?.adminMode"
          class="bar-btn"
          type="button"
          @click="showShares = true"
        >
          <Icon name="share-o" />
        </button>
        <span v-else class="bar-guest">访客·{{ currentRoom.guestName }}</span>
      </header>

      <GanttChart />
      <ShareManager v-model:show="showShares" />
    </template>
  </div>
</template>

<style scoped>
.room {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.state {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #646566;
}
.err-msg {
  color: #ee0a24;
  font-size: 14px;
}
.app-bar {
  position: relative;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 12px;
  background: #fff;
  border-bottom: 1px solid #ebedf0;
}
.bar-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  border: none;
  background: none;
  color: #1989fa;
  font-size: 14px;
  cursor: pointer;
}
.bar-back {
  font-size: 20px;
  line-height: 1;
  padding: 0 4px;
}
.bar-room {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.bar-name {
  font-size: 15px;
  font-weight: 700;
  color: #323233;
}
.bar-code {
  font-size: 11px;
  color: #969799;
}
.readonly-tag {
  font-size: 10px;
  font-weight: 700;
  color: #969799;
  background: #f0f1f3;
  padding: 1px 6px;
  border-radius: 8px;
}
.bar-guest {
  font-size: 12px;
  color: #969799;
}
</style>
