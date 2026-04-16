---
name: weaviate-vue-client
description: >-
  Implements and maintains the Weaviate vector DB web client using Vue 3,
  Element Plus, TypeScript, Pinia, and REST/GraphQL to Weaviate. Use when
  working on weaviate-web-client: login/connect UI, cluster meta/discovery,
  collection sidebar, object/folder browsing, embedding-backed vector search,
  CORS, or UI theme/styling (ThemePicker, themes.css, wc CSS variables).
---

# Weaviate Vue 客户端 — 技术框架 Skill

面向本仓库（`weaviate-web-client`）的实现约束与惯例，供 Agent 在开发、重构与排错时遵循。

## 1. 技术栈（固定）

| 层级 | 选型 |
|------|------|
| 框架 | Vue 3（Composition API） |
| 语言 | TypeScript |
| UI | Element Plus（勿使用已停止维护的 Element UI 2.x） |
| 状态 | Pinia |
| 路由 | Vue Router 4 |
| 构建 | Vite |
| Weaviate | HTTP：`axios` 调用 REST/GraphQL（见 `src/api/weaviate.ts`）；未在依赖中引入 `weaviate-client` 包 |
| HTTP | axios 或 ofetch（项目内统一一种） |

## 2. 与产品规格的关系

- 功能与验收以仓库内 `docs/WEAVIATE_CLIENT_SPEC.md` 为准。
- 若实现与 Spec 冲突，先改 Spec 或记 ADR，再改代码。

## 3. 连接与鉴权

- 登录表单：**连接地址**（含协议与端口，见 `parseConnectionInput`）、**API Key**（可选）、**记住**（可选：将连接地址与 API Key 写入 `localStorage`，见 `connection` store）。
- **开发环境（`import.meta.env.DEV`）**：`baseURL` 为同域 `/weaviate`，Vite 中间件按 `X-Weaviate-Target`（即 `connectionUrl`）转发；**生产**为直连 `connectionUrl`。
- 连接校验：调用 `ready`/`meta` 后再进入 `/app` 路由。

## 4. 布局约定

- **Shell**：左侧固定宽度 **集合列表**（可折叠）；右侧 `<RouterView>`。
- 左侧：支持按名称过滤、刷新；当前选中集合高亮。
- 集合相关子页：**概览**（schema + 计数）、**文件夹**（元数据路径树）、**对象**（分页表格 + 详情抽屉）。

## 5. Weaviate API 使用原则

- **Schema / 集合列表**：通过 `src/api/weaviate.ts` 等封装调用 REST/GraphQL，避免散落易碎 URL。
- **对象计数**：优先 GraphQL `Aggregate`；失败时降级并提示用户。
- **对象列表**：分页 `limit` + `after` cursor（或 offset 策略），禁止一次拉全量。
- **向量检索**：
  - 主路径：应用侧 **嵌入 API** 得到向量 → `nearVector` 查询。
  - 可选：若 `meta` 显示支持 `nearText` 且用户启用，可走 `nearText`（需确认模块与 class 配置）。

## 6. 嵌入（LLM）配置

- 独立 Pinia store：`useEmbeddingStore`（`src/stores/embedding.ts`：baseURL、model、apiKey、dimensions）。
- 提供「测试嵌入」：短文本请求一次，校验状态码与返回维度。
- **不在控制台或网络日志打印完整 API Key**。

## 7. 跨域

- 开发环境默认走 Vite `/weaviate` 代理；生产需直连或反向代理同域。
- 嵌入 API 可配置 **baseURL** 指向同域网关。

## 8. 代码结构建议（可随实现微调）

```
src/
  api/           # weaviate REST/GraphQL、embedding 客户端
  stores/        # pinia：connection、embedding、theme 等
  views/         # Login, AppLayout, Cluster, Collection*, Search
  components/    # ThemePicker 等；集合子页导航在 CollectionLayout（el-tabs）
  assets/styles/ # global.css、themes.css
  router/
```

## 9. UI/UX

- 使用 Element Plus 的 `ElMessage`/`ElNotification` 反馈错误；错误文案区分网络、401、CORS。
- 大 JSON：折叠面板或 `ElScrollbar`，避免一次性渲染超大 DOM。

## 10. 主题与样式（深色 UI）

登录后 **App 壳**（`AppLayout.vue`）为深色主调，与左侧导航一致；通过 `html[data-theme]` 切换多套色调（非浅色/深色二态，而是 **5 种预设**）。

### 10.1 数据流与入口

| 项 | 说明 |
|----|------|
| **Pinia** | `src/stores/theme.ts`：`ThemeId` = `slate` \| `ocean` \| `violet` \| `forest` \| `sunset` |
| **持久化** | `localStorage` 键 `wc_theme`；`init()` 读回，`setTheme(id)` 写入并 `document.documentElement.setAttribute('data-theme', id)` |
| **启动顺序** | `main.ts`：`app.use(pinia)` 之后立刻 `useThemeStore().init()`；样式顺序为 `global.css` → `themes.css` |
| **首屏** | `index.html` 根节点带 `data-theme="slate"`，避免未执行 JS 前变量缺失 |

### 10.2 组件

| 组件 | 路径 | 说明 |
|------|------|------|
| **ThemePicker** | `src/components/ThemePicker.vue` | 顶栏右侧：画笔图标圆形按钮 + 下拉 5 项（图标 + 文案）；`popper-class="wc-theme-dropdown"`，当前项 `.is-active` 样式见同文件非 scoped 段 |

### 10.3 样式文件职责

| 文件 | 职责 |
|------|------|
| **`src/assets/styles/global.css`** | 全局 reset、`:root` 默认 `--wc-*`（与 slate 对齐）、`body`/`#app`、滚动条（随 `--wc-accent` / `--wc-muted` 变化） |
| **`src/assets/styles/themes.css`** | 各 `html[data-theme='…']` 的 `--wc-*` 调色；`html[data-theme]` 下将 Element Plus `--el-color-primary*` 映射到 `--wc-accent`；**主内容** `.main-scroll` 内表格/卡片/表单/树/按钮等深色覆盖；**顶栏** `.topbar`；**抽屉** `.el-drawer`（挂 body，单独写选择器） |

### 10.4 CSS 变量约定（`--wc-*`）

命名前缀 **`wc`** = weaviate client。常见变量包括：`--wc-bg`、`--wc-surface`、`--wc-surface-elevated`、`--wc-border`、`--wc-text`、`--wc-muted`、`--wc-sidebar`、`--wc-sidebar-border`、`--wc-topbar`、`--wc-accent`、`--wc-accent-2`、`--wc-menu-active-bg`、`--wc-menu-active-text`、`--wc-code-bg`、`--wc-scrollbar*`、`--wc-radius`、`--wc-shadow`。

业务页面中 **标题** 使用 `.page .title`；次要说明使用 **`.muted`**；JSON 块使用 **`.json`** 或 **`.cell-json`**（主题中已统一背景与边框），避免在 `<style scoped>` 里写死 `#64748b`、`#fff` 等浅色主题色。

### 10.5 与 Element Plus 的衔接

- 表格斑马纹、hover、固定列补片等依赖 EP 内部变量；`themes.css` 中已覆盖 `--el-table-*`、`--el-fill-color-*`（表格内）、以及 `.el-table__fixed-right-patch` 等硬编码浅色。
- **主色**：`html[data-theme]` 上设置 `--el-color-primary` 及 `light-3`～`light-9`、`dark-2`，使 `type="primary"`、文字按钮、focus 等与当前 `--wc-accent` 一致。
- **作用域**：多数内容在 `AppLayout` 的 **`.main-scroll`** 内；弹层（抽屉、部分下拉）在 `body` 上，需单独选择器（如 `.el-drawer`、`.wc-theme-dropdown`）。

### 10.6 修改主题时的注意点

- 新增预设：在 `theme.ts` 的 `ThemeId` / `isThemeId`、`ThemePicker` 的 `items`、`themes.css` 增加 `html[data-theme='新 id'] { … }`，并保持 `global.css` 的 `:root` 与默认主题一致或依赖 `index.html` 的 `data-theme`。
- 新增页面组件时优先用 **`var(--wc-*)`** 与既有 class（`.page`、`.muted`、`.json`），减少与 `themes.css` 的重复覆盖。

## 11. 测试与质量

- 关键逻辑：`connection` 组装 URL、`aggregate` 降级、嵌入测试请求 — 适合单元测试（Vitest）。
- 对 Weaviate 的集成：可用 mock server 或文档中的录制响应（勿在仓库提交真实密钥）。

## 12. 常见陷阱

- Weaviate 服务端版本与 REST/GraphQL 行为差异 — 升级前查发行说明。
- `nearVector` 维度必须与集合向量维度一致；嵌入模型变更需用户重新配置并提示重新索引类风险（只读工具可仅文案提示）。

## 13. 触发场景（Agent 何时读此 Skill）

- 新增或修改登录、连接、Pinia 状态。
- 集合树、对象表、文件夹聚合、检索页。
- 调整 Weaviate REST/GraphQL 封装与调用。
- 处理 CORS、混合内容（HTTPS 页面请求 HTTP Weaviate）问题。
- 修改主题、顶栏/侧栏/主内容样式、`ThemePicker`、或 Element Plus 深色适配（`themes.css` / `global.css`）。
