<template>
  <el-container class="shell">
    <el-header class="topbar" height="56px">
      <div class="topbar-left">
        <div class="app-mark" aria-hidden="true">W</div>
        <div class="app-titles">
          <div class="app-name">{{ t('app.title') }}</div>
          <div class="app-sub-row">
            <span class="app-sub">{{ t('app.subtitle') }}</span>
            <template v-if="conn.connectionUrl">
              <span class="app-sub-sep" aria-hidden="true">·</span>
              <el-tooltip :content="conn.connectionUrl" placement="bottom" effect="dark">
                <span class="app-sub-url">{{ conn.connectionUrl }}</span>
              </el-tooltip>
            </template>
          </div>
        </div>
      </div>
      <div class="topbar-right">
        <LanguageSwitcher />
        <ThemePicker />
        <el-tooltip :content="t('app.logout')" placement="bottom">
          <span class="logout-wrap">
            <el-button size="small" :icon="SwitchButton" circle :aria-label="t('app.logoutAria')" @click="logout" />
          </span>
        </el-tooltip>
      </div>
    </el-header>

    <el-container class="body">
      <div
        class="aside-shell"
        :style="{ width: `${asideWidth}px` }"
      >
        <div class="aside">
          <el-input
            v-model="filter"
            clearable
            :placeholder="t('nav.filterCollections')"
            size="small"
            class="filter aside-filter"
          />
          <el-scrollbar class="menu-scroll">
            <el-menu
              :key="menuRemountKey"
              :default-active="activeMenu"
              :default-openeds="openSubmenus"
              router
              class="aside-menu"
            >
              <el-menu-item index="/app/overview">
                <span>{{ t('nav.overview') }}</span>
              </el-menu-item>
              <el-sub-menu index="collections">
                <template #title>{{ t('nav.collections') }}</template>
                <el-menu-item
                  v-for="c in filteredClasses"
                  :key="c.class"
                  :index="`/app/collections/${encodeURIComponent(c.class)}`"
                >
                  <span class="cls-name">{{ c.class }}</span>
                </el-menu-item>
                <el-empty v-if="!filteredClasses.length" :description="t('nav.noCollections')" :image-size="64" />
              </el-sub-menu>
              <el-sub-menu index="ops">
                <template #title>{{ t('nav.operations') }}</template>
                <el-menu-item index="/app/search">
                  <span>{{ t('nav.vectorSearch') }}</span>
                </el-menu-item>
                <el-menu-item index="/app/ops/migration">
                  <span>{{ t('nav.dataMigration') }}</span>
                </el-menu-item>
              </el-sub-menu>
            </el-menu>
          </el-scrollbar>
        </div>
        <div
          class="aside-resizer"
          role="separator"
          aria-orientation="vertical"
          :aria-label="t('nav.asideResize')"
          @mousedown.prevent="onAsideResizeStart"
        />
      </div>

      <el-main class="main">
        <div
          class="main-scroll"
          :class="{ 'main-scroll--fill': mainScrollFill }"
        >
          <el-breadcrumb
            v-if="showBreadcrumb"
            class="main-breadcrumb"
            separator="/"
          >
            <el-breadcrumb-item
              v-for="(item, i) in breadcrumbItems"
              :key="i"
              :to="item.to"
            >
              {{ item.label }}
            </el-breadcrumb-item>
          </el-breadcrumb>
          <div class="main-router-body">
            <router-view v-slot="{ Component }">
              <keep-alive :include="[]">
                <component :is="Component" />
              </keep-alive>
            </router-view>
          </div>
        </div>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useConnectionStore } from '@/stores/connection'
import { useCollectionStatsStore } from '@/stores/collectionStats'
import { fetchSchema, type WeaviateClass } from '@/api/weaviate'
import { SwitchButton } from '@element-plus/icons-vue'
import ThemePicker from '@/components/ThemePicker.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'

const { t } = useI18n()

const ASIDE_WIDTH_KEY = 'wc_aside_width'
const DEFAULT_ASIDE_WIDTH = 260
const MIN_ASIDE_WIDTH = 180
const MAX_ASIDE_WIDTH = 520

const conn = useConnectionStore()
const router = useRouter()
const route = useRoute()

const classes = ref<WeaviateClass[]>([])
const filter = ref('')
const asideWidth = ref(DEFAULT_ASIDE_WIDTH)

let asideResizeDragging = false
let asideResizeStartX = 0
let asideResizeStartW = 0

function clampAsideWidth(n: number) {
  return Math.min(MAX_ASIDE_WIDTH, Math.max(MIN_ASIDE_WIDTH, Math.round(n)))
}

function loadAsideWidth() {
  try {
    const raw = localStorage.getItem(ASIDE_WIDTH_KEY)
    if (!raw) return
    const n = parseInt(raw, 10)
    if (!Number.isNaN(n)) asideWidth.value = clampAsideWidth(n)
  } catch {
    /* ignore */
  }
}

function saveAsideWidth() {
  try {
    localStorage.setItem(ASIDE_WIDTH_KEY, String(asideWidth.value))
  } catch {
    /* ignore */
  }
}

function onAsideResizeMove(e: MouseEvent) {
  if (!asideResizeDragging) return
  const delta = e.clientX - asideResizeStartX
  asideWidth.value = clampAsideWidth(asideResizeStartW + delta)
}

function onAsideResizeEnd() {
  if (!asideResizeDragging) return
  asideResizeDragging = false
  document.body.style.removeProperty('cursor')
  document.body.style.removeProperty('user-select')
  window.removeEventListener('mousemove', onAsideResizeMove)
  window.removeEventListener('mouseup', onAsideResizeEnd)
  saveAsideWidth()
}

function onAsideResizeStart(e: MouseEvent) {
  asideResizeDragging = true
  asideResizeStartX = e.clientX
  asideResizeStartW = asideWidth.value
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('mousemove', onAsideResizeMove)
  window.addEventListener('mouseup', onAsideResizeEnd)
}

const filteredClasses = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return classes.value
  return classes.value.filter((c) => c.class.toLowerCase().includes(q))
})

/** 与 default-openeds 同步，子菜单展开状态随路由切换时重建侧栏菜单 */
const openSubmenus = computed(() => {
  const p = route.path
  const ids: string[] = []
  if (p.startsWith('/app/collections/')) ids.push('collections')
  if (p.startsWith('/app/search') || p.startsWith('/app/ops/')) ids.push('ops')
  return ids
})

const menuRemountKey = computed(() => openSubmenus.value.join('|'))

const activeMenu = computed(() => {
  const p = route.path
  if (p.startsWith('/app/search')) return '/app/search'
  if (p.startsWith('/app/ops/migration')) return '/app/ops/migration'
  const m = p.match(/^\/app\/collections\/([^/]+)/)
  if (m) return `/app/collections/${m[1]}`
  return p
})

/** 概览 / 向量检索 / 集合各子页 / 备份·恢复执行页：主区域不整体滚动，由子页内部滚动 */
const mainScrollFill = computed(() => {
  const n = route.name
  if (n === 'overview' || n === 'search') return true
  if (n === 'migration-backup-run' || n === 'migration-restore-run') return true
  return typeof n === 'string' && n.startsWith('collection-')
})

type BreadcrumbItem = { label: string; to?: RouteLocationRaw }

const showBreadcrumb = computed(() => route.name !== 'overview')

const breadcrumbItems = computed<BreadcrumbItem[]>(() => {
  const n = route.name
  if (n === 'overview') return []

  const opsCrumb: BreadcrumbItem = { label: t('nav.operations') }
  const migrationHub: BreadcrumbItem = {
    label: t('migration.title'),
    to: { name: 'data-migration' },
  }

  if (n === 'search') {
    return [opsCrumb, { label: t('search.title') }]
  }

  if (typeof n === 'string' && n.startsWith('collection-')) {
    const raw = route.params.name as string
    const displayName = decodeURIComponent(raw)
    const collectionBase: RouteLocationRaw = {
      name: 'collection-overview',
      params: { name: raw },
    }
    let tabLabel = t('collection.tabOverview')
    if (n === 'collection-folders') tabLabel = t('collection.tabFolders')
    if (n === 'collection-objects') tabLabel = t('collection.tabObjects')
    return [
      { label: t('nav.collections') },
      { label: displayName, to: collectionBase },
      { label: tabLabel },
    ]
  }

  switch (n) {
    case 'data-migration':
      return [opsCrumb, { label: t('migration.title') }]
    case 'migration-backup':
      return [opsCrumb, migrationHub, { label: t('migration.backupGuide.title') }]
    case 'migration-backup-run':
      return [
        opsCrumb,
        migrationHub,
        {
          label: t('migration.backupGuide.title'),
          to: { name: 'migration-backup' },
        },
        { label: t('migration.backupRun.title') },
      ]
    case 'migration-restore':
      return [opsCrumb, migrationHub, { label: t('migration.restoreGuide.title') }]
    case 'migration-restore-run':
      return [
        opsCrumb,
        migrationHub,
        {
          label: t('migration.restoreGuide.title'),
          to: { name: 'migration-restore' },
        },
        { label: t('migration.restoreRun.title') },
      ]
    case 'migration-api':
      return [opsCrumb, migrationHub, { label: t('migration.apiGuide.title') }]
    case 'migration-api-run':
      return [
        opsCrumb,
        migrationHub,
        { label: t('migration.apiGuide.title'), to: { name: 'migration-api' } },
        { label: t('apiMigration.title') },
      ]
    default:
      return []
  }
})

async function reloadClasses() {
  try {
    classes.value = await fetchSchema()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : t('nav.fetchClassesFailed')
    ElMessage.error(msg)
    classes.value = []
  }
}

function logout() {
  useCollectionStatsStore().reset()
  conn.disconnect()
  router.replace({ name: 'login' })
}

provide('reloadAppClasses', reloadClasses)

onMounted(() => {
  loadAsideWidth()
  reloadClasses()
})

onUnmounted(() => {
  onAsideResizeEnd()
})
</script>

<style scoped>
.shell {
  height: 100%;
  min-height: 0;
  background: var(--wc-bg);
  flex-direction: column;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 20px;
  border-bottom: 1px solid var(--wc-border);
  background: var(--wc-topbar);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.app-mark {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, var(--wc-accent), var(--wc-accent-2));
  box-shadow: 0 10px 30px color-mix(in srgb, var(--wc-accent) 22%, transparent);
}

.app-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.app-name {
  font-weight: 700;
  font-size: 15px;
  color: var(--wc-text);
  line-height: 1.2;
}

.app-sub-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  line-height: 1.2;
}

.app-sub {
  flex-shrink: 0;
  color: var(--wc-muted);
}

.app-sub-sep {
  flex-shrink: 0;
  color: var(--wc-muted);
  opacity: 0.55;
}

.app-sub-url {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--wc-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.01em;
  cursor: default;
}

.topbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 220px;
  justify-content: flex-end;
}

.logout-wrap {
  display: inline-flex;
  vertical-align: middle;
  margin-left: 4px;
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

.aside-shell {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  min-height: 0;
  max-width: min(100%, 90vw);
}

.aside {
  flex: 1;
  min-width: 0;
  background: var(--wc-sidebar);
  color: var(--wc-text);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--wc-sidebar-border);
}

.aside-resizer {
  flex-shrink: 0;
  width: 6px;
  margin-left: -3px;
  cursor: col-resize;
  z-index: 2;
  align-self: stretch;
  touch-action: none;
  background: transparent;
}

.aside-resizer:hover {
  background: color-mix(in srgb, var(--wc-accent) 28%, transparent);
}

.aside-resizer:active {
  background: color-mix(in srgb, var(--wc-accent) 42%, transparent);
}

.filter {
  margin: 12px 12px 10px;
  width: auto;
}

.menu-scroll {
  flex: 1;
  min-height: 0;
  padding: 0 8px 8px;
}

.aside-menu {
  border-right: none;
  background: transparent;
}

:deep(.aside-menu .el-menu-item),
:deep(.aside-menu .el-sub-menu__title) {
  border-radius: 10px;
  margin: 2px 0;
}

:deep(.aside-menu .el-menu-item.is-active) {
  background: var(--wc-menu-active-bg) !important;
  font-weight: 600;
  box-shadow: inset 3px 0 0 var(--wc-accent);
}

:deep(.aside-menu .el-menu-item),
:deep(.aside-menu .el-sub-menu__title) {
  color: var(--wc-muted);
}

:deep(.aside-menu .el-menu-item.is-active) {
  color: var(--wc-menu-active-text) !important;
}

.cls-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 侧栏集合列表：去掉子菜单 / 空状态默认白底 */
:deep(.aside-filter .el-input__wrapper) {
  background: color-mix(in srgb, var(--wc-surface) 42%, transparent) !important;
  box-shadow: none !important;
  border: 1px solid var(--wc-border);
}
:deep(.aside-filter .el-input__inner) {
  color: var(--wc-text);
}
:deep(.aside-filter .el-input__inner::placeholder) {
  color: var(--wc-muted);
}
:deep(.aside-menu.el-menu) {
  background: transparent !important;
  --el-menu-bg-color: transparent;
  --el-menu-hover-bg-color: color-mix(in srgb, var(--wc-accent) 10%, transparent);
}
:deep(.aside-menu .el-menu) {
  background: transparent !important;
}
:deep(.aside-menu .el-sub-menu__title) {
  background: transparent !important;
}
:deep(.aside-menu .el-sub-menu .el-menu) {
  background: transparent !important;
}
:deep(.aside-menu .el-sub-menu .el-menu-item) {
  background: transparent !important;
}
:deep(.aside-menu .el-sub-menu .el-menu-item:hover) {
  background: color-mix(in srgb, var(--wc-accent) 10%, transparent) !important;
}
:deep(.aside-menu .el-empty) {
  background: transparent;
  padding: 12px 0;
}
:deep(.aside-menu .el-empty__description) {
  color: var(--wc-muted);
}
:deep(.aside-menu .el-empty__image) {
  opacity: 0.45;
}

.main {
  padding: 0;
  background: var(--wc-bg);
  min-width: 0;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 22px 24px 0;
}

.main-scroll--fill {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.main-breadcrumb {
  flex-shrink: 0;
  margin-bottom: 14px;
}

:deep(.main-breadcrumb.el-breadcrumb) {
  --el-text-color-regular: var(--wc-muted);
  --el-text-color-primary: var(--wc-text);
}

:deep(.main-breadcrumb .el-breadcrumb__inner.is-link) {
  color: var(--wc-accent);
  font-weight: 500;
}

:deep(.main-breadcrumb .el-breadcrumb__inner.is-link:hover) {
  color: color-mix(in srgb, var(--wc-accent) 85%, #fff);
}

:deep(.main-breadcrumb .el-breadcrumb__separator) {
  color: var(--wc-muted);
}

.main-router-body {
  min-height: 0;
}

/* 子页面根节点撑满高度，便于内部仅表格区域滚动 */
.main-scroll--fill > .main-router-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.main-scroll--fill > .main-router-body > * {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
