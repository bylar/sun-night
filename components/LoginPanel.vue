<template>
  <div class="login">
    <div class="card">
      <h1>谋定三国天下</h1>
      <p class="sub">协同作战安排 · 盟主账号登录</p>

      <Field v-model="username" label="账号" placeholder="盟主用户名" :border="false" />
      <Field v-model="password" type="password" label="密码" placeholder="至少 6 位" :border="false" />

      <Button block type="primary" :loading="submitting" @click="submit">
        {{ mode === 'login' ? '登录' : '注册并登录' }}
      </Button>

      <p v-if="registrationEnabled" class="switch" @click="toggleMode">
        {{ mode === 'login' ? '没有账号？立即注册' : '已有账号？去登录' }}
      </p>
      <p v-else class="closed-tip">注册已关闭，请联系管理员开通账号</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Field, Button, showToast } from 'vant'
import { useAuth } from '@/composables/useAuth'

const auth = useAuth()
const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const submitting = ref(false)
const registrationEnabled = ref(true)

onMounted(async () => {
  try {
    const cfg = await $fetch<{ registrationEnabled: boolean }>('/api/config')
    registrationEnabled.value = cfg.registrationEnabled
    if (!cfg.registrationEnabled) mode.value = 'login'
  } catch {
    /* 忽略，默认开放 */
  }
})

function toggleMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
}

async function submit() {
  if (!username.value.trim() || !password.value) {
    showToast('请输入账号和密码')
    return
  }
  submitting.value = true
  try {
    if (mode.value === 'register') await auth.register(username.value.trim(), password.value)
    else await auth.login(username.value.trim(), password.value)
    showToast('欢迎，盟主')
  } catch (e: any) {
    showToast(e?.data?.message || e?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.login {
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
.switch {
  margin-top: 14px;
  font-size: 12px;
  color: #1989fa;
  text-align: center;
  cursor: pointer;
}
</style>
