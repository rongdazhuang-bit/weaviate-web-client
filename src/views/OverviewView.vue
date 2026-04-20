<template>
  <div class="page page-overview">
    <h2 class="title">{{ t('overview.title') }}</h2>

    <section class="nodes-dashboard mt" :aria-label="t('overview.nodesAria')">
      <div v-if="nodeList.length" class="nodes-grid">
        <el-card
          v-for="(n, idx) in nodeList"
          :key="`${n.name}-${idx}`"
          shadow="never"
          class="node-dash-card"
        >
          <dl class="node-dash-dl">
            <div class="node-dash-row">
              <dt>{{ t('overview.node') }}</dt>
              <dd class="wrap">{{ n.name }}</dd>
            </div>
            <div class="node-dash-row">
              <dt>{{ t('overview.mode') }}</dt>
              <dd>{{ n.operationalMode }}</dd>
            </div>
            <div class="node-dash-row">
              <dt>{{ t('overview.status') }}</dt>
              <dd>
                <el-tag :type="statusTagType(n.status)" size="small">{{ n.status }}</el-tag>
              </dd>
            </div>
            <div class="node-dash-row">
              <dt>{{ t('overview.version') }}</dt>
              <dd class="mono">{{ n.version }}</dd>
            </div>
          </dl>
        </el-card>
      </div>
      <el-empty v-else :description="t('overview.noNodes')" />
    </section>

    <section class="meta-row mt">
      <el-card shadow="never" class="collections-dash" :aria-label="t('overview.collectionStats')">
        <template #header>
          <div class="collections-dash-header">
            <span>{{ t('overview.collectionStats') }}</span>
            <el-button
              size="small"
              text
              type="primary"
              :loading="statsLoading"
              class="dash-refresh-btn"
              @click="onRefreshStats"
            >
              {{ t('common.refresh') }}
            </el-button>
          </div>
        </template>
        <div class="dash-summary">
          <div class="dash-stat">
            <span class="muted">{{ t('overview.collectionCount') }}</span>
            <strong class="dash-stat-value">{{ totalCollections }}</strong>
          </div>
          <div class="dash-stat">
            <span class="muted">{{ t('overview.objectTotal') }}</span>
            <strong class="dash-stat-value">{{ totalObjectsText }}</strong>
          </div>
        </div>
        <p v-if="partialCounts" class="dash-hint muted">{{ t('overview.partialCountsHint') }}</p>
        <p v-if="lastUpdatedAt" class="dash-cache-line muted">{{ cacheLineText }}</p>
        <div class="dash-table-scroll">
          <div class="dash-table-wrap">
            <el-table
              v-if="collectionStats.length"
              :data="collectionStats"
              size="small"
              stripe
              border
              class="dash-table"
              height="100%"
            >
            <el-table-column prop="name" :label="t('overview.colName')" min-width="120" show-overflow-tooltip />
            <el-table-column :label="t('overview.colObjects')" width="88" align="right">
                <template #default="{ row }">
                  {{ row.count !== null ? row.count : t('common.emDash') }}
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else-if="!statsLoading" :description="t('overview.noCollections')" />
          </div>
        </div>
      </el-card>

      <el-card shadow="never" class="meta-card meta-card--fill">
        <template #header>{{ t('overview.metaHeader') }}</template>
        <div v-if="metaJson" class="meta-json-scroll">
          <pre class="json">{{ metaJson }}</pre>
        </div>
        <el-empty v-else :description="t('overview.noMeta')" />
      </el-card>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { fetchMeta, fetchNodes, parseWeaviateNodesPayload, type WeaviateMeta } from '@/api/weaviate'
import { useCollectionStatsStore } from '@/stores/collectionStats'
import { formatWcDateTime } from '@/utils/dateTime'

const { t } = useI18n()

const nodes = ref<unknown | null>(null)
const meta = ref<WeaviateMeta | null>(null)

const statsStore = useCollectionStatsStore()
const { rows: collectionStats, loading: statsLoading, lastUpdatedAt } = storeToRefs(statsStore)

const nodeList = computed(() => parseWeaviateNodesPayload(nodes.value))

const metaJson = computed(() => (meta.value ? JSON.stringify(meta.value, null, 2) : ''))

const cacheLineText = computed(() => {
  const ts = lastUpdatedAt.value
  if (!ts) return ''
  return t('overview.cachedAt', { time: formatWcDateTime(ts) })
})

const totalCollections = computed(() => collectionStats.value.length)

const totalObjectsText = computed(() => {
  const rows = collectionStats.value
  if (!rows.length) return t('common.emDash')
  const nums = rows.map((r) => r.count).filter((n): n is number => n !== null)
  if (!nums.length) return t('common.emDash')
  return String(nums.reduce((a, b) => a + b, 0))
})

const partialCounts = computed(() => {
  const rows = collectionStats.value
  if (!rows.length) return false
  return rows.some((r) => r.count === null)
})

function statusTagType(
  status: string,
): 'success' | 'warning' | 'danger' | 'info' {
  const u = status.toUpperCase()
  if (u === '—') return 'info'
  if (u.includes('HEALTHY') || u === 'OK' || u.includes('READY')) return 'success'
  if (u.includes('UNHEALTHY') || u.includes('FAILED') || u.includes('ERROR')) return 'danger'
  return 'warning'
}

async function loadOverview() {
  const [metaRes, nodesRes] = await Promise.allSettled([fetchMeta(), fetchNodes()])
  meta.value = metaRes.status === 'fulfilled' ? metaRes.value : null
  nodes.value = nodesRes.status === 'fulfilled' ? nodesRes.value : null
}

/** preferCache=true 时命中内存缓存则不再请求；false 为强制重新统计 */
async function loadCollectionStats(preferCache: boolean) {
  try {
    await statsStore.fetchStats(!preferCache)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : t('overview.statsFailed')
    ElMessage.error(msg)
  }
}

function onRefreshStats() {
  void loadCollectionStats(false)
}

onMounted(() => {
  void loadOverview()
  void loadCollectionStats(true)
})
</script>

<style scoped>
.title {
  margin: 0 0 8px;
  font-size: 18px;
}
.mt {
  margin-top: 16px;
}

.page-overview {
  min-height: 0;
}

.page-overview .title {
  flex-shrink: 0;
}

/* 节点区过高时自身滚动，避免挤掉下方元信息 */
.nodes-dashboard {
  flex-shrink: 0;
  max-height: min(42vh, 420px);
  overflow-y: auto;
}

.nodes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
  align-items: stretch;
}

.node-dash-card {
  border: 1px solid var(--wc-border);
  background: var(--wc-surface-elevated);
}

.node-dash-card :deep(.el-card__body) {
  padding: 14px 16px;
}

.node-dash-row dd.wrap {
  word-break: break-word;
}

.node-dash-dl {
  margin: 0;
}

.node-dash-row {
  display: grid;
  grid-template-columns: minmax(100px, 42%) 1fr;
  gap: 8px 12px;
  align-items: start;
  font-size: 12px;
  margin-bottom: 10px;
}

.node-dash-row:last-child {
  margin-bottom: 0;
}

.node-dash-row dt {
  margin: 0;
  color: var(--wc-muted);
  font-weight: 500;
}

.node-dash-row dd {
  margin: 0;
  color: var(--wc-text);
  min-width: 0;
}

.node-dash-row dd.mono {
  font-family: ui-monospace, monospace;
  word-break: break-all;
}

.meta-card {
  border: 1px solid var(--wc-border);
  background: var(--wc-surface-elevated);
}

/* 元信息行：左侧集合统计 + 右侧 meta JSON */
.meta-row {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
  align-items: stretch;
}

.collections-dash {
  flex: 0 0 clamp(260px, 32vw, 360px);
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--wc-border);
  background: var(--wc-surface-elevated);
}

.collections-dash :deep(.el-card__header) {
  padding: 12px 14px;
}

.collections-dash-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
}

.collections-dash :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 14px;
}

.dash-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.dash-stat {
  padding: 10px 12px;
  border-radius: var(--wc-radius, 8px);
  border: 1px solid var(--wc-border);
  background: color-mix(in srgb, var(--wc-surface) 88%, transparent);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dash-stat .muted {
  font-size: 12px;
}

.dash-stat-value {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--wc-text);
  line-height: 1.2;
}

.dash-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
}

.dash-cache-line {
  margin: -4px 0 0;
  font-size: 11px;
  line-height: 1.4;
}

/* 高度交给 el-table，表头固定、仅表体滚动（外层不再整体滚动） */
.dash-table-scroll {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
}

.dash-refresh-btn {
  flex-shrink: 0;
}

.dash-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dash-table {
  width: 100%;
}

.dash-table-wrap :deep(.el-table__inner-wrapper) {
  min-height: 0;
}

/* 占满主区域剩余高度，JSON 仅在框内滚动 */
.meta-card--fill {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.meta-card--fill :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.meta-json-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border-radius: 8px;
  border: 1px solid var(--wc-border);
  background: var(--wc-code-bg);
}

.json {
  margin: 0;
  padding: 12px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--wc-text);
}
</style>
