<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <span>Schema</span>
        <el-tag v-if="count !== null" class="ml" type="info">Objects: {{ count }}</el-tag>
        <el-tag v-else class="ml" type="warning">Objects: N/A</el-tag>
        <el-button
          size="small"
          class="ml wc-overview-refresh"
          :loading="loading"
          @click="load"
        >
          {{ t('common.refresh') }}
        </el-button>
        <el-button
          type="danger"
          size="small"
          class="ml"
          :loading="deleting"
          :disabled="loading || !cls"
          @click="onDeleteCollection"
        >
          {{ t('collection.deleteCollection') }}
        </el-button>
      </template>
      <div class="overview-body">
        <el-descriptions
          v-if="cls"
          class="collection-schema-descriptions"
          :column="1"
          border
          size="small"
        >
          <el-descriptions-item label="description">{{
            cls.description || '—'
          }}</el-descriptions-item>
          <el-descriptions-item label="vectorizer">{{
            cls.vectorizer || '—'
          }}</el-descriptions-item>
          <el-descriptions-item label="vectorIndexType">{{
            cls.vectorIndexType || '—'
          }}</el-descriptions-item>
          <el-descriptions-item label="multiTenancyConfig.enabled">
            {{
              cls.multiTenancyConfig == null
                ? '—'
                : String(cls.multiTenancyConfig.enabled)
            }}
          </el-descriptions-item>
        </el-descriptions>
        <el-empty v-else description="Failed to load schema" />
        <el-divider />
        <template v-if="cls?.properties?.length">
          <h4 class="h4">properties</h4>
          <el-table
            class="properties-detail-table"
            :data="cls.properties"
            size="small"
            border
            stripe
          >
            <el-table-column
              v-for="key in propertyDetailKeys"
              :key="key"
              :label="key"
              min-width="140"
              class-name="wc-prop-detail-cell"
              show-overflow-tooltip
            >
              <template #default="{ row }">
                {{ formatPropertyCellValue((row as Record<string, unknown>)[key]) }}
              </template>
            </el-table-column>
          </el-table>
        </template>
        <el-empty v-else-if="cls" description="(no properties)" />

        <div class="config-section">
          <h4 class="h4">replicationConfig</h4>
          <el-table
            v-if="replicationRows.length"
            class="collection-config-table"
            :data="replicationRows"
            size="small"
            border
            stripe
          >
            <el-table-column
              prop="key"
              label="key"
              min-width="200"
              width="240"
              show-overflow-tooltip
            />
            <el-table-column
              prop="value"
              label="value"
              min-width="280"
              class-name="wc-config-value-cell"
              show-overflow-tooltip
            />
          </el-table>
          <el-empty v-else description="(no replicationConfig)" />
        </div>

        <div class="config-section">
          <h4 class="h4">shardingConfig</h4>
          <el-table
            v-if="shardingRows.length"
            class="collection-config-table"
            :data="shardingRows"
            size="small"
            border
            stripe
          >
            <el-table-column
              prop="key"
              label="key"
              min-width="200"
              width="240"
              show-overflow-tooltip
            />
            <el-table-column
              prop="value"
              label="value"
              min-width="280"
              class-name="wc-config-value-cell"
              show-overflow-tooltip
            />
          </el-table>
          <el-empty v-else description="(no shardingConfig)" />
        </div>

        <div class="config-section">
          <h4 class="h4">{{ vectorConfigSectionLabel }}</h4>
          <el-table
            v-if="vectorRows.length"
            class="collection-config-table"
            :data="vectorRows"
            size="small"
            border
            stripe
          >
            <el-table-column
              prop="key"
              label="key"
              min-width="200"
              width="240"
              show-overflow-tooltip
            />
            <el-table-column
              prop="value"
              label="value"
              min-width="280"
              class-name="wc-config-value-cell"
              show-overflow-tooltip
            />
          </el-table>
          <el-empty
            v-else
            :description="`(no ${vectorConfigSectionLabel})`"
          />
        </div>

        <div class="config-section">
          <h4 class="h4">multiTenancyConfig</h4>
          <el-table
            v-if="multiTenancyRows.length"
            class="collection-config-table"
            :data="multiTenancyRows"
            size="small"
            border
            stripe
          >
            <el-table-column
              prop="key"
              label="key"
              min-width="200"
              width="240"
              show-overflow-tooltip
            />
            <el-table-column
              prop="value"
              label="value"
              min-width="280"
              class-name="wc-config-value-cell"
              show-overflow-tooltip
            />
          </el-table>
          <el-empty v-else description="(no multiTenancyConfig)" />
        </div>

        <div class="config-section">
          <h4 class="h4">invertedIndexConfig</h4>
          <el-table
            v-if="invertedRows.length"
            class="collection-config-table"
            :data="invertedRows"
            size="small"
            border
            stripe
          >
            <el-table-column
              prop="key"
              label="key"
              min-width="200"
              width="240"
              show-overflow-tooltip
            />
            <el-table-column
              prop="value"
              label="value"
              min-width="280"
              class-name="wc-config-value-cell"
              show-overflow-tooltip
            />
          </el-table>
          <el-empty v-else description="(no invertedIndexConfig)" />
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { aggregateCount, deleteClassSchema, fetchClassSchema, type WeaviateClass } from '@/api/weaviate'
import { useCollectionStatsStore } from '@/stores/collectionStats'
import { configObjectToRows } from '@/utils/configTable'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const collectionStats = useCollectionStatsStore()
const reloadAppClasses = inject<() => Promise<void>>('reloadAppClasses', () => Promise.resolve())
const loading = ref(false)
const deleting = ref(false)
const cls = ref<WeaviateClass | null>(null)
const count = ref<number | null>(null)

const className = computed(() => decodeURIComponent(route.params.name as string))

/** 与 Weaviate class JSON 字段名一致（vectorIndexConfig 与 vectorConfig 二选一） */
const vectorConfigSectionLabel = computed(() => {
  const c = cls.value
  if (!c) return 'vectorIndexConfig'
  if (c.vectorIndexConfig != null) return 'vectorIndexConfig'
  if (c.vectorConfig != null) return 'vectorConfig'
  return 'vectorIndexConfig'
})

const replicationRows = computed(() => configObjectToRows(cls.value?.replicationConfig))
const shardingRows = computed(() => configObjectToRows(cls.value?.shardingConfig))
const vectorRows = computed(() =>
  configObjectToRows(cls.value?.vectorIndexConfig ?? cls.value?.vectorConfig),
)
const multiTenancyRows = computed(() => configObjectToRows(cls.value?.multiTenancyConfig))
const invertedRows = computed(() => configObjectToRows(cls.value?.invertedIndexConfig))

/** 各 property 对象的一级字段名（并集），name 优先，其余字母序 */
const propertyDetailKeys = computed(() => {
  const keys = new Set<string>()
  for (const p of cls.value?.properties ?? []) {
    Object.keys(p as Record<string, unknown>).forEach((k) => keys.add(k))
  }
  const rest = Array.from(keys).filter((k) => k !== 'name').sort()
  return keys.has('name') ? ['name', ...rest] : rest
})

/** 一级字段值：与 API 一致直接展示（含 null / 布尔）；嵌套对象/数组用 JSON.stringify */
function formatPropertyCellValue(v: unknown): string {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

async function load() {
  loading.value = true
  try {
    const name = className.value
    cls.value = await fetchClassSchema(name)
    count.value = await aggregateCount(name)
  } catch {
    cls.value = null
    count.value = null
  } finally {
    loading.value = false
  }
}

async function onDeleteCollection() {
  const name = className.value
  if (!cls.value || !name) return
  try {
    await ElMessageBox.confirm(
      t('collection.deleteCollectionConfirmMsg', { name }),
      t('collection.deleteCollectionConfirmTitle'),
      {
        type: 'warning',
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
      },
    )
  } catch {
    return
  }
  deleting.value = true
  try {
    await deleteClassSchema(name)
    ElMessage.success(t('collection.deleteCollectionOk', { name }))
    await reloadAppClasses()
    await collectionStats.fetchStats(true)
    await router.replace({ name: 'overview' })
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : t('collection.deleteCollectionFail'))
  } finally {
    deleting.value = false
  }
}

watch(
  () => route.params.name,
  () => load(),
)

onMounted(() => load())
</script>

<style scoped>
/* 与 collection-tab-content--fill 配合：卡片头固定，仅 body 滚动 */
.page {
  min-height: 0;
}

.page :deep(.el-card) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page :deep(.el-card__header) {
  flex-shrink: 0;
}

.page :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.ml {
  margin-left: 8px;
}

.h4 {
  margin: 0 0 8px;
  font-size: 14px;
}

.properties-detail-table {
  width: 100%;
}

.properties-detail-table :deep(.wc-prop-detail-cell .cell) {
  font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.overview-body {
  position: relative;
  min-height: 120px;
}

.config-section {
  margin-top: 16px;
}

.collection-config-table :deep(.wc-config-value-cell .cell) {
  white-space: pre-wrap;
  font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.45;
  word-break: break-word;
}

/* Schema 表格：标签列固定宽度，值列占满剩余（与主题表头风格一致） */
.collection-schema-descriptions :deep(.el-descriptions__table) {
  table-layout: fixed;
  width: 100%;
}

/* 标签列宽与下方 properties 表列宽一致（min-width 200 / width 240） */
.collection-schema-descriptions :deep(.el-descriptions__label) {
  width: 240px;
  max-width: 240px;
  vertical-align: top;
  box-sizing: border-box;
}

.collection-schema-descriptions :deep(.el-descriptions__content) {
  width: auto;
  vertical-align: top;
  word-break: break-word;
}

/* 与 EP 变量链解耦：标签列背景与值列同为 surface（避免 color-mix 变量失效留白） */
.collection-schema-descriptions :deep(td.el-descriptions__cell.is-bordered-label),
.collection-schema-descriptions :deep(th.el-descriptions__cell.is-bordered-label) {
  background-color: var(--wc-surface) !important;
  background: var(--wc-surface) !important;
  color: var(--wc-muted) !important;
}
</style>
