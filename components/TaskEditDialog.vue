<template>
  <Popup v-model:show="show" position="bottom" round :style="{ maxHeight: '85%' }">
    <div class="edit-popup">
      <h3>{{ editingTask ? '编辑事务' : '新增事务' }}</h3>

      <Field v-model="editForm.name" label="事务标题" placeholder="如：开交宣战 / 纳粮双城" :border="false" />

      <Cell title="开始时间" :value="fmtDateTime(editForm.startTime)" is-link @click="showStartPicker = true" />
      <Cell
        v-if="!editForm.pavingMode"
        title="结束时间"
        :value="editForm.endTime ? fmtDateTime(editForm.endTime) : '无（瞬时）'"
        :is-link="editForm.customEnd"
        @click="editForm.customEnd && (showEndPicker = true)"
      />
      <Cell
        v-if="!editForm.pavingMode && editForm.endTime && editForm.customEnd"
        title="清除结束时间"
        value="设为瞬时"
        is-link
        @click="clearEndTime"
      />

      <!-- 铺路模式 + 格数/时间互转（两种铺路预设的铺路模式固定，仅展示不可改） -->
      <template v-if="editForm.pavingMode">
        <Cell
          title="铺路模式"
          :value="pavingOptions.find((p) => p.value === editForm.pavingMode)?.text"
          :is-link="editForm.template !== 'auto-pave' && editForm.template !== 'relay-pave'"
          @click="(editForm.template !== 'auto-pave' && editForm.template !== 'relay-pave') && (showPavingPicker = true)"
        />
        <Cell title="填写方式" center>
          <template #value>
            <Button
              size="mini"
              :type="editForm.countMode === 'count' ? 'primary' : 'default'"
              @click="editForm.countMode = 'count'"
              >按格数</Button
            >
            <Button
              size="mini"
              :type="editForm.countMode === 'time' ? 'primary' : 'default'"
              @click="editForm.countMode = 'time'"
              style="margin-left: 8px"
              >按时间</Button
            >
          </template>
        </Cell>
        <Field
          v-if="editForm.countMode === 'count'"
          :model-value="String(editForm.countValue)"
          @update:model-value="onCountValueInput"
          label="格数"
          type="digit"
          placeholder="铺路格数"
          :border="false"
        />
        <!-- 结束时间：铺路推算结果。按格数时由系统计算（只读）；按时间时点选时间（按时间铺路） -->
        <Cell
          :title="editForm.countMode === 'count' ? '预计结束时间' : '结束时间'"
          :value="editForm.endTime ? fmtDateTime(editForm.endTime) : '—'"
          :is-link="editForm.countMode === 'time'"
          @click="editForm.countMode === 'time' && (showEndPicker = true)"
        />
      </template>

      <!-- 自定义事务提示 -->
      <template v-else-if="editForm.template === 'custom'">
        <Cell
          title="铺路模式"
          :value="pavingOptions.find((p) => p.value === editForm.pavingMode)?.text"
          is-link
          @click="showPavingPicker = true"
        />
      </template>

      <Cell title="卡片颜色">
        <template #value>
          <div class="color-picker">
            <span
              v-for="c in COLOR_PRESETS"
              :key="c"
              class="color-swatch"
              :class="{ selected: editForm.color === c }"
              :style="{ background: c }"
              @click="editForm.color = c"
            ></span>
          </div>
        </template>
      </Cell>

      <Cell title="优先级" v-if="editForm.template !== 'siege' && editForm.template !== 'ally'">
        <template #value>
          <Button
            size="mini"
            :type="
              editForm.priority === 'high'
                ? 'danger'
                : editForm.priority === 'medium'
                  ? 'warning'
                  : 'default'
            "
            @click="
              editForm.priority =
                editForm.priority === 'high' ? 'medium' : editForm.priority === 'medium' ? 'low' : 'high'
            "
          >
            {{ editForm.priority === 'high' ? '高' : editForm.priority === 'medium' ? '中' : '低' }}
          </Button>
        </template>
      </Cell>

      <Field
        v-model="editForm.description"
        label="事务说明"
        type="textarea"
        rows="2"
        autosize
        placeholder="补充说明（可选）"
        :border="false"
      />

      <Field
        v-if="!editForm.pavingMode && editForm.template !== 'siege' && editForm.template !== 'ally'"
        v-model="editForm.count"
        label="计数"
        type="digit"
        placeholder="右侧数字（可选）"
        :border="false"
      />

      <Cell title="高亮重点" center>
        <template #right-icon>
          <Switch v-model="editForm.isHighlighted" size="20" />
        </template>
      </Cell>

      <div class="edit-actions">
        <Button v-if="editingTask && canEdit" block type="danger" plain @click="deleteTask(editingTask)">
          删除
        </Button>
        <Button block type="primary" :class="{ disabled: !canEdit }" @click="canEdit && saveTask()">
          保存
        </Button>
      </div>
    </div>

    <!-- 开始时间选择器（日期 + 时 + 分） -->
    <Popup v-model:show="showStartPicker" position="bottom" round>
      <Picker
        :columns="timeColumns"
        :model-value="splitTime(editForm.startTime)"
        @confirm="onStartConfirm"
        @cancel="showStartPicker = false"
        title="开始时间"
      />
    </Popup>
    <!-- 结束时间选择器（日期 + 时 + 分，可跨天） -->
    <Popup v-model:show="showEndPicker" position="bottom" round>
      <Picker
        :columns="timeColumns"
        :model-value="splitTime(editForm.endTime || editForm.startTime)"
        @confirm="onEndConfirm"
        @cancel="showEndPicker = false"
        title="结束时间"
      />
    </Popup>
    <!-- 铺路选择器 -->
    <Popup v-model:show="showPavingPicker" position="bottom" round>
      <Picker
        :columns="[pavingOptions]"
        :model-value="[editForm.pavingMode]"
        @confirm="onPavingConfirm"
        @cancel="showPavingPicker = false"
        title="预设铺路"
      />
    </Popup>
  </Popup>
</template>

<script setup lang="ts">
import { inject, ref, type Ref } from 'vue'
import { Popup, Field, Cell, Button, Switch, Picker } from 'vant'
import { COLOR_PRESETS, pavingOptions, useTaskEditor, fmtDateTime } from '@/composables/useTaskEditor'

const editor = inject<ReturnType<typeof useTaskEditor>>('taskEditor')!
// 权限：viewer 只读，禁用保存 / 删除（防御性，主入口已在 GanttChart 拦截）
const canEdit = inject<Ref<boolean>>('canEdit', ref(true))
// 解构到顶层，模板自动解包；与父级共享同一实例
const {
  showEditPopup: show,
  editingTask,
  editForm,
  showStartPicker,
  showEndPicker,
  showPavingPicker,
  timeColumns,
  paveDurationText,
  splitTime,
  onStartConfirm,
  onEndConfirm,
  onPavingConfirm,
  onCountValueInput,
  clearEndTime,
  saveTask,
  deleteTask
} = editor
</script>

<style scoped>
.edit-popup {
  padding: 16px;
  max-height: 80vh;
  overflow-y: auto;
}
.edit-popup h3 {
  font-size: 17px;
  margin-bottom: 12px;
  text-align: center;
}
.edit-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}
.edit-actions .disabled {
  opacity: 0.6;
}

/* 颜色选择器 */
.color-picker {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px 0;
  justify-content: flex-end;
}
.color-swatch {
  box-sizing: border-box;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1);
  transition: transform 0.1s ease;
}
.color-swatch.selected {
  transform: scale(1.18);
  position: relative;
  z-index: 1;
  box-shadow: 0 0 0 2px #1989fa, inset 0 0 0 1px rgba(0, 0, 0, 0.1);
}
</style>
