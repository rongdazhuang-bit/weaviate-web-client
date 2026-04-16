<template>
  <div class="page page-objects" v-loading="loading">
    <div class="table-scroll">
      <el-table
        class="objects-data-table"
        :data="rows"
        size="small"
        border
        stripe
        height="100%"
        style="width: 100%"
        @row-click="onRowClick"
      >
        <!-- width 为列宽（px）；需配合 table-layout:fixed，见下方样式 -->
        <el-table-column prop="id" label="id" :width="400" show-overflow-tooltip />
        <el-table-column label="摘要" min-width="120">
          <template #default="{ row }">
            <span class="muted">{{ summarize(row.properties) }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <div class="pager">
      <el-button size="small" :disabled="!afterStack.length" @click="prevPage">上一页</el-button>
      <el-button size="small" :disabled="!canNext" @click="nextPage">下一页</el-button>
      <span class="hint">每页 {{ pageSize }} 条</span>
    </div>

    <el-drawer v-model="drawer" title="对象详情" size="50%">
      <template v-if="detail">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="id">{{ detail.id }}</el-descriptions-item>
          <el-descriptions-item label="class">{{ detail.class || '—' }}</el-descriptions-item>
          <el-descriptions-item label="向量">
            {{ detail.vector?.length ? `存在（${detail.vector.length} 维）` : '未包含或为空' }}
          </el-descriptions-item>
        </el-descriptions>
        <h4 class="h4">properties</h4>
        <pre class="json">{{ jsonProps }}</pre>
        <h4 v-if="detail.vector?.length" class="h4">向量前 16 维</h4>
        <pre v-if="detail.vector?.length" class="json">{{ vectorPreview }}</pre>
        <h4 class="h4">完整 JSON</h4>
        <pre class="json">{{ fullJson }}</pre>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getObjectById, listObjects, type WeaviateObject } from '@/api/weaviate'

const route = useRoute()
const loading = ref(false)
const rows = ref<WeaviateObject[]>([])
/** 当前页请求使用的 after 游标（首页为 undefined） */
const pageAfter = ref<string | undefined>(undefined)
/** 返回上一页所需的 after 历史栈 */
const afterStack = ref<(string | undefined)[]>([])
const pageSize = 20

const drawer = ref(false)
const detail = ref<WeaviateObject | null>(null)

const className = computed(() => decodeURIComponent(route.params.name as string))

const canNext = computed(() => rows.value.length >= pageSize)

const jsonProps = computed(() =>
  detail.value?.properties ? JSON.stringify(detail.value.properties, null, 2) : '',
)
const fullJson = computed(() =>
  detail.value ? JSON.stringify(detail.value, null, 2) : '',
)
const vectorPreview = computed(() => {
  const v = detail.value?.vector
  if (!v?.length) return ''
  return JSON.stringify(v.slice(0, 16), null, 2)
})

function summarize(props: Record<string, unknown> | undefined) {
  if (!props) return '—'
  const keys = Object.keys(props).slice(0, 3)
  const parts = keys.map((k) => `${k}: ${String(props[k]).slice(0, 80)}`)
  return parts.join('；') || '—'
}

async function loadPage(after?: string) {
  loading.value = true
  try {
    pageAfter.value = after
    const res = await listObjects(className.value, { limit: pageSize, after })
    rows.value = res.objects ?? []
  } finally {
    loading.value = false
  }
}

async function nextPage() {
  const objs = rows.value
  if (objs.length < pageSize) return
  const last = objs[objs.length - 1]?.id
  if (!last) return
  afterStack.value.push(pageAfter.value)
  await loadPage(last)
}

async function prevPage() {
  const prev = afterStack.value.pop()
  await loadPage(prev)
}

async function onRowClick(row: WeaviateObject) {
  if (!row.id) return
  drawer.value = true
  detail.value = null
  try {
    detail.value = await getObjectById(row.id, { includeVector: true })
  } catch {
    detail.value = row
  }
}

watch(
  () => route.params.name,
  async () => {
    afterStack.value = []
    await loadPage()
  },
)

onMounted(() => {
  afterStack.value = []
  loadPage()
})
</script>

<style scoped>
.page-objects {
  min-height: 0;
}

/*
 * 默认 table-layout:auto 会按内容撑列，仅给 td 设 max-width 往往不生效。
 * fixed + 列 width 后 id 列才会稳定为 400px，省略与 tooltip 由 show-overflow-tooltip 负责。
 */
.objects-data-table :deep(table) {
  table-layout: fixed;
  width: 100%;
}

.table-scroll {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.pager {
  flex-shrink: 0;
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.hint {
  font-size: 12px;
  color: var(--wc-muted);
}
.muted {
  font-size: 12px;
}
.h4 {
  margin: 12px 0 8px;
  font-size: 13px;
}
.json {
  margin: 0;
  padding: 12px;
  background: var(--wc-code-bg);
  color: var(--wc-text);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.45;
  overflow: auto;
  max-height: 320px;
  border: 1px solid var(--wc-border);
}
</style>
