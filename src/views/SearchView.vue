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
              <el-form-item :label="t('search.limit')">
                <el-input-number v-model="limit" :min="1" :max="100" />
              </el-form-item>
              <el-form-item>
                <el-checkbox v-model="useNearText">{{ t('search.nearText') }}</el-checkbox>
              </el-form-item>
              <el-form-item>
                <el-button :loading="searching" @click="runSearch">{{ t('search.runSearch') }}</el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <el-card v-if="hits.length" class="search-results-card" shadow="never">
      <template #header>{{ t('search.results') }}</template>
      <div class="search-table-scroll">
        <el-table
          class="search-results-table"
          :data="hits"
          size="small"
          border
          height="100%"
        >
          <el-table-column prop="id" label="id" width="220" show-overflow-tooltip />
          <el-table-column :label="t('search.colDistance')">
            <template #default="{ row }">
              {{ row.distance ?? t('common.emDash') }} / {{ row.certainty ?? t('common.emDash') }}
            </template>
          </el-table-column>
          <el-table-column :label="t('search.colProps')">
            <template #default="{ row }">
              <pre class="cell-json">{{ JSON.stringify(row.properties, null, 2) }}</pre>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useEmbeddingStore } from '@/stores/embedding'
import { embedTextOpenAICompatible } from '@/api/embedding'
import { fetchClassSchema, fetchSchema, nearTextSearch, nearVectorSearch, type WeaviateClass } from '@/api/weaviate'
import { propertyNamesFromClass } from '@/utils/schema'

const { t } = useI18n()
const emb = useEmbeddingStore()
const testing = ref(false)
const searching = ref(false)
const classes = ref<WeaviateClass[]>([])
const className = ref('')
const queryText = ref('')
const limit = ref(10)
const useNearText = ref(false)
const hits = ref<
  {
    id?: string
    distance?: number
    certainty?: number
    properties: Record<string, unknown>
  }[]
>([])

async function loadClasses() {
  classes.value = await fetchSchema()
  if (!className.value && classes.value.length) className.value = classes.value[0].class
}

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
  searching.value = true
  hits.value = []
  try {
    const cls = await fetchClassSchema(className.value)
    const props = propertyNamesFromClass(cls)

    if (useNearText.value) {
      try {
        hits.value = await nearTextSearch(className.value, queryText.value.trim(), limit.value, props)
        return
      } catch (e: unknown) {
        ElMessage.warning(
          t('search.nearTextWarn', {
            msg: e instanceof Error ? e.message : 'unknown',
          }),
        )
      }
    }

    if (!emb.baseURL.trim() || !emb.model.trim() || !emb.apiKey.trim()) {
      ElMessage.error(t('search.needEmbed'))
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
  overflow: hidden;
}

.search-top {
  flex-shrink: 0;
}

.title {
  margin: 0 0 16px;
  font-size: 18px;
}

.search-results-card {
  flex: 1;
  min-height: 0;
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-results-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.search-table-scroll {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.search-results-table :deep(table) {
  table-layout: fixed;
  width: 100%;
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
