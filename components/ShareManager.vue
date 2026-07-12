<template>
  <Popup
    :show="show"
    position="bottom"
    round
    :style="{ maxHeight: '82%' }"
    @update:show="(v) => emit('update:show', v)"
  >
    <div class="panel">
      <h3>分享链接管理</h3>
      <p class="tip">每条链接可单独开关「访问」与「修改」权限，关闭访问后他人即无法打开。</p>

      <div v-for="s in shares" :key="s.id" class="share">
        <div class="s-top">
          <span class="s-name">{{ s.name }}</span>
          <button class="s-del" type="button" @click="remove(s)">删除</button>
        </div>
        <div class="s-url" @click="copy(s)">{{ fullUrl(s) }}</div>
        <div class="s-rows">
          <div class="s-row">
            <span>可访问</span>
            <Switch :model-value="s.enabled" @update:model-value="() => toggle(s, 'enabled')" />
          </div>
          <div class="s-row">
            <span>可修改</span>
            <Switch :model-value="s.canEdit" @update:model-value="() => toggle(s, 'canEdit')" />
          </div>
        </div>
      </div>

      <Button class="add-btn" block type="primary" @click="showAdd = true">新增分享链接</Button>
    </div>

    <Popup v-model:show="showAdd" position="bottom" round :style="{ padding: '20px 16px 24px' }">
      <Field v-model="newName" label="分配名" placeholder="如 张三 / 先锋营" :border="false" />
      <div class="add-edit">
        <span>允许修改</span>
        <Switch v-model="newCanEdit" />
      </div>
      <Button block type="primary" :loading="adding" @click="add">生成链接</Button>
    </Popup>
  </Popup>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Popup, Button, Field, Switch, showToast } from 'vant'
import { useAuth } from '@/composables/useAuth'
import type { ShareInfo } from '@/types/gantt'

defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [value: boolean] }>()

const auth = useAuth()
const shares = ref<ShareInfo[]>([])
const showAdd = ref(false)
const newName = ref('')
const newCanEdit = ref(true)
const adding = ref(false)

const code = () => auth.currentRoom.value?.code || ''

async function load() {
  const c = code()
  if (!c) return
  try {
    const res = await $fetch<{ shares: ShareInfo[] }>(`/api/rooms/${encodeURIComponent(c)}/shares`, {
      headers: { Authorization: `Bearer ${auth.sessionToken.value}` }
    })
    shares.value = res.shares
  } catch {
    /* 忽略 */
  }
}

function fullUrl(s: ShareInfo): string {
  return (typeof location !== 'undefined' ? location.origin : '') + s.url
}

async function add() {
  const c = code()
  if (!c || !newName.value.trim()) {
    showToast('请输入分配名')
    return
  }
  adding.value = true
  try {
    await $fetch(`/api/rooms/${encodeURIComponent(c)}/shares`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.sessionToken.value}` },
      body: { name: newName.value.trim(), canEdit: newCanEdit.value }
    })
    showAdd.value = false
    newName.value = ''
    newCanEdit.value = true
    await load()
  } catch (e: any) {
    showToast(e?.data?.message || '创建失败')
  } finally {
    adding.value = false
  }
}

async function toggle(s: ShareInfo, field: 'enabled' | 'canEdit') {
  const c = code()
  try {
    await $fetch(`/api/rooms/${encodeURIComponent(c)}/shares/${s.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${auth.sessionToken.value}` },
      body: { [field]: !s[field] }
    })
    s[field] = !s[field]
  } catch (e: any) {
    showToast(e?.data?.message || '更新失败')
  }
}

async function remove(s: ShareInfo) {
  const c = code()
  try {
    await $fetch(`/api/rooms/${encodeURIComponent(c)}/shares/${s.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${auth.sessionToken.value}` }
    })
    shares.value = shares.value.filter((x) => x.id !== s.id)
  } catch (e: any) {
    showToast(e?.data?.message || '删除失败')
  }
}

function copy(s: ShareInfo) {
  const url = fullUrl(s)
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => showToast('链接已复制')).catch(() => showToast('复制失败'))
  } else {
    showToast('复制失败')
  }
}

onMounted(load)
</script>

<style scoped>
.panel {
  padding: 16px 16px 22px;
  max-height: 82vh;
  overflow-y: auto;
}
.panel h3 {
  font-size: 16px;
  margin-bottom: 6px;
  text-align: center;
}
.tip {
  font-size: 11px;
  color: #969799;
  text-align: center;
  margin-bottom: 14px;
  line-height: 1.5;
}
.share {
  background: #f7f8fa;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 10px;
}
.s-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.s-name {
  font-size: 14px;
  font-weight: 700;
  color: #323233;
}
.s-del {
  border: none;
  background: none;
  color: #ee0a24;
  font-size: 13px;
  cursor: pointer;
}
.s-url {
  margin: 8px 0;
  font-size: 11px;
  color: #1989fa;
  word-break: break-all;
  background: #fff;
  border: 1px solid #ebedf0;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
}
.s-rows {
  display: flex;
  gap: 18px;
}
.s-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #646566;
}
.add-btn {
  margin-top: 6px;
}
.add-edit {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 4px;
  font-size: 14px;
  color: #323233;
}
</style>
