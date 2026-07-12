<template>
  <Popup :show="show" position="bottom" round :style="{ maxHeight: '80%' }" @update:show="(v) => emit('update:show', v)">
    <div class="tpl-popup">
      <h3>选择事务模板</h3>
      <div class="tpl-grid">
        <div v-for="t in TEMPLATES" :key="t.id" class="tpl-cell" @click="pick(t)">
          <div class="tpl-icon" :style="{ background: t.color }">
            <Icon :name="t.icon" size="22" color="#fff" />
          </div>
          <span class="tpl-name">{{ t.name }}</span>
        </div>
      </div>
      <div class="tpl-tip">点击模板自动填充参数，可在下一步编辑名称与颜色</div>
    </div>
  </Popup>
</template>

<script setup lang="ts">
import { Popup, Icon } from 'vant'
import { TEMPLATES, type TaskTemplate } from '@/composables/useTaskEditor'

defineProps<{ show: boolean }>()
const emit = defineEmits<{
  'update:show': [value: boolean]
  pick: [t: TaskTemplate]
}>()

function pick(t: TaskTemplate) {
  emit('pick', t)
  emit('update:show', false)
}
</script>

<style scoped>
.tpl-popup {
  padding: 16px 16px 20px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.tpl-popup h3 {
  font-size: 17px;
  margin-bottom: 14px;
  text-align: center;
}
.tpl-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px 10px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.tpl-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 4px;
  border-radius: 12px;
  background: #f7f8fa;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.tpl-cell:active {
  transform: scale(0.96);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
.tpl-icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);
}
.tpl-name {
  font-size: 12px;
  font-weight: 600;
  color: #323233;
  text-align: center;
  line-height: 1.2;
}
.tpl-tip {
  margin-top: 14px;
  font-size: 11px;
  color: #969799;
  text-align: center;
}
</style>
