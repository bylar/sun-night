<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'

/**
 * InfiniteScroll —— 通用「窗口化无限滚动」抽象组件。
 *
 * 设计思路参考成熟的虚拟滚动（virtual / windowing scroller）方案：
 * 不渲染全部内容，而是以 center 为中心、上下各保留 buffer 个条目，
 * 仅渲染 [lo, hi] 一段可视窗口；当用户滚出当前窗口时，平移 center
 * 并反向补偿 scrollTop，使内容在视觉上连续、无跳动（等高 item 下的精确补偿）。
 *
 * 该组件只负责「无限滚动 + 窗口管理 + 滚动定位」，不关心每一格渲染什么：
 * - 父组件通过默认作用域 slot 拿到当前窗口 { lo, hi } 自行逐格渲染；
 * - 也可用绝对定位在 slot 内叠加跨 item 的覆盖层（如时间线 / 标记）。
 *
 * 滚动条：隐藏原生滚动条，改用 transform 驱动的自定义滚动条（thumb 跟随滚动
 * 位移、可拖拽），视觉与交互更接近原生但完全可控。
 *
 * 用法：
 *   <InfiniteScroll v-model="center" :item-height="48" :buffer="6" :pad-top="48">
 *     <template #default="{ lo, hi, contentHeight }"> ... </template>
 *   </InfiniteScroll>
 */
interface Props {
  /** 每个 item 的固定像素高度（等高模型，支持负数索引 / 越界） */
  itemHeight: number
  /** 中心上下各保留的 item 数（缓冲窗口大小） */
  buffer?: number
  /** 当前中心索引，可越界到负数或超出数据长度（v-model） */
  modelValue?: number
  /** 滚动容器顶部内边距（避让浮层），用于滚动定位换算 */
  padTop?: number
  /** 滚动容器底部内边距 */
  padBottom?: number
}
const props = withDefaults(defineProps<Props>(), {
  buffer: 6,
  modelValue: 0,
  padTop: 0,
  padBottom: 0
})
const emit = defineEmits<{
  (e: 'update:modelValue', v: number): void
  (e: 'scroll', ev: Event): void
}>()

const scrollEl = ref<HTMLElement | null>(null)

// 中心索引（可越界），与父组件 v-model 双向同步
const center = ref(props.modelValue)
watch(
  () => props.modelValue,
  (v) => {
    if (v !== center.value) center.value = v
  }
)
watch(center, (v) => {
  if (v !== props.modelValue) emit('update:modelValue', v)
})

const lo = computed(() => center.value - props.buffer)
const hi = computed(() => center.value + props.buffer)
const contentHeight = computed(() => (hi.value - lo.value + 1) * props.itemHeight)

// 程序化定位锁：scrollToContent 期间屏蔽自动平移，避免把目标位置再次推走
let programmaticUntil = 0

// ====== 自定义滚动条（transform 驱动） ======
const thumbHeight = ref(40)
const thumbTop = ref(0)
const scrollbarVisible = ref(false)
let hideTimer = 0
function showBar() {
  scrollbarVisible.value = true
  clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => (scrollbarVisible.value = false), 1200)
}
function updateScrollbar(el: HTMLElement) {
  const max = el.scrollHeight - el.clientHeight
  if (max <= 1) {
    scrollbarVisible.value = false
    return
  }
  const track = el.clientHeight
  const ratio = track / el.scrollHeight
  thumbHeight.value = Math.max(24, Math.floor(track * ratio))
  const p = el.scrollTop / max
  thumbTop.value = p * (track - thumbHeight.value)
  showBar()
}
const thumbStyle = computed(() => ({
  height: thumbHeight.value + 'px',
  transform: `translateY(${thumbTop.value}px)`
}))

// 拖拽滚动条
let dragging = false
function onThumbDown(e: PointerEvent) {
  e.preventDefault()
  dragging = true
  // 拖拽期间屏蔽自动平移，避免与手动定位抢位
  programmaticUntil = Date.now() + 10_000_000
  window.addEventListener('pointermove', onThumbMove)
  window.addEventListener('pointerup', onThumbUp)
  window.addEventListener('pointercancel', onThumbUp)
}
function onThumbMove(e: PointerEvent) {
  const el = scrollEl.value
  if (!dragging || !el) return
  const rect = el.getBoundingClientRect()
  const track = el.clientHeight
  const max = el.scrollHeight - track
  let y = e.clientY - rect.top - thumbHeight.value / 2
  y = Math.max(0, Math.min(track - thumbHeight.value, y))
  el.scrollTop = (y / (track - thumbHeight.value)) * max
  updateScrollbar(el)
}
function onThumbUp() {
  dragging = false
  programmaticUntil = Date.now() + 350
  window.removeEventListener('pointermove', onThumbMove)
  window.removeEventListener('pointerup', onThumbUp)
  window.removeEventListener('pointercancel', onThumbUp)
}

function onScroll(ev: Event) {
  if (Date.now() < programmaticUntil) {
    // 程序化定位 / 拖拽触发的滚动：仅更新滚动条并透传，不自动平移
    if (scrollEl.value) updateScrollbar(scrollEl.value)
    emit('scroll', ev)
    return
  }
  const el = scrollEl.value
  if (el) {
    handleScroll(el)
    updateScrollbar(el)
  }
  emit('scroll', ev)
}

// 核心算法：由「视口中心所在的连续天坐标」直接推导 center，
// 用 Math.floor 取视口中心当前所在的那一天（整数 k = 第 k 天起点，
// 区间 [k, k+1) 即第 k 天）。这样 center 与滚动位置严格对应：
// 滚动不足一整天 → center 不变（天数不变）；滚满一整天 → center 才 +1，
// 此时内容里的「次日 00:00 分隔线」恰好越过视口中心，与 scrollbar 同步。
function handleScroll(el: HTMLElement) {
  const vh = el.clientHeight
  const itemH = props.itemHeight
  const l = lo.value
  // 视口中心对应的「连续天坐标」：
  // 某天 idx 在内容中的顶部 = (idx - l) * itemH，
  // 视口中心对应内容坐标 = scrollTop - padTop + vh/2，
  // 故视口中心所在天坐标 = l + (scrollTop - padTop + vh/2) / itemH
  const vp = l + (el.scrollTop - props.padTop + vh / 2) / itemH
  const target = Math.floor(vp)
  const old = center.value
  if (target === old) return // 未跨天，无需平移，内容随原生滚动连续移动
  const delta = target - old
  center.value = target
  // 窗口平移后反向补偿 scrollTop，使当前可见内容在视觉上不跳变
  // （内容已重锚定到新窗口，向下偏移 delta*itemH，故滚动量回退 delta*itemH）
  nextTick(() => {
    const el2 = scrollEl.value
    if (!el2) return
    el2.scrollTop = el2.scrollTop - delta * itemH
  })
}

/**
 * 父组件调用：把「内容坐标系」中的 y 滚动到指定对齐位置。
 * 内容坐标 y 即 slot 内相对 .inf-content 顶部的偏移。
 */
function scrollToContent(y: number, align: 'center' | 'start' = 'center') {
  const el = scrollEl.value
  if (!el) return
  const vh = el.clientHeight
  const top = align === 'center' ? y + props.padTop - vh / 2 : y + props.padTop
  // 锁定一小段时间，防止设置 scrollTop 触发的滚动被自动平移抢走
  programmaticUntil = Date.now() + 350
  el.scrollTop = Math.max(0, top)
}

function getScrollEl(): HTMLElement | null {
  return scrollEl.value
}

// 内容高度变化时同步滚动条（首屏 / 窗口平移后重渲染）
watch(contentHeight, () => {
  if (scrollEl.value) nextTick(() => updateScrollbar(scrollEl.value!))
})

defineExpose({ getScrollEl, scrollToContent, lo, hi, contentHeight })
</script>

<template>
  <div class="inf-wrap">
    <div
      class="inf-scroll"
      ref="scrollEl"
      :style="{ paddingTop: padTop + 'px', paddingBottom: padBottom + 'px' }"
      @scroll="onScroll"
    >
      <div class="inf-content" :style="{ height: contentHeight + 'px' }">
        <slot
          :lo="lo"
          :hi="hi"
          :item-height="itemHeight"
          :content-height="contentHeight"
        />
      </div>
    </div>

    <!-- 自定义滚动条（transform 驱动，可拖拽） -->
    <div class="inf-scrollbar" :class="{ visible: scrollbarVisible }">
      <div
        class="inf-thumb"
        :style="thumbStyle"
        @pointerdown="onThumbDown"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.inf-wrap {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.inf-scroll {
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  position: relative;
  /* 完全隐藏原生滚动条 */
  scrollbar-width: none;
  scrollbar-color: transparent transparent;
}

.inf-scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.inf-content {
  position: relative;
}

/* 自定义滚动条：固定在可视区右侧，不随内容滚动 */
.inf-scrollbar {
  position: absolute;
  top: 0;
  right: 2px;
  width: 4px;
  height: 100%;
  z-index: 20;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.04);
}
.inf-wrap:hover .inf-scrollbar,
.inf-scrollbar.visible {
  opacity: 1;
}

.inf-thumb {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.28);
  will-change: transform;
  pointer-events: auto;
  cursor: grab;
  transition: background 0.15s ease;
}
.inf-thumb:hover {
  background: rgba(0, 0, 0, 0.4);
}
.inf-thumb:active {
  cursor: grabbing;
  background: rgba(0, 0, 0, 0.5);
}
</style>
