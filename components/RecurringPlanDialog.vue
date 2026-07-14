<template>
  <Popup v-model:show="show" position="bottom" round :style="{ maxHeight: '90%' }">
    <div class="rec-popup">
      <h3>周期计划（批量添加）</h3>

      <Field v-model="rName" label="计划名称" placeholder="如：每日联盟任务" :border="false" />

      <Cell title="起始日期" :value="rStartDate" is-link @click="showRDatePicker = true" />
      <Cell title="开始时间" :value="rStartTime" is-link @click="showRStartPicker = true" />
      <Cell title="结束时间" :value="rEndTime ? rEndTime : '无（瞬时）'" :is-link="true" @click="showREndPicker = true" />
      <Cell v-if="rEndTime" title="清除结束时间" value="设为瞬时" is-link @click="clearREndTime" />

      <Cell title="重复周期">
        <template #value>
          <Button size="mini" :type="rCycle === 'day' ? 'primary' : 'default'" @click="setCycle('day')">天</Button>
          <Button size="mini" :type="rCycle === 'week' ? 'primary' : 'default'" @click="setCycle('week')" style="margin-left: 8px">周</Button>
        </template>
      </Cell>

      <template v-if="rCycle === 'week'">
        <Cell title="重复星期">
          <template #value>
            <div class="wd-row">
              <span
                v-for="w in weekdayOptions"
                :key="w.value"
                class="wd-chip"
                :class="{ on: rWeekdays.includes(w.value) }"
                @click="toggleWd(w.value)"
                >{{ w.text }}</span
              >
            </div>
          </template>
        </Cell>
      </template>

      <Cell title="持续方式">
        <template #value>
          <Button
            v-for="o in spanOptions"
            :key="o.value"
            size="mini"
            :type="rSpanType === o.value ? 'primary' : 'default'"
            @click="rSpanType = o.value"
            style="margin-left: 8px"
            >{{ o.text }}</Button
          >
        </template>
      </Cell>

      <Field
        :model-value="String(rSpanValue)"
        @update:model-value="(v: string) => (rSpanValue = Number(v) || 1)"
        label="持续数量"
        type="digit"
        :placeholder="rCycle === 'day' ? '天数 / 次数' : '周数 / 次数'"
        :border="false"
      />

      <Cell title="卡片颜色">
        <template #value>
          <div class="color-picker">
            <span
              v-for="c in COLOR_PRESETS"
              :key="c"
              class="color-swatch"
              :class="{ selected: rColor === c }"
              :style="{ background: c }"
              @click="rColor = c"
            ></span>
          </div>
        </template>
      </Cell>

      <div class="edit-actions">
        <Button block type="primary" :class="{ disabled: !canEdit }" @click="canEdit && saveRecurring()">
          批量添加
        </Button>
      </div>
    </div>

    <!-- 起始日期选择器 -->
    <Popup v-model:show="showRDatePicker" position="bottom" round>
      <Picker
        :columns="[dateCols]"
        :model-value="[rStartDate]"
        @confirm="onRDateConfirm"
        @cancel="showRDatePicker = false"
        title="起始日期"
      />
    </Popup>
    <!-- 开始时间（仅时间） -->
    <Popup v-model:show="showRStartPicker" position="bottom" round>
      <Picker
        :columns="timeOnlyColumns"
        :model-value="splitTimeOnly(rStartTime)"
        @confirm="onRStartConfirm"
        @cancel="showRStartPicker = false"
        title="开始时间"
      />
    </Popup>
    <!-- 结束时间（仅时间） -->
    <Popup v-model:show="showREndPicker" position="bottom" round>
      <Picker
        :columns="timeOnlyColumns"
        :model-value="splitTimeOnly(rEndTime || rStartTime)"
        @confirm="onREndConfirm"
        @cancel="showREndPicker = false"
        title="结束时间"
      />
    </Popup>
  </Popup>
</template>

<script setup lang="ts">
import { inject, ref, type Ref } from 'vue'
import { Popup, Field, Cell, Button, Picker } from 'vant'
import { useTaskEditor } from '@/composables/useTaskEditor'
import { COLOR_PRESETS } from '@/utils/taskTemplates'

const editor = inject<ReturnType<typeof useTaskEditor>>('taskEditor')!
const canEdit = inject<Ref<boolean>>('canEdit', ref(true))

const {
  showRecurringPopup: show,
  rName,
  rColor,
  rStartTime,
  rEndTime,
  rCycle,
  rWeekdays,
  rSpanType,
  rSpanValue,
  rStartDate,
  showRStartPicker,
  showREndPicker,
  showRDatePicker,
  dateCols,
  timeOnlyColumns,
  splitTimeOnly,
  weekdayOptions,
  spanOptions,
  onRCycleChange,
  onRStartConfirm,
  onREndConfirm,
  onRDateConfirm,
  clearREndTime,
  saveRecurring
} = editor

function setCycle(c: 'day' | 'week') {
  rCycle.value = c
  onRCycleChange()
}
function toggleWd(v: number) {
  const i = rWeekdays.value.indexOf(v)
  if (i < 0) rWeekdays.value = [...rWeekdays.value, v].sort((a, b) => a - b)
  else rWeekdays.value = rWeekdays.value.filter((x) => x !== v)
}
</script>

<style scoped>
.rec-popup {
  padding: 16px;
  max-height: 84vh;
  overflow-y: auto;
}
.rec-popup h3 {
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
.wd-row {
  display: flex;
  gap: 6px;
}
.wd-chip {
  min-width: 22px;
  height: 22px;
  padding: 0 4px;
  border-radius: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  background: #f2f3f5;
  color: #646566;
  cursor: pointer;
}
.wd-chip.on {
  background: #1989fa;
  color: #fff;
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
