<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Tabs, Tab, Field, Button, Icon, showToast } from 'vant'
import { useAdmin } from '@/composables/useAdmin'
import AdminUsers from '@/components/admin/AdminUsers.vue'
import AdminRooms from '@/components/admin/AdminRooms.vue'
import AdminLogs from '@/components/admin/AdminLogs.vue'

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
}

onMounted(async () => {
  const ok = await admin.restore()
  if (ok) return
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

      <Tabs v-model:active="tab" sticky>
        <Tab title="账号" name="users">
          <AdminUsers />
        </Tab>
        <Tab title="房间" name="rooms">
          <AdminRooms />
        </Tab>
        <Tab title="访问日志" name="logs">
          <AdminLogs />
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
