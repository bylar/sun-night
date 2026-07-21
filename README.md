# sun-night · 谋定三国天下 · 协同作战安排

一款专为手游《谋定三国天下》设计的 **H5 竖列甘特图** 协同作战安排工具。用于直观管理同盟每日的游戏任务、活动时间、铺路/攻城/宣战等事务，并支持多人实时协作（盟主编辑、盟友通过分享链接只读或协同编辑）。

> 纯本地/自托管部署，数据落盘于 SQLite，无第三方云服务依赖。

---

## 一、项目介绍

- **核心场景**：把一个「同盟作战室（房间）」里每天 00:00–24:00 的事务排进一条竖向时间轴，横向展示多条并行事务。
- **目标用户**：盟主（创建并管理房间）、盟友（通过分享链接访问，可只读或协同编辑）。
- **多人协同**：任一端修改任务后，房间内所有在线成员通过 SSE 实时收到全量数据更新，多端保持一致。
- **移动优先**：面向手机端 H5，使用 Vant 4 组件库，支持安全区域、触摸优化与响应式布局。

---

## 二、技术栈

| 类别 | 技术 | 说明 |
|------|------|------|
| 框架 | **Nuxt 3**（Vue 3 Composition API + `<script setup>`） | 启用 SSR，首屏服务端渲染，协同数据客户端经 API/SSE 拉取 |
| 语言 | **TypeScript** | 全量类型约束 |
| UI 框架 | **Vant 4** | 移动端组件库（弹窗、标签、表单、图标等） |
| 图标 | **@vant/icons** | Vant 图标集 |
| 时间处理 | **dayjs** | 时间解析与格式化 |
| 服务端 | **Nitro**（Nuxt 内置，preset `node-server`） | 提供 REST API 与 SSE 长连接 |
| 数据库 | **SQLite + Drizzle ORM**（@libsql/client） | 文件库落于 `.data/app.db`，首次运行幂等建表 |
| 配置 | **smol-toml** | 读取 `config.toml` 后台配置 |
| 构建 | **Vite**（Nuxt 内置） | — |

> 注：旧版文档 `docs/IMPLEMENTATION.md` 描述的是早期 Vite 脚手架（Vue3+Vant 单页），与当前 Nuxt 3 服务端架构已不相符，本文档为权威说明。

---

## 三、已实现功能

### 甘特图主体
- **竖列时间轴**：固定 00:00–24:00，每「格」像素高度恒定（`CELL_PX=48`），格内时间跨度可切换（时段粒度 chip）。
- **多天无限滚动**：基于 `InfiniteScroll` 组件，以「当前天」为中心上下虚拟滚动，连续跨天查看。
- **任务渲染**：任务按 `startTime/endTime` 在时间轴上定位为横向色块；跨天任务自动拆段延伸到覆盖的每一天。
- **夜间相位**：0–1 点 / 8–9 点为浅夜，1–8 点为深夜；时间轴左侧以渐变背景 + 🌙 月亮图标标识，深夜更暗。
- **任务数统计**：时间轴每格显示该时段任务数量（跨天任务在其覆盖的每一天分别计数）。
- **日界日期**：时间轴每个完整天的顶部日界以「月-日 周X」日期标注（代替 `00:00`），便于跨天对照当天日期（屏幕与导出图一致）。
- **优先级 / 高亮 / 颜色 / 描述 / 图标**：任务支持高/中/低优先级、重点高亮、自定义颜色与图标。

### 任务管理
- **新增 / 编辑 / 删除**：通过 `TaskEditDialog` 表单操作，受分享链接编辑权限约束。
- **事务模板**：内置 `TemplatePicker` —— 铺路、自动铺路、接力铺路、攻城大营、同盟大营、宣战、自定义，点击后自动填充参数（时长/粒度/最短时长等）。
- **铺路辅助**：`countMode`（按格数 / 按时长）互转，自动计算耗时（白天/浅夜：自动铺路 3 分 10 秒/格、接力 3 分/格；深夜 01:00–08:00 翻 3 倍：自动 9 分 10 秒/格、接力 9 分/格）。

### 日历与导航
- **日历选天**：顶部日期药丸点击弹出月历，选中某天跳转；日期上角标显示当天任务数（跨天计两边）。
- **上/下一天切换**、**回到现在**（现在线定位）。

### 协同与分享
- **分享链接**：盟主生成带 `token` 的 URL（`/r/<code>?token=...`），可单独设定分配名、是否可编辑、是否启用；可随时停启用或删除。
- **匿名访客**：凭链接访问，按分享设置获得只读或可编辑权限，无需注册。
- **实时同步（SSE）**：`/api/rooms/:code/events` 推送，初始下发全量快照，之后任意变更整体替换本地数据，保证多端一致；带 25s 心跳保活。
- **乐观更新**：本地先更新界面，再异步提交，失败静默回退（由 SSE 兜底）。

### 账号与后台
- **盟主账号**：账号密码注册 / 登录（注册开关受 `config.toml` 控制），会话 `token` 持久化于 `localStorage`，刷新自动恢复。
- **后台管理**（`/admin` 或 `config.toml` 自定义路径）：
  - 账号管理：新增/禁用/删除盟主账号（删除级联清理其房间与数据）。
  - 房间管理：查看全部房间（含盟主、分享数、任务数），打开/删除任意房间。
  - 访问日志：按房间码 / 身份 / 动作筛选查询（view / create_task / update_task / delete_task / reset，含 IP、UA、时间）。
- **后台鉴权**：支持三种方式（见配置章节），登录态与盟主账号相互独立。

### 导出与统计
- **导出图片**：`ExportDialog` + `ExportPreview` + `utils/exportImage.ts` 将甘特图导出为图片分享盟友。
  - **超长范围（多列布局）**：所选范围较大（如 28 天）时，单张竖列画布会超过浏览器单边长上限（约 16384px）导致空白图；导出改为「多列」布局——把天数按高度均衡分到若干列竖向堆叠，列间以浅色分割线隔开，清晰度由用户选择的 scale 决定（不再自动降低倍数或加粗时间粒度）。
  - **日界日期**：时间轴左侧日界（当天 `0:00`）显示「月-日 周X」日期代替 `00:00`，与屏幕轴一致。
- **房间导入导出（base64）**：盟主在房间列表（`RoomList.vue`）可对单个房间「导出」——把房间内全部事务序列化为 base64（**仅含事务信息，不含房间标题/房间码等元信息**），复制后在同/异账号「导入」即可创建一个新房间并写入全部事务。导入时任务全局 id 重新生成（`seriesId` 保留），房间名/房间码可在导入时另行指定（留空自动生成）。适合跨账号迁移作战安排。
- **底部统计栏**：显示总任务数、重点任务数等；横/纵向滚动提示。

---

## 四、目录结构

```
sun-night/
├── app.vue                      # 根组件
├── nuxt.config.ts               # Nuxt 配置（SSR、admin 路由动态注册、node-server preset）
├── config.example.toml          # 后台配置示例（复制为 config.toml）
├── drizzle.config.ts            # Drizzle Kit 配置（可生成迁移）
├── package.json
├── assets/
│   └── main.css                 # 全局样式
├── components/
│   ├── GanttChart.vue           # 核心：竖列甘特图、日历选天、导出入口
│   ├── TaskEditDialog.vue       # 任务新增/编辑弹窗
│   ├── TemplatePicker.vue       # 事务模板选择
│   ├── ShareManager.vue         # 分享链接管理
│   ├── LoginPanel.vue           # 盟主登录/注册面板
│   ├── RoomList.vue             # 房间列表
│   ├── InfiniteScroll.vue       # 无限滚动虚拟列表
│   ├── ExportDialog.vue         # 导出图片弹窗
│   └── ExportPreview.vue        # 导出预览
├── composables/
│   ├── useAuth.ts               # 盟主登录态 + 房间访问上下文
│   ├── useAdmin.ts              # 后台登录态
│   ├── useApi.ts                # 带凭据的 $fetch 封装
│   ├── useTaskStore.ts          # 房间任务数据源（SSE 驱动）
│   ├── useTaskEditor.ts         # 任务编辑逻辑
│   ├── useGanttView.ts          # 甘特图可视模型（布局/滚动/相位）
│   └── useGanttExport.ts        # 导出逻辑
├── pages/
│   ├── index.vue                # 门户：登录或房间列表
│   ├── admin.vue                # 后台管理页
│   └── r/[code].vue             # 房间页（甘特图 + 分享管理 + SSE）
├── plugins/
├── server/
│   ├── api/                     # REST + SSE 路由（auth/rooms/tasks/shares/admin/config）
│   ├── db/                      # schema.ts（Drizzle 模型）+ index.ts（连接与幂等建表）
│   └── utils/                   # auth / config / db / realtime / code
├── types/
│   └── gantt.ts                 # 全局类型（TaskItem、DayData、ShareInfo 等）
├── utils/
│   ├── ganttLayout.ts           # 布局/几何/时间计算（assignTracks、dateOf、minutesOf）
│   └── exportImage.ts           # 图片导出
├── docs/
│   └── IMPLEMENTATION.md        # ⚠️ 旧版（Vite 脚手架）说明，已过时
└── public/                      # 静态资源（favicon 等）
```

---

## 五、数据模型

数据库（SQLite，文件 `.data/app.db`）表结构见 `server/db/schema.ts`，由 `server/db/index.ts` 的 `CREATE TABLE IF NOT EXISTS` 幂等落地：

| 表 | 作用 |
|----|------|
| `users` | 盟主账号（账号密码，scrypt 哈希），可禁用 |
| `sessions` | 登录会话（`user` / `admin` 两种 kind），用于 Bearer 鉴权 |
| `access_logs` | 房间访问与操作日志 |
| `rooms` | 同盟作战室（大写房间码唯一，归属盟主，带 version 版本号） |
| `shares` | 分享链接（token、分配名、canEdit、enabled） |
| `days` | 单天数据容器（按日期锚定） |
| `tasks` | 任务项（归属某天，含起止时间、优先级、铺路参数等） |

**鉴权模型（三种身份）**：
- `owner`：盟主本人（Bearer 会话且房间归属自己）—— 完全权限。
- `guest`：分享链接匿名访客（`?token=`）—— 按分享设置只读或可编辑。
- `admin`：后台管理员会话 —— 视作 owner，可管理任意房间。

访问上下文由 `server/utils/auth.ts` 的 `resolveAccess()` 统一解析，会话令牌取自 `Authorization: Bearer` 头或 SSE 的 `?session=`（EventSource 无法自定义头）。

---

## 六、安装与运行

### 环境要求
- **Node.js**：18.20+ 或 20+（Nitro node-server 预设）。
- **包管理器**：npm（亦可用 pnpm/yarn，但脚本以 npm 为准）。

### 步骤
```bash
# 1. 安装依赖
npm install

# 2.（可选）准备后台配置
cp config.example.toml config.toml
# 按需编辑 config.toml（见下一节）

# 3. 启动开发服务器
npm run dev          # 默认 http://localhost:3000

# 4. 类型检查（可选）
npm run typecheck
```

### 构建与预览
```bash
npm run build        # 产出 .output/
npm run preview      # 预览构建产物
# 或直接以 Node 运行生产服务：
node .output/server/index.mjs
```

### 首次配置（config.toml）
```toml
# 后台登录方式三选一：password | token | url
[admin]
enabled = true
auth_method = "token"
path = "admin"                  # 后台访问路径，对应 /admin
token = "change-me-token"       # auth_method="token" 时使用

[registration]
enabled = true                 # 盟主自助注册开关；false 时只能由后台新增账号
```
配置读取顺序：环境变量 `SUN_NIGHT_CONFIG` 指定路径 → 项目根目录 `config.toml` → 内置默认值。`config.toml` 已被 `.gitignore` 忽略，**切勿提交含凭据的配置文件**。

---

## 七、部署说明

### 单机 Node 部署（推荐）
```bash
npm install
npm run build
node .output/server/index.mjs    # 监听端口由 Nitro 默认（通常 3000，可用 PORT 环境变量覆盖）
```
用 `SUN_NIGHT_CONFIG=/path/to/config.toml node .output/server/index.mjs` 指定配置。

### 反向代理（Nginx 等）
- 需支持 **SSE 长连接**：关闭对 `/api/rooms/*/events` 的缓冲（建议 `proxy_buffering off;`，并转发 `Connection: keep-alive`）。
- 透传 `Authorization` 头与 query 参数（`?token=` / `?session=`）。

### 注意事项
- **数据持久化**：SQLite 文件位于 `.data/app.db`，已被 `.gitignore` 忽略。部署时请对该目录做**定期备份**，删除即数据丢失。
- **仅单实例**：实时协同基于 Node 进程内 `Map` 的 SSE 广播（非 Redis/消息队列），**仅支持单进程单实例**；多实例/多机部署会导致协同不同步。
- **@libsql/client 原生依赖**：`nuxt.config.ts` 已将其设为 `external`，构建勿打包进 bundle，否则原生模块会损坏。
- **SSE 要求**：必须运行在支持 `response` 流的 Node 环境（node-server 预设），静态托管/CDN 无法提供 SSE。

---

## 八、API 参考

除 `/api/config` 与 `/api/admin/auth-method` 外，其余多需鉴权（Bearer 头或分享 `?token=`）。

### 盟主账号（auth）
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/auth/register` | 公开（受 registration.enabled） | 注册 `{username,password}` → `{token,user}` |
| POST | `/api/auth/login` | 公开 | 登录 `{username,password}` → `{token,user}` |
| POST | `/api/auth/logout` | Bearer | 注销会话 |
| GET  | `/api/auth/me` | Bearer | 返回当前盟主信息 |

### 房间（rooms）
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET  | `/api/rooms` | Bearer(owner) | 当前盟主房间列表 |
| POST | `/api/rooms` | Bearer(owner/admin) | 创建房间 `{name,code?,ownerId?}` → `{room,share}`（自动建主分享） |
| GET  | `/api/rooms/:code/access` | 链接/Bearer | 解析访问权限 → `{room,access}` |
| DELETE | `/api/rooms/:code` | owner | 删除房间（级联数据） |
| GET  | `/api/rooms/:code/export` | owner | 导出房间全部事务（仅事务信息，不含房间标题/房间码等元信息）为 base64 `{data}` |
| POST | `/api/rooms/import` | Bearer(owner) | 粘贴 base64，创建新房间并写入全部事务（`{name,code?,data}` → `{room,share}`，任务全局 id 重新生成） |
| GET  | `/api/rooms/:code/tasks` | 链接/Bearer | 获取 `days[]` |
| POST | `/api/rooms/:code/tasks` | 可编辑 | 新增任务 `{task}` |
| PUT  | `/api/rooms/:code/tasks/:id` | 可编辑 | 更新任务 `{patch}` |
| DELETE | `/api/rooms/:code/tasks/:id` | 可编辑 | 删除任务 |
| DELETE | `/api/rooms/:code/tasks` | owner | 重置房间全部日程 |
| GET  | `/api/rooms/:code/events` | 链接/Bearer | **SSE** 实时推送（init + tasks） |
| GET  | `/api/rooms/:code/shares` | owner | 分享链接列表 |
| POST | `/api/rooms/:code/shares` | owner | 新建分享 `{name,canEdit}` |
| PUT  | `/api/rooms/:code/shares/:id` | owner | 更新分享 `{name,canEdit,enabled}` |
| DELETE | `/api/rooms/:code/shares/:id` | owner | 删除分享 |

### 后台管理（admin）
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET  | `/api/admin/auth-method` | 公开 | 返回后台登录方式 `{authMethod,path}` |
| POST | `/api/admin/login` | 公开 | 登录 `{username,password}` 或 `{token}` → `{token,admin}` |
| GET  | `/api/admin/url-login?key=` | 公开 | 自定义 URL 免密登录 |
| POST | `/api/admin/logout` | Bearer | 注销后台会话 |
| GET  | `/api/admin/me` | Bearer | 当前管理员信息 |
| GET  | `/api/admin/users` | Bearer | 盟主账号列表 |
| POST | `/api/admin/users` | Bearer | 新增账号 `{username,password}` |
| PUT  | `/api/admin/users/:id` | Bearer | 禁用/启用 `{disabled}` |
| DELETE | `/api/admin/users/:id` | Bearer | 删除账号（级联） |
| GET  | `/api/admin/rooms` | Bearer | 全部房间列表 |
| DELETE | `/api/admin/rooms/:code` | Bearer | 删除房间（级联） |
| GET  | `/api/admin/access-logs` | Bearer | 访问日志（支持 `roomCode`/`identityType`/`action` 筛选） |

### 公开配置
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET  | `/api/config` | 公开 | 返回 `{registrationEnabled}` |

---

## 九、使用流程

1. **部署并启动**后访问首页 `/`。
2. **盟主**：若开放注册，在登录面板注册账号；否则由后台管理员创建账号。登录后进入房间列表，可「新建作战室」（自动生成主分享链接）；也可通过「导入」粘贴 base64 把其他账号导出的作战安排迁移为新房间，或用每间房间卡片的「导出」把全部事务复制为 base64。
3. **分享**：在房间内点右上角分享图标，复制带 token 的链接发给盟友；可分别设定每位盟友的名字、是否可编辑、是否启用。
4. **盟友**：打开分享链接即可进入房间。只读链接只能查看；可编辑链接可增删改任务，改动实时同步给在场所有人。
5. **编排**：通过底部「+」新增事务，使用模板快速填充铺路/攻城/宣战等参数；点顶部日期药丸用日历跳天；用时段粒度 chip 调整时间轴密度。
6. **后台**：访问 `/admin`（或自定义路径），用 config.toml 配置的方式登录，管理账号、房间与审计日志。

---

## 十、注意事项（汇总）

- **数据安全**：`.data/app.db` 与 `config.toml` 均被 gitignore，请自行备份数据库、妥善保管配置中的 token/密码。
- **单实例限制**：实时协同依赖进程内 SSE 广播，不要横向扩容到多实例；如需多实例请引入外部消息总线（如 Redis pub/sub）并改造 `server/utils/realtime.ts`。
- **跨天任务**：数据库任务仅归属「开始天」，跨天在日历计数与视图渲染时由前端按起止时间段展开到覆盖的每一天（双方都计数），前后端模型一致、刷新无偏差。
- **密码安全**：盟主与后台账号密码使用 scrypt 加盐哈希（恒定时间比较，防时序攻击）；后台 `password` 方式支持明文或 `scrypt:` 前缀哈希。
- **权限校验**：所有写操作服务端二次校验 `canEdit` / `isOwner` / 管理员身份，前端只读态仅为体验优化，不可绕过。
- **构建产物**：`@libsql/client` 已设为 external，请勿改动 `nuxt.config.ts` 的 `nitro.externals`，否则原生模块可能损坏。
- **许可证**：本项目为私有/自托管工具，未包含开源许可证文件；如需分发请先确认授权。

---

*Generated for sun-night (谋定三国天下 · 协同作战安排)*
