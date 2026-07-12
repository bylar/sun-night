<template>
  <Popup v-model:show="show" position="bottom" round :style="{ height: '92%' }">
    <div class="preview-panel">
      <div class="preview-head">
        <span class="preview-title">预览</span>
        <span class="preview-name">{{ previewName }}</span>
        <Icon name="cross" size="20" @click="show = false" />
      </div>
      <div class="preview-body">
        <img v-if="previewUrl" :src="previewUrl" alt="甘特图预览" />
      </div>
      <div class="preview-actions">
        <Button block round @click="reEdit">重新编辑</Button>
        <Button type="primary" block round @click="confirmSave">保存图片</Button>
      </div>
    </div>
  </Popup>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { Popup, Icon, Button } from 'vant'
import { useGanttExport } from '@/composables/useGanttExport'

const exp = inject<ReturnType<typeof useGanttExport>>('ganttExport')!
const { showPreview: show, previewUrl, previewName, confirmSave, reEdit } = exp
</script>

<style scoped>
.preview-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f7f8fa;
}
.preview-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: #fff;
  border-bottom: 1px solid #ebedf0;
}
.preview-title {
  font-size: 15px;
  font-weight: 700;
  color: #323233;
}
.preview-name {
  flex: 1;
  font-size: 12px;
  color: #969799;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-head .van-icon {
  color: #969799;
}
.preview-body {
  flex: 1;
  overflow: auto;
  padding: 12px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: #eef0f3;
}
.preview-body img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  background: #fff;
}
.preview-actions {
  display: flex;
  gap: 12px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1px solid #ebedf0;
}
</style>
