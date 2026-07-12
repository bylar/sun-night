<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Tabs, Tab, Field, Button, Switch, Icon, showToast, showConfirmDialog } from 'vant'
import { useAdmin } from '@/composables/useAdmin'
import type { AdminUser, AdminRoom, AccessLog } from '@/types/gantt'

const admin = useAdmin()
const tab = ref<string>('users')

// ===== 登录 =====
const username = ref('')
const password = ref('')
const token = ref('')
const submitting = ref(false)
const authMethod = ref<'password' | 'token' | 'url'>('token')
const loadingAuthMethod = ref(false)

async function fetchAuthMethod() {
  loadingAuthMethod.value = true
  try {
    authMethod.value = await admin.authMethod()
  } catch {
    authMethod.value = 'token'
  } finally {
    loadingAuthMethod.value = false
  }
}

/** url 方式：从当前页面 ?key= 自动免密登录 */
async function tryUrlLogin() {
  const q = new URLSearchParams(window.location.search)
  const key = q.get('key')
  if (authMethod.value !== 'url' || !key) return
  submitting.value = true
  try {
    await admin.loginByUrlKey(key)
    showToast('欢迎，管理员')
    await loadAll()
  } catch (e: any) {
    showToast(e?.data?.message || '链接无效')
  } finally {
    submitting.value = false
  }
}

async function doLogin() {
  if (authMethod.value === 'password') {
    if (!username.value.trim() || !password.value) {
      showToast('请输入账号和密码')
      return
    }
    submitting.value = true
    try {
      await admin.login(username.value.trim(), password.value)
      showToast('欢迎，管理员')
      await loadAll()
    } catch (e: any) {
      showToast(e?.data?.message || '登录失败')
    } finally {
      submitting.value = false
    }
    return
  }
  if (authMethod.value === 'token') {
    if (!token.value.trim()) {
      showToast('请输入 Token')
      return
    }
    submitting.value = true
    try {
      await admin.loginByToken(token.value.trim())
      showToast('欢迎，管理员')
      await loadAll()
    } catch (e: any) {
      showToast(e?.data?.message || '登录失败')
    } finally {
      submitting.value = false
    }
    return
  }
}

function doLogout() {
  admin.logout()
  users.value = []
  rooms.value = []
  logs.value = []
}

function authHeader() {
  return { Authorization: `Bearer ${admin.adminToken.value}` }
}

// ===== 账号管理 =====
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

// ===== 房间管理 =====
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

// ===== 访问日志 =====
const logs = ref<AccessLog[]>([])
const filters = ref({ roomCode: '', identityType: '', action: '' })
async function loadLogs() {
  const q: string[] = []
  if (filters.value.roomCode.trim()) q.push(`roomCode=${encodeURIComponent(filters.value.roomCode.trim())}`)
  if (filters.value.identityType) q.push(`identityType=${filters.value.identityType}`)
  if (filters.value.action) q.push(`action=${filters.value.action}`)
  const qs = q.length ? `?${q.join('&')}` : ''
  const res = await $fetch<{ logs: AccessLog[] }>(`/api/admin/access-logs${qs}`, { headers: authHeader() })
  logs.value = res.logs
}

async function loadAll() {
  await Promise.all([loadUsers(), loadRooms(), loadLogs()])
}

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

async function onTabChange(name: string) {
  if (!admin.loggedIn.value) return
  if (name === 'users') await loadUsers()
  else if (name === 'rooms') await loadRooms()
  else if (name === 'logs') await loadLogs()
}

onMounted(async () => {
  const ok = await admin.restore()
  if (ok) {
    await loadAll()
    return
  }
  await fetchAuthMethod()
  if (authMethod.value === 'url') {
    await tryUrlLogin()
  }
})
</script>

<template>
  <div class="admin">
    <!-- 未登录：后台登录 -->
    <div v-if="!admin.loggedIn.value" class="login-wrap">
      <div class="card">
        <h1>后台管理</h1>
        <p class="sub">管理账号 · 房间 · 访问日志</p>

        <!-- 方式一：账号密码 -->
        <template v-if="authMethod === 'password'">
          <Field v-model="username" label="管理员" placeholder="config.toml 中的账号" :border="false" />
          <Field v-model="password" type="password" label="密码" placeholder="管理员密码" :border="false" />
          <Button block type="primary" :loading="submitting" @click="doLogin">登录</Button>
        </template>

        <!-- 方式二：固定 Token -->
        <template v-else-if="authMethod === 'token'">
          <Field v-model="token" label="Token" placeholder="config.toml 中的 token" :border="false" />
          <Button block type="primary" :loading="submitting" @click="doLogin">进入后台</Button>
          <p class="hint">凭配置中的固定 Token 直接进入后台（默认方式）。</p>
        </template>

        <!-- 方式三：自定义 URL -->
        <template v-else-if="authMethod === 'url'">
          <p class="hint">当前为「自定义 URL」登录方式。请使用配置中的专属链接（<code>/{{ admin.adminPath.value }}?key=…</code>）访问本页，将自动免密进入后台。</p>
        </template>
      </div>
    </div>

    <!-- 已登录：管理面板 -->
    <template v-else>
      <header class="bar">
        <div class="bar-user">
          <Icon name="manager-o" />
          <span>{{ admin.adminUser.value?.username }}</span>
        </div>
        <button class="bar-btn" type="button" @click="doLogout">退出</button>
      </header>

      <Tabs v-model:active="tab" sticky @change="onTabChange">
        <Tab title="账号" name="users">
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
        </Tab>

        <Tab title="房间" name="rooms">
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
        </Tab>

        <Tab title="访问日志" name="logs">
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
        </Tab>
      </Tabs>
    </template>
  </div>
</template>

<style scoped>
.admin {
  min-height: 100vh;
  background: #f7f8fa;
}
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: linear-gradient(160deg, #2b3a67 0%, #4b3b8f 55%, #7c4d9c 100%);
}
.card {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: 16px;
  padding: 24px 20px 20px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}
.card h1 {
  font-size: 22px;
  font-weight: 800;
  color: #323233;
  text-align: center;
}
.sub {
  margin: 6px 0 18px;
  font-size: 12px;
  color: #969799;
  text-align: center;
}
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 12px;
  background: #fff;
  border-bottom: 1px solid #ebedf0;
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
.hint {
  margin: 12px 2px 0;
  font-size: 12px;
  color: #969799;
  line-height: 1.6;
}
.hint code {
  background: #f2f3f5;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 11px;
  color: #323233;
}
</style>
