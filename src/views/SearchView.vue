<template>
  <div class="page search-page">
    <div class="search-top">
      <h2 class="title">{{ t('search.title') }}</h2>
      <el-row :gutter="16">
        <el-col :span="10">
          <el-card shadow="never">
            <template #header>{{ t('search.embedCard') }}</template>
            <el-form label-position="top" size="small">
              <el-form-item :label="t('search.baseUrl')">
                <el-input v-model="emb.baseURL" placeholder="https://api.openai.com/v1" />
              </el-form-item>
              <el-form-item :label="t('search.model')">
                <el-input v-model="emb.model" placeholder="text-embedding-3-small" />
              </el-form-item>
              <el-form-item :label="t('search.apiKey')">
                <el-input
                  v-model="emb.apiKey"
                  type="password"
                  show-password
                  :placeholder="t('search.embedPlaceholder')"
                />
              </el-form-item>
              <el-form-item>
                <el-button @click="testEmbed" :loading="testing">{{ t('search.testEmbed') }}</el-button>
                <span v-if="emb.dimensions" class="dim">{{ t('search.testedDims', { n: emb.dimensions }) }}</span>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>
        <el-col :span="14">
          <el-card shadow="never">
            <template #header>{{ t('search.queryCard') }}</template>
            <el-form label-position="top" size="small">
              <el-form-item :label="t('search.targetClass')">
                <el-select v-model="className" filterable :placeholder="t('search.selectClass')" style="width: 100%">
                  <el-option v-for="c in classes" :key="c.class" :label="c.class" :value="c.class" />
                </el-select>
              </el-form-item>
              <el-form-item :label="t('search.queryText')">
                <el-input v-model="queryText" type="textarea" :rows="4" :placeholder="t('search.queryPlaceholder')" />
              </el-form-item>
              <el-form-item :label="t('search.searchMode')">
                <el-select v-model="searchMode" style="width: 100%">
                  <el-option value="bm25" :label="t('search.searchModeBm25')" />
                  <el-option value="vector" :label="t('search.searchModeVector')" />
                </el-select>
                <p class="mode-hint muted">{{ searchMode === 'bm25' ? t('search.modeHintBm25') : t('search.modeHintVector') }}</p>
              </el-form-item>
              <el-form-item
                v-if="searchMode === 'bm25'"
                :label="t('search.bm25Properties')"
              >
                <el-select
                  v-model="bm25SelectedFields"
                  multiple
                  collapse-tags
                  collapse-tags-tooltip
                  filterable
                  :placeholder="t('search.bm25PropertiesPlaceholder')"
                  style="width: 100%"
                  :disabled="!bm25FieldOptions.length"
                >
                  <el-option
                    v-for="p in bm25FieldOptions"
                    :key="p"
                    :label="p"
                    :value="p"
                  />
                </el-select>
                <p class="mode-hint muted">{{ t('search.bm25PropertiesHint') }}</p>
              </el-form-item>
              <el-form-item :label="t('search.limit')">
                <el-input-number v-model="limit" :min="1" :max="100" />
              </el-form-item>
              <el-form-item>
                <el-button :loading="searching" @click="runSearch">{{ t('search.runSearch') }}</el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <el-drawer
      v-model="resultsDrawerVisible"
      class="search-results-drawer"
      :title="t('search.results')"
      direction="rtl"
      size="50vw"
      append-to-body
      :close-on-click-modal="true"
    >
      <div class="search-drawer-body">
        <div v-if="searching" class="search-drawer-loading">
          <el-icon class="is-loading search-drawer-loading-icon"><Loading /></el-icon>
          <span class="muted">{{ t('common.loading') }}</span>
        </div>
        <template v-else>
          <el-table
            v-if="hits.length"
            class="search-results-table"
            :data="hits"
            size="small"
            border
            height="100%"
          >
            <el-table-column prop="id" label="id" width="320" show-overflow-tooltip />
            <el-table-column
              v-if="searchMode === 'bm25'"
              :label="t('search.colBm25Score')"
              width="100"
              show-overflow-tooltip
            >
              <template #default="{ row }">
                {{ row.score != null ? row.score : t('common.emDash') }}
              </template>
            </el-table-column>
            <el-table-column
              v-if="searchMode === 'vector'"
              :label="t('search.colVectorDistance')"
              width="120"
              min-width="100"
              show-overflow-tooltip
            >
              <template #default="{ row }">
                {{ formatMetric(row.distance) }}
              </template>
            </el-table-column>
            <el-table-column
              v-if="searchMode === 'vector'"
              :label="t('search.colVectorCertainty')"
              width="120"
              min-width="100"
              show-overflow-tooltip
            >
              <template #default="{ row }">
                {{ formatMetric(row.certainty) }}
              </template>
            </el-table-column>
            <el-table-column :label="t('search.colProps')" min-width="360">
              <template #default="{ row }">
                <pre class="cell-json">{{ JSON.stringify(row.properties, null, 2) }}</pre>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else :description="t('search.noResults')" />
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { useEmbeddingStore } from '@/stores/embedding'
import { embedTextOpenAICompatible } from '@/api/embedding'
import {
  bm25Search,
  fetchClassSchema,
  fetchSchema,
  nearVectorSearch,
  type NearVectorHit,
  type WeaviateClass,
} from '@/api/weaviate'
import { propertyNamesFromClass } from '@/utils/schema'

const { t } = useI18n()
const emb = useEmbeddingStore()
const testing = ref(false)
const searching = ref(false)
const classes = ref<WeaviateClass[]>([])
const className = ref('')
const queryText = ref('')
const limit = ref(10)
/** bm25：倒排索引；vector：客户端嵌入 + nearVector */
const searchMode = ref<'bm25' | 'vector'>('bm25')
/** 当前集合 schema 中的属性名（用于 BM25 限定检索字段） */
const bm25FieldOptions = ref<string[]>([])
/** 选中的 BM25 检索属性；默认全选 */
const bm25SelectedFields = ref<string[]>([])
const resultsDrawerVisible = ref(false)
const hits = ref<NearVectorHit[]>([])

/** 展示 GraphQL `_additional` 中的 distance / certainty（与 BM25 的 score 分列） */
function formatMetric(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return t('common.emDash')
  const s = v.toFixed(6)
  return s.replace(/\.?0+$/, '') || '0'
}

async function loadClasses() {
  classes.value = await fetchSchema()
  if (!className.value && classes.value.length) className.value = classes.value[0].class
}

watch(
  () => className.value,
  async (name) => {
    bm25FieldOptions.value = []
    bm25SelectedFields.value = []
    if (!name) return
    try {
      const cls = await fetchClassSchema(name)
      const names = propertyNamesFromClass(cls)
      bm25FieldOptions.value = names
      bm25SelectedFields.value = []
    } catch {
      bm25FieldOptions.value = []
      bm25SelectedFields.value = []
    }
  },
  { immediate: true },
)

async function testEmbed() {
  if (!emb.baseURL.trim() || !emb.model.trim() || !emb.apiKey.trim()) {
    ElMessage.warning(t('search.fillEmbed'))
    return
  }
  testing.value = true
  try {
    const r = await embedTextOpenAICompatible({
      baseURL: emb.baseURL.trim(),
      apiKey: emb.apiKey.trim(),
      model: emb.model.trim(),
      text: 'weaviate embedding test',
    })
    emb.dimensions = r.dimensions
    ElMessage.success(t('search.embedOk', { ms: r.latencyMs, dim: r.dimensions }))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : t('search.embedFail')
    ElMessage.error(msg)
  } finally {
    testing.value = false
  }
}

async function runSearch() {
  if (!className.value) {
    ElMessage.warning(t('search.pickClass'))
    return
  }
  if (!queryText.value.trim()) {
    ElMessage.warning(t('search.enterQuery'))
    return
  }
  if (
    searchMode.value === 'bm25' &&
    bm25FieldOptions.value.length > 0 &&
    bm25SelectedFields.value.length === 0
  ) {
    ElMessage.warning(t('search.pickBm25Property'))
    return
  }
  if (
    searchMode.value === 'vector' &&
    (!emb.baseURL.trim() || !emb.model.trim() || !emb.apiKey.trim())
  ) {
    ElMessage.error(t('search.needEmbedVector'))
    return
  }
  resultsDrawerVisible.value = true
  searching.value = true
  hits.value = []
  try {
    const cls = await fetchClassSchema(className.value)
    const props = propertyNamesFromClass(cls)

    if (searchMode.value === 'bm25') {
      const bm25Props =
        bm25SelectedFields.value.length > 0 ? bm25SelectedFields.value : undefined
      hits.value = await bm25Search(
        className.value,
        queryText.value.trim(),
        limit.value,
        props,
        bm25Props,
      )
      return
    }

    const { vector } = await embedTextOpenAICompatible({
      baseURL: emb.baseURL.trim(),
      apiKey: emb.apiKey.trim(),
      model: emb.model.trim(),
      text: queryText.value.trim(),
    })
    emb.dimensions = vector.length
    hits.value = await nearVectorSearch(className.value, vector, limit.value, props)
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : t('search.searchFail'))
  } finally {
    searching.value = false
  }
}

onMounted(() => loadClasses())
</script>

<style scoped>
.search-page {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.search-top {
  flex-shrink: 0;
}

.title {
  margin: 0 0 16px;
  font-size: 18px;
}

.search-drawer-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

.search-drawer-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 16px;
  color: var(--wc-muted);
}

.search-drawer-loading-icon {
  font-size: 28px;
  color: var(--wc-accent);
}

.search-results-table {
  flex: 1;
  min-height: 0;
}

.search-results-table :deep(table) {
  table-layout: fixed;
  width: 100%;
}

.mode-hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.45;
}

.dim {
  margin-left: 12px;
  font-size: 12px;
  color: var(--wc-muted);
}
.cell-json {
  margin: 0;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

<!-- 抽屉挂载到 body，需非 scoped 才能作用到 .el-drawer__body -->
<style>
.search-results-drawer.el-drawer {
  display: flex;
  flex-direction: column;
}

.search-results-drawer.el-drawer .el-drawer__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0 16px 16px;
  box-sizing: border-box;
}
</style>
