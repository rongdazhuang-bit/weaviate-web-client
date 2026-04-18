<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <span>{{ t('collection.schema') }}</span>
        <el-tag v-if="count !== null" class="ml" type="info">{{
          t('collection.objectCount', { n: count })
        }}</el-tag>
        <el-tag v-else class="ml" type="warning">{{ t('collection.objectCountUnknown') }}</el-tag>
        <el-button
          size="small"
          class="ml wc-overview-refresh"
          :loading="loading"
          @click="load"
        >
          {{ t('common.refresh') }}
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
          <el-descriptions-item :label="t('collection.desc')">{{
            cls.description || t('common.emDash')
          }}</el-descriptions-item>
          <el-descriptions-item :label="t('collection.vectorizer')">{{
            cls.vectorizer || t('common.emDash')
          }}</el-descriptions-item>
          <el-descriptions-item :label="t('collection.vectorIndexType')">{{
            cls.vectorIndexType || t('common.emDash')
          }}</el-descriptions-item>
          <el-descriptions-item :label="t('collection.tenant')">
            {{ cls.multiTenancyConfig?.enabled ? t('common.yes') : t('common.no') }}
          </el-descriptions-item>
        </el-descriptions>
        <el-empty v-else :description="t('collection.loadSchemaFailed')" />
        <el-divider />
        <template v-if="cls?.properties?.length">
          <h4 class="h4">{{ t('collection.propsTitle') }}</h4>
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
        <el-empty v-else-if="cls" :description="t('collection.noProps')" />

        <div class="config-section">
          <h4 class="h4">{{ t('collection.replication') }}</h4>
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
              :label="t('collection.colField')"
              min-width="200"
              width="240"
              show-overflow-tooltip
            />
            <el-table-column
              prop="value"
              :label="t('collection.colValue')"
              min-width="280"
              class-name="wc-config-value-cell"
              show-overflow-tooltip
            />
          </el-table>
          <el-empty v-else :description="t('collection.noReplication')" />
        </div>

        <div class="config-section">
          <h4 class="h4">{{ t('collection.sharding') }}</h4>
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
              :label="t('collection.colField')"
              min-width="200"
              width="240"
              show-overflow-tooltip
            />
            <el-table-column
              prop="value"
              :label="t('collection.colValue')"
              min-width="280"
              class-name="wc-config-value-cell"
              show-overflow-tooltip
            />
          </el-table>
          <el-empty v-else :description="t('collection.noSharding')" />
        </div>

        <div class="config-section">
          <h4 class="h4">{{ t('collection.vector') }}</h4>
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
              :label="t('collection.colField')"
              min-width="200"
              width="240"
              show-overflow-tooltip
            />
            <el-table-column
              prop="value"
              :label="t('collection.colValue')"
              min-width="280"
              class-name="wc-config-value-cell"
              show-overflow-tooltip
            />
          </el-table>
          <el-empty v-else :description="t('collection.noVector')" />
        </div>

        <div class="config-section">
          <h4 class="h4">{{ t('collection.multiTenancy') }}</h4>
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
              :label="t('collection.colField')"
              min-width="200"
              width="240"
              show-overflow-tooltip
            />
            <el-table-column
              prop="value"
              :label="t('collection.colValue')"
              min-width="280"
              class-name="wc-config-value-cell"
              show-overflow-tooltip
            />
          </el-table>
          <el-empty v-else :description="t('collection.noMultiTenancy')" />
        </div>

        <div class="config-section">
          <h4 class="h4">{{ t('collection.inverted') }}</h4>
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
              :label="t('collection.colField')"
              min-width="200"
              width="240"
              show-overflow-tooltip
            />
            <el-table-column
              prop="value"
              :label="t('collection.colValue')"
              min-width="280"
              class-name="wc-config-value-cell"
              show-overflow-tooltip
            />
          </el-table>
          <el-empty v-else :description="t('collection.noInverted')" />
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { aggregateCount, fetchClassSchema, type WeaviateClass } from '@/api/weaviate'
import { configObjectToRows } from '@/utils/configTable'

const { t } = useI18n()
const route = useRoute()
const loading = ref(false)
const cls = ref<WeaviateClass | null>(null)
const count = ref<number | null>(null)

const className = computed(() => decodeURIComponent(route.params.name as string))

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

/** 一级字段值：标量直接展示；对象/数组（含嵌套 JSON）整段 JSON.stringify */
function formatPropertyCellValue(v: unknown): string {
  if (v === null || v === undefined) return t('common.emDash')
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

watch(
  () => route.params.name,
  () => load(),
)

onMounted(() => load())
</script>

<style scoped>
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

/* 标签列宽与下方「属性定义」表中「名称」列一致（min-width 200 / width 240） */
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
