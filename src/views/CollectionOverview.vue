<template>
  <div class="page" v-loading="loading">
    <el-card shadow="never">
      <template #header>
        <span>Schema 与统计</span>
        <el-tag v-if="count !== null" class="ml" type="info">对象数：{{ count }}</el-tag>
        <el-tag v-else class="ml" type="warning">对象数：不可用</el-tag>
        <el-button size="small" class="ml wc-overview-refresh" @click="load">刷新</el-button>
      </template>
      <el-descriptions
        v-if="cls"
        class="collection-schema-descriptions"
        :column="1"
        border
        size="small"
      >
        <el-descriptions-item label="描述">{{ cls.description || '—' }}</el-descriptions-item>
        <el-descriptions-item label="vectorizer">{{ cls.vectorizer || '—' }}</el-descriptions-item>
        <el-descriptions-item label="vectorIndexType">{{ cls.vectorIndexType || '—' }}</el-descriptions-item>
        <el-descriptions-item label="多租户">
          {{ cls.multiTenancyConfig?.enabled ? '是' : '否' }}
        </el-descriptions-item>
      </el-descriptions>
      <el-empty v-else description="无法加载 Schema" />
      <el-divider />
      <h4 class="h4">属性定义</h4>
      <el-table v-if="cls?.properties?.length" :data="cls.properties" size="small" border stripe>
        <el-table-column prop="name" label="名称" min-width="200" width="240" show-overflow-tooltip />
        <el-table-column label="类型" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">{{ row.dataType?.join?.(', ') || row.dataType }}</template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="280" show-overflow-tooltip />
      </el-table>
      <el-empty v-else description="无属性" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { aggregateCount, fetchClassSchema, type WeaviateClass } from '@/api/weaviate'

const route = useRoute()
const loading = ref(false)
const cls = ref<WeaviateClass | null>(null)
const count = ref<number | null>(null)

const className = computed(() => decodeURIComponent(route.params.name as string))

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
