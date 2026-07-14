<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Field, Button, showToast, showConfirmDialog } from 'vant'
import { useAdmin } from '@/composables/useAdmin'
import type { AdminUser } from '@/types/gantt'

const admin = useAdmin()
function authHeader() {
  return { Authorization: `Bearer ${admin.adminToken.value}` }
}

const users = ref<AdminUser[]>([])
const newUser = ref({ username: '', password: '' })
const addingUser = ref(false)

async function loadUsers() {
  const res = await $fetch<{ users: AdminUser[] }>('/api/admin/users', { headers: authHeader() })
  users.value = res.users
}
async function addUser() {
  if (newUser.value.username.trim().length < 2 || newUser.value.password.length < 6) {
    showToast('账号≥2位，密码≥6位')
    return
  }
  addingUser.value = true
  try {
    await $fetch('/api/admin/users', {
      method: 'POST',
      headers: authHeader(),
      body: { username: newUser.value.username.trim(), password: newUser.value.password }
    })
    newUser.value = { username: '', password: '' }
    await loadUsers()
    showToast('已新增')
  } catch (e: any) {
    showToast(e?.data?.message || '新增失败')
  } finally {
    addingUser.value = false
  }
}
async function toggleDisable(u: AdminUser) {
  try {
    await $fetch(`/api/admin/users/${u.id}`, {
      method: 'PUT',
      headers: authHeader(),
      body: { disabled: !u.disabled }
    })
    u.disabled = !u.disabled
  } catch (e: any) {
    showToast(e?.data?.message || '操作失败')
  }
}
async function removeUser(u: AdminUser) {
  try {
    await showConfirmDialog({ title: '删除账号', message: `确认删除「${u.username}」？其房间也将一并删除。` })
  } catch {
    return
  }
  try {
    await $fetch(`/api/admin/users/${u.id}`, { method: 'DELETE', headers: authHeader() })
    users.value = users.value.filter((x) => x.id !== u.id)
    showToast('已删除')
  } catch (e: any) {
    showToast(e?.data?.message || '删除失败')
  }
}

onMounted(loadUsers)
</script>

<template>
  <div class="section">
    <div class="add-row">
      <Field v-model="newUser.username" label="账号" placeholder="新盟主用户名" :border="false" />
      <Field v-model="newUser.password" type="password" label="密码" placeholder="至少 6 位" :border="false" />
      <Button size="small" type="primary" :loading="addingUser" @click="addUser">新增</Button>
    </div>

    <div v-if="users.length === 0" class="empty">暂无账号</div>
    <div v-for="u in users" :key="u.id" class="row">
      <div class="row-main">
        <span class="row-name">{{ u.username }}</span>
        <span v-if="u.disabled" class="tag tag-off">已禁用</span>
        <span v-else class="tag tag-on">正常</span>
        <span class="row-sub">{{ u.roomCount }} 个房间</span>
      </div>
      <div class="row-ops">
        <button class="op" type="button" @click="toggleDisable(u)">
          {{ u.disabled ? '启用' : '禁用' }}
        </button>
        <button class="op op-danger" type="button" @click="removeUser(u)">删除</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section {
  padding: 12px;
}
.add-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border-radius: 12px;
  padding: 8px 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
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
.tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
}
.tag-on {
  color: #07c160;
  background: #e7f8ee;
}
.tag-off {
  color: #ee0a24;
  background: #fdeaea;
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
