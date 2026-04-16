<template>
  <div class="page search-page" v-loading="loading">
    <div class="search-top">
      <h2 class="title">向量检索</h2>
      <el-row :gutter="16">
        <el-col :span="10">
          <el-card shadow="never">
            <template #header>嵌入服务（OpenAI 兼容）</template>
            <el-form label-position="top" size="small">
              <el-form-item label="Base URL">
                <el-input v-model="emb.baseURL" placeholder="https://api.openai.com/v1" />
              </el-form-item>
              <el-form-item label="Model">
                <el-input v-model="emb.model" placeholder="text-embedding-3-small" />
              </el-form-item>
              <el-form-item label="API Key">
                <el-input v-model="emb.apiKey" type="password" show-password placeholder="浏览器直连可能受 CORS 限制" />
              </el-form-item>
              <el-form-item>
                <el-button @click="testEmbed" :loading="testing">测试嵌入</el-button>
                <span v-if="emb.dimensions" class="dim">已测维度：{{ emb.dimensions }}</span>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>
        <el-col :span="14">
          <el-card shadow="never">
            <template #header>查询</template>
            <el-form label-position="top" size="small">
              <el-form-item label="目标集合">
                <el-select v-model="className" filterable placeholder="选择集合" style="width: 100%">
                  <el-option v-for="c in classes" :key="c.class" :label="c.class" :value="c.class" />
                </el-select>
              </el-form-item>
              <el-form-item label="查询文本">
                <el-input v-model="queryText" type="textarea" :rows="4" placeholder="输入自然语言查询" />
              </el-form-item>
              <el-form-item label="返回条数">
                <el-input-number v-model="limit" :min="1" :max="100" />
              </el-form-item>
              <el-form-item>
                <el-checkbox v-model="useNearText">尝试 nearText（需 Weaviate 内置 text2vec 等模块）</el-checkbox>
              </el-form-item>
              <el-form-item>
                <el-button :loading="searching" @click="runSearch">检索</el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <el-card v-if="hits.length" class="search-results-card" shadow="never">
      <template #header>结果</template>
      <div class="search-table-scroll">
        <el-table
          class="search-results-table"
          :data="hits"
          size="small"
          border
          height="100%"
        >
          <el-table-column prop="id" label="id" width="220" show-overflow-tooltip />
          <el-table-column label="distance / certainty">
            <template #default="{ row }">
              {{ row.distance ?? '—' }} / {{ row.certainty ?? '—' }}
            </template>
          </el-table-column>
          <el-table-column label="properties">
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
import { ElMessage } from 'element-plus'
import { useEmbeddingStore } from '@/stores/embedding'
import { embedTextOpenAICompatible } from '@/api/embedding'
import { fetchClassSchema, fetchSchema, nearTextSearch, nearVectorSearch, type WeaviateClass } from '@/api/weaviate'
import { propertyNamesFromClass } from '@/utils/schema'

const emb = useEmbeddingStore()
const loading = ref(false)
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
  loading.value = true
  try {
    classes.value = await fetchSchema()
    if (!className.value && classes.value.length) className.value = classes.value[0].class
  } finally {
    loading.value = false
  }
}

async function testEmbed() {
  if (!emb.baseURL.trim() || !emb.model.trim() || !emb.apiKey.trim()) {
    ElMessage.warning('请填写 Base URL、Model、API Key')
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
    ElMessage.success(`嵌入成功，耗时 ${r.latencyMs} ms，维度 ${r.dimensions}`)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '嵌入失败'
    ElMessage.error(msg)
  } finally {
    testing.value = false
  }
}

async function runSearch() {
  if (!className.value) {
    ElMessage.warning('请选择集合')
    return
  }
  if (!queryText.value.trim()) {
    ElMessage.warning('请输入查询文本')
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
          `nearText 失败：${e instanceof Error ? e.message : 'unknown'}；将回退到嵌入 + nearVector`,
        )
      }
    }

    if (!emb.baseURL.trim() || !emb.model.trim() || !emb.apiKey.trim()) {
      ElMessage.error('请配置嵌入服务以使用 nearVector')
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
    ElMessage.error(e instanceof Error ? e.message : '检索失败')
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
