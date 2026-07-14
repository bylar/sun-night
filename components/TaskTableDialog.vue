<script setup lang="ts">
import { computed, inject } from 'vue'
import { Popup, Icon } from 'vant'
import { useTaskStore } from '@/composables/useTaskStore'
import { absMinutes, parseDateTime } from '@/utils/ganttLayout'
import type { TaskItem } from '@/types/gantt'
import type { useTaskEditor } from '@/composables/useTaskEditor'

const DEFAULT_TASK_COLOR = '#1989fa'

const show = defineModel<boolean>('show', { default: false })

const taskStore = useTaskStore()
const editor = inject<ReturnType<typeof useTaskEditor> | null>('taskEditor', null)
const canEdit = inject('canEdit', computed(() => false))

// 去重后的全部事务，仅按开始时间升序排序
const rows = computed(() => {
  const seen = new Set<string>()
  const list: TaskItem[] = []
  for (const d of taskStore.days.value) {
    for (const t of d.tasks) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      list.push(t)
    }
  }
  list.sort((a, b) => absMinutes(a.startTime) - absMinutes(b.startTime))
  return list
})

function fmtDate(s: string): string {
  const { date } = parseDateTime(s)
  if (!date) return ''
  const [, mo, d] = date.split('-')
  return `${Number(mo)}/${Number(d)}`
}
function fmtTime(s: string): string {
  const { minutes } = parseDateTime(s)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function onRow(t: TaskItem) {
  if (!canEdit.value || !editor) return
  show.value = false
  editor.openEdit(t)
}
</script>

<template>
  <Popup
    v-model:show="show"
    position="bottom"
    round
    :style="{ height: '72vh' }"
    class="tt-popup"
  >
    <div class="tt">
      <!-- 头部 -->
      <div class="tt-head">
        <div class="tt-title">
          <Icon name="orders-o" size="18" />
          <span>全部事务</span>
          <span class="tt-count">{{ rows.length }}</span>
        </div>
        <Icon name="cross" size="18" color="#969799" @click="show = false" />
      </div>

      <!-- 表头 -->
      <div class="tt-thead">
        <span class="c-name">事务标题</span>
        <span class="c-time">开始</span>
        <span class="c-time">结束</span>
      </div>

      <!-- 表体：上下滑动 -->
      <div class="tt-body">
        <div
          v-for="t in rows"
          :key="t.id"
          class="tt-row"
          :class="{ clickable: canEdit }"
          @click="onRow(t)"
        >
          <div class="c-name">
            <span class="dot" :style="{ background: t.color || DEFAULT_TASK_COLOR }"></span>
            <div class="name-wrap">
              <span class="name" :class="{ hl: t.isHighlighted }">{{ t.name || '事务' }}</span>
              <div class="tags">
                <span v-if="t.isHighlighted" class="tag tag-hl">高亮</span>
                <span v-if="t.pavingMode" class="tag tag-pave">{{
                  t.pavingMode === 'auto' ? '自动铺路' : '接力铺路'
                }}</span>
              </div>
            </div>
          </div>
          <div class="c-time">
            <span class="t-date">{{ fmtDate(t.startTime) }}</span>
            <span class="t-clock">{{ fmtTime(t.startTime) }}</span>
          </div>
          <div class="c-time">
            <template v-if="t.endTime">
              <span class="t-date">{{ fmtDate(t.endTime) }}</span>
              <span class="t-clock">{{ fmtTime(t.endTime) }}</span>
            </template>
            <span v-else class="t-none">—</span>
          </div>
        </div>

        <div v-if="rows.length === 0" class="tt-empty">
          <Icon name="notes-o" size="40" color="#c8c9cc" />
          <span>暂无事务</span>
        </div>
      </div>
    </div>
  </Popup>
</template>

<style scoped>
.tt {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f7f8fa;
}

/* 头部 */
.tt-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  background: #fff;
  border-bottom: 1px solid #f0f1f3;
}
.tt-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 16px;
  font-weight: 700;
  color: #323233;
}
.tt-title .van-icon {
  color: #667eea;
}
.tt-count {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
}

/* 表头 */
.tt-thead {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #ebedf0;
  font-size: 11px;
  font-weight: 700;
  color: #969799;
}

/* 表体 */
.tt-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 6px 10px 20px;
}
.tt-row {
  display: flex;
  align-items: center;
  padding: 10px 6px;
  margin-bottom: 6px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  transition: transform 0.1s ease;
}
.tt-row.clickable {
  cursor: pointer;
}
.tt-row.clickable:active {
  transform: scale(0.99);
  background: #f7f8fa;
}

/* 列宽 */
.c-name {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.c-time {
  flex: 0 0 66px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  text-align: center;
}
.tt-thead .c-name {
  padding-left: 6px;
}

/* 名称列内容 */
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.name-wrap {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.name {
  font-size: 13px;
  font-weight: 600;
  color: #323233;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.name.hl {
  color: #ee0a24;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tag {
  font-size: 10px;
  font-weight: 700;
  line-height: 15px;
  padding: 0 5px;
  border-radius: 7px;
}
.tag-hl {
  color: #ee0a24;
  background: #ffeceb;
}
.tag-pave {
  color: #07c160;
  background: #e8f8ef;
}

/* 时间列内容 */
.t-date {
  font-size: 10px;
  color: #969799;
  line-height: 1;
}
.t-clock {
  font-size: 13px;
  font-weight: 700;
  color: #323233;
  font-family: monospace;
  line-height: 1.2;
}
.t-none {
  font-size: 13px;
  color: #c8c9cc;
}

/* 空状态 */
.tt-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 60px 0;
  color: #c8c9cc;
  font-size: 13px;
}
</style>
