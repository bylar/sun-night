# 组件说明（components/）

本目录存放 `sun-night` 全部可复用 UI 组件，均为 Vue 3 `<script setup lang="ts">` + Vant 4 的 SFC。组件分两类：

- **页面级容器**：`GanttChart`、`LoginPanel`、`RoomList` 直接承载业务页面；
- **弹层 / 抽象组件**：`InfiniteScroll`、`TemplatePicker`、`TaskEditDialog`、`ExportDialog`、`ExportPreview`、`ShareManager` 由父组件以 `v-model` / `inject` / `emit` 驱动。

共享状态通过 composables 注入（如 `provide('taskEditor', …)` / `provide('ganttExport', …)` / `provide('canEdit', …)`），子组件用 `inject` 取同一实例，避免层层透传 props。

---

## 1. GanttChart.vue —— 甘特图主容器

**职责**：整个房间作战图的唯一根组件，整合时间轴渲染、任务绘制、日历选天、间隔调节、导出入口、协同弹窗。

**关键依赖**
- `useGanttView(interval)`：视图窗口、滚动定位、左右隐藏指示。
- `useTaskEditor` / `useGanttExport` / `useAuth` / `useTaskStore`：任务编辑、导出、权限、任务列表。
- `provide('taskEditor' | 'ganttExport' | 'canEdit', …)` 供子组件共享。

**重要 Props / 内部状态**
| 名称 | 说明 |
| --- | --- |
| `interval` (ref) | 每格分钟数（1/5/10/30/60/720/1440），驱动时间轴密度与 `pxPerMin`。 |
| `currentOffset` | 当前天偏移（0=今天），由 `InfiniteScroll` 的 `v-model` 双向同步。 |
| `countByDate` | 按日期聚合任务数（跨天任务覆盖的每一天都 +1），供日历角标与时间轴圆点使用。 |

**子组件关系**
```vue
<InfiniteScroll v-model="currentOffset" :item-height="dayHeight" :buffer="6" :pad-top="48" :pad-bottom="72">
  <template #default="{ contentHeight }"> …时间轴 + 绘图区… </template>
</InfiniteScroll>
<TemplatePicker v-model:show="showTemplatePopup" @pick="editor.pickTemplate" />
<TaskEditDialog />
<ExportDialog />
<ExportPreview />
```

**交互入口**
- 顶部药丸：左右箭头切天，点标题打开日历 `Popup`。
- 右上角相机按钮 → `showExportPopup = true`。
- 底部环形加号 → `editor.openAdd()`（仅 `canEdit`），中间"每格 XX" → 间隔 `Picker`。
- 任务色块点击 → `editor.openEdit(task)`（仅 `canEdit`）。
- "回到现在"浮动按钮 → `scrollToNow()`。

**注意事项**
- 时间轴固定 `00:00–24:00`（每天一段，竖向无限滚）。
- `cal-cell` 未选中有 `1px` 浅灰边框、`box-sizing: border-box` 保证尺寸不变；选中态 `border-color: transparent`。
- 时间轴每格：`cell-moon`（夜间图标，最左，含浅夜/深夜两态）与 `cell-count`（与月亮同 13px 的白底圆点，右对齐）。

---

## 2. InfiniteScroll.vue —— 通用窗口化无限滚动

**职责**：等高 item 的虚拟滚动（virtual / windowing）抽象组件，只负责"无限滚动 + 窗口管理 + 滚动定位 + 自定义滚动条"，不关心每格渲染什么。

**Props**
| Prop | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `itemHeight` | `number` | 必填 | 每项固定像素高度（等高模型，支持负索引/越界）。 |
| `buffer` | `number` | `6` | 中心上下各保留的 item 数（可视窗口 = `2*buffer+1`）。 |
| `modelValue` | `number` | `0` | 当前中心索引（可越界为负数或超出长度），`v-model` 双向。 |
| `padTop` / `padBottom` | `number` | `0` | 顶部/底部内边距（避让浮层），参与滚动定位换算。 |

**Emits**
- `update:modelValue(v)`：中心索引变化。
- `scroll(ev)`：每次滚动透传。

**默认作用域 Slot**
```ts
{ lo: number, hi: number, itemHeight: number, contentHeight: number }
```
父组件用 `lo/hi` 仅渲染窗口内 item；可在 slot 内用绝对定位叠加跨 item 的覆盖层（如时间线、标记）。

**暴露方法（defineExpose）**
| 方法 | 说明 |
| --- | --- |
| `getScrollEl()` | 返回内部滚动容器 DOM。 |
| `scrollToContent(y, align='center'|'start')` | 把内容坐标系中的 `y` 滚动到对齐位置（`y` 即 slot 内相对 `.inf-content` 顶部偏移）。 |
| `lo` / `hi` / `contentHeight` | 暴露为 ref，供父组件读取。 |

**实现要点**
- 中心索引由"视口中心所在连续天坐标"用 `Math.floor` 推导，跨整天才 +1，避免频繁重排。
- 窗口平移后用 `nextTick` 反向补偿 `scrollTop`，视觉无跳动。
- 程序化定位/拖拽期间用 `programmaticUntil` 时间戳锁屏蔽自动平移。
- 隐藏原生滚动条，使用 transform 驱动、可拖拽的自定义滚动条。

**用法示例**（见 `GanttChart`）
```vue
<InfiniteScroll v-model="currentOffset" :item-height="dayHeight" :buffer="6" :pad-top="48" :pad-bottom="72">
  <template #default="{ contentHeight: ch }"> <div :style="{ height: ch + 'px' }">…</div> </template>
</InfiniteScroll>
```

---

## 3. TemplatePicker.vue —— 事务模板选择弹层

**职责**：新增事务时先弹出模板九宫格，点击模板自动填充默认参数（名称、颜色、图标、铺路模式等），再由 `TaskEditDialog` 二次编辑。

**Props**
- `show: boolean`（通过 `v-model:show` 控制显隐）。

**Emits**
- `update:show(v)`：配合 `v-model:show`。
- `pick(t: TaskTemplate)`：选中某个模板，附带头 `TaskTemplate` 对象。

**数据源**：`TEMPLATES`（来自 `@/composables/useTaskEditor`），每项含 `id / name / icon / color` 等。

**行为**：`pick(t)` 会先 `emit('pick', t)` 再 `emit('update:show', false)`，父组件（`GanttChart`）在 `@pick="editor.pickTemplate"` 中接管后续流程。

---

## 4. TaskEditDialog.vue —— 事务编辑 / 新增弹层

**职责**：单条事务的增改删。复用同一弹窗处理"新增"与"编辑"两种模式。

**驱动方式**：`inject('taskEditor')` 取 `useTaskEditor` 实例，直接解构其状态与方法（与父级 `GanttChart` 共享同一实例）。

**关键来自 editor 的状态 / 方法**
| 名称 | 说明 |
| --- | --- |
| `showEditPopup` (v-model `show`) | 弹窗显隐。 |
| `editingTask` | 当前编辑任务（null=新增）。 |
| `editForm` | 表单对象：name / startTime / endTime / color / priority / description / count / isHighlighted / pavingMode / countMode / countValue / template。 |
| `showStartPicker` / `showEndPicker` / `showPavingPicker` | 三个内嵌选择器。 |
| `timeColumns` / `paveDurationText` / `splitTime` / `onStartConfirm` / `onEndConfirm` / `onPavingConfirm` / `onCountValueInput` / `clearEndTime` | 时间/铺路选择相关。 |
| `saveTask()` / `deleteTask(t)` | 保存 / 删除。 |

**字段说明**
- **开始/结束时间**：`Picker`（日期+时+分），结束时间可跨天；清除结束时间→瞬时任务。
- **铺路模式**：`auto`（自动）/ `relay`（接力），配合"按格数 / 按时间"两种填写方式；非铺路模板则仅显示"铺路模式"一项。
- **卡片颜色**：`COLOR_PRESETS` 预设色板 + 原生 `<input type="color">` 自定义。
- **优先级**：高/中/低，影响样式强调。
- **计数**：非铺路模式下右侧数字（如铺路格数）。
- **高亮重点**：`Switch`，置顶强调显示。

**权限**：`inject('canEdit', ref(true))`，只读（`viewer`）状态下保存/删除按钮禁用（主入口已在 `GanttChart` 拦截点击）。

**依赖**：`useTaskEditor` 导出 `COLOR_PRESETS`、`pavingOptions`、`fmtDateTime` 供本组件使用。

---

## 5. ExportDialog.vue —— 导出图片设置弹层

**职责**：配置并触发甘特图导出为图片（PNG）。通过 `inject('ganttExport')` 共享 `useGanttExport` 实例。

**关键来自 exp 的状态 / 方法**
| 名称 | 说明 |
| --- | --- |
| `showExportPopup` (v-model `show`) | 弹窗显隐。 |
| `exScale` / `scaleOptions` | 清晰度倍率（如 1x/2x/3x）。 |
| `exColW` | 每列像素宽度（`Stepper`，90–360，步长 10）。 |
| `exUseWatermark` / `exWatermark` | 水印开关与文字。 |
| `exTitle` | 可选标题栏文字（留空不加）。 |
| `exStart` / `exEnd` / `dateTimeColumns` / `modelOfDateTime` / `onExStartConfirm` / `onExEndConfirm` | 导出时间范围（日期+时+分）。 |
| `exActiveNames` | 折叠面板展开项。 |
| `doExport()` | 生成图片并打开 `ExportPreview`。 |

**布局**
- 顶部"时间范围"两行（开始/结束）。
- 折叠区"详细配置"：清晰度、每列宽度、水印开关+文字、标题。
- 底部主按钮"导出图片" → `doExport()`。

**注意事项**：清晰度、列宽、水印等最终效果在 `ExportPreview` 中预览并保存。

---

## 6. ExportPreview.vue —— 导出预览弹层

**职责**：展示 `doExport()` 生成的图片预览，提供"重新编辑"与"保存图片"两个动作。同样 `inject('ganttExport')`。

**关键来自 exp 的状态 / 方法**
| 名称 | 说明 |
| --- | --- |
| `showPreview` (v-model `show`) | 预览弹窗显隐。 |
| `previewUrl` | 生成的图片 DataURL / Blob URL。 |
| `previewName` | 导出文件名提示。 |
| `reEdit()` | 关闭预览回到 `ExportDialog` 重新配置。 |
| `confirmSave()` | 触发下载/保存到本地。 |

**布局**：头部标题+文件名+关闭；中部滚动预览图；底部双按钮（重新编辑 / 保存图片）。

---

## 7. LoginPanel.vue —— 盟主登录 / 注册面板

**职责**：盟主账号登录与（可开关的）注册，是后台与房间列表的入口。

**状态**
- `mode`: `'login' | 'register'`，可在两者间切换。
- `username` / `password` / `submitting`：表单与提交态。
- `registrationEnabled`：是否开放注册，挂载时调用 `GET /api/config` 获取；关闭时只显示登录并提示"请联系管理员"。

**行为**
- `submit()`：注册模式调 `auth.register()`，否则 `auth.login()`；成功 `showToast('欢迎，盟主')`。
- 异常 toast 显示后端 `message`。

**依赖**：`useAuth`（封装登录态、`sessionToken`）。

---

## 8. RoomList.vue —— 同盟房间列表

**职责**：登录后展示当前盟主名下所有同盟（房间），支持创建、进入、删除。

**状态**
- `rooms: RoomSummary[]`：`GET /api/rooms` 拉取。
- `loading`、`showCreate`、`newName`、`newCode`、`creating`。

**API 调用**（均带 `Authorization: Bearer <sessionToken>`）
- 列表：`GET /api/rooms`
- 创建：`POST /api/rooms`（body: `{ code?, name }`，code 留空自动生成）
- 删除：`DELETE /api/rooms/:code`（先 `showConfirmDialog` 二次确认，提示不可恢复）

**交互**
- 卡片点击 → `navigateTo('/r/' + code)` 进入作战室。
- 删除图标 `.r-del` 用 `.stop` 阻止卡片跳转。
- 右下角 FAB → 弹出创建面板 → 创建成功后自动跳转。
- 顶部"退出" → `auth.logout()`。

**依赖**：`useAuth`、类型 `RoomSummary`（来自 `@/types/gantt`）。

---

## 9. ShareManager.vue —— 分享链接管理弹层

**职责**：盟主为房间生成、管理分享链接，精细控制每条链接的"可访问 / 可修改"权限。

**Props**
- `show: boolean`（配合 `v-model:show`）。

**Emits**
- `update:show(v)`。

**状态**
- `shares: ShareInfo[]`：`GET /api/rooms/:code/shares` 拉取。
- `showAdd` / `newName` / `newCanEdit` / `adding`。

**API 调用**（均带 `Authorization: Bearer <sessionToken>`，`:code` 取自 `auth.currentRoom.code`）
- 列表：`GET /api/rooms/:code/shares`
- 新增：`POST /api/rooms/:code/shares`（body: `{ name, canEdit }`）
- 更新权限：`PUT /api/rooms/:code/shares/:id`（body: `{ enabled? , canEdit? }`，本组件切换取反）
- 删除：`DELETE /api/rooms/:code/shares/:id`

**交互**
- 每条分享显示分配名、完整 URL（点击 `copy` 复制到剪贴板）、可访问/可修改两个 `Switch`、删除按钮。
- "新增分享链接"→ 填分配名 + 是否允许修改 → 生成。

**依赖**：`useAuth`、`ShareInfo`（来自 `@/types/gantt`）。

---

## 组件间数据流总览

```
GanttChart (根)
├─ provide taskEditor/ganttExport/canEdit
├─ InfiniteScroll  ──(v-model currentOffset)──► 驱动 view 窗口
│     └─ slot 内：时间轴(phase-bg/cell-moon/cell-count/time-label) + 绘图区(task-row)
├─ TemplatePicker ──(@pick)──► editor.pickTemplate
├─ TaskEditDialog ──(inject taskEditor)──► 增改删任务
├─ ExportDialog   ──(inject ganttExport)──► doExport
└─ ExportPreview  ──(inject ganttExport)──► confirmSave

独立页面组件：
LoginPanel   ── useAuth ──► 登录/注册
RoomList     ── useAuth ──► 房间 CRUD，navigateTo('/r/:code')
ShareManager ── useAuth ──► 分享链接 CRUD（v-model:show）
```

> 注：所有需要鉴权的请求均通过 `Authorization: Bearer <sessionToken>` 携带凭证；`viewer`（只读分享）身份由 `canEdit` 控制编辑类交互的可用性与视觉禁用态。
