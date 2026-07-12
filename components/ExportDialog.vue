<template>
  <Popup v-model:show="show" position="bottom" round :style="{ maxHeight: '88%' }">
    <div class="export-panel">
      <h3>导出图片</h3>

      <div class="ex-section">
        <div class="ex-label">时间范围（日期 + 时间）</div>
        <Cell title="开始时间" :value="formatDateTime(exStart)" is-link @click="showExStartPicker = true" />
        <Cell title="结束时间" :value="formatDateTime(exEnd)" is-link @click="showExEndPicker = true" />
      </div>

      <Collapse v-model="exActiveNames" class="ex-collapse">
        <CollapseItem title="详细配置（清晰度 / 画幅 / 水印）" name="detail">
          <div class="ex-section">
            <div class="ex-label">画质与画幅</div>
            <Cell
              title="清晰度"
              :value="scaleOptions.find((s) => s.value === exScale)?.text"
              is-link
              @click="showExScalePicker = true"
            />
            <Cell title="每列宽度" center>
              <template #value>
                <Stepper v-model="exColW" :min="90" :max="360" :step="10" />
              </template>
            </Cell>
          </div>

          <div class="ex-section">
            <div class="ex-label">水印与标题</div>
            <Cell title="启用水印" center>
              <template #value>
                <Switch v-model="exUseWatermark" />
              </template>
            </Cell>
            <Field
              v-if="exUseWatermark"
              v-model="exWatermark"
              label="水印文字"
              placeholder="如：同盟 A 区作战图"
              :border="false"
            />
            <Field v-model="exTitle" label="标题(可选)" placeholder="留空不加标题栏" :border="false" />
          </div>
        </CollapseItem>
      </Collapse>

      <Button type="primary" block round @click="doExport">导出图片</Button>
    </div>

    <!-- 清晰度选择器 -->
    <Popup v-model:show="showExScalePicker" position="bottom" round>
      <Picker
        :columns="[scaleOptions]"
        :model-value="[exScale]"
        @confirm="onExScaleConfirm"
        @cancel="showExScalePicker = false"
        title="清晰度"
      />
    </Popup>

    <!-- 开始 / 结束 datetime（天 + 时 + 分） -->
    <Popup v-model:show="showExStartPicker" position="bottom" round>
      <Picker
        :columns="dateTimeColumns"
        :model-value="modelOfDateTime(exStart)"
        @confirm="onExStartConfirm"
        @cancel="showExStartPicker = false"
        title="开始时间"
      />
    </Popup>
    <Popup v-model:show="showExEndPicker" position="bottom" round>
      <Picker
        :columns="dateTimeColumns"
        :model-value="modelOfDateTime(exEnd)"
        @confirm="onExEndConfirm"
        @cancel="showExEndPicker = false"
        title="结束时间"
      />
    </Popup>
  </Popup>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { Popup, Cell, Field, Button, Switch, Picker, Stepper, Collapse, CollapseItem } from 'vant'
import { useGanttExport } from '@/composables/useGanttExport'

const exp = inject<ReturnType<typeof useGanttExport>>('ganttExport')!
const {
  showExportPopup: show,
  exScale,
  exColW,
  exUseWatermark,
  exWatermark,
  exTitle,
  exActiveNames,
  exStart,
  exEnd,
  showExStartPicker,
  showExEndPicker,
  showExScalePicker,
  scaleOptions,
  dateTimeColumns,
  modelOfDateTime,
  formatDateTime,
  onExStartConfirm,
  onExEndConfirm,
  onExScaleConfirm,
  doExport
} = exp
</script>

<style scoped>
.export-panel {
  padding: 16px 16px 22px;
}
.export-panel h3 {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 700;
  color: #323233;
}
.ex-collapse {
  margin-bottom: 16px;
}
.ex-section {
  margin-bottom: 14px;
  border-radius: 12px;
  overflow: hidden;
  background: #f7f8fa;
}
.ex-label {
  padding: 8px 12px 2px;
  font-size: 12px;
  font-weight: 600;
  color: #969799;
}
</style>
