<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useAdmin } from '@/composables/useAdmin'
import LoginPanel from '@/components/LoginPanel.vue'
import RoomList from '@/components/RoomList.vue'

const auth = useAuth()
const admin = useAdmin()
const { loggedIn } = auth

onMounted(async () => {
  await auth.restore()
  await admin.restore()
  await admin.ensurePath()
})
</script>

<template>
  <div class="portal">
    <LoginPanel v-if="!loggedIn" />
    <RoomList v-else />

    <div v-if="admin.loggedIn.value" class="admin-entry">
      <a :href="`/${admin.adminPath.value}`">管理后台</a>
    </div>
  </div>
</template>

<style scoped>
.portal {
  min-height: 100vh;
}
.admin-entry {
  position: fixed;
  right: 12px;
  bottom: 10px;
  font-size: 11px;
}
.admin-entry a {
  color: #969799;
  text-decoration: none;
  opacity: 0.7;
}
</style>
