<template>
  <div class="page page-objects">
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
        <el-table-column :label="t('objects.summary')" min-width="120">
          <template #default="{ row }">
            <span class="muted">{{ summarize(row.properties) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('objects.created')" :width="178" show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatUnixTime(row.creationTimeUnix) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('objects.updated')" :width="178" show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatUnixTime(row.lastUpdateTimeUnix) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('objects.actions')" :width="88" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="danger"
              size="small"
              :loading="deletingId === row.id"
              :disabled="!row.id || deletingId !== null"
              @click.stop="onDeleteClick(row)"
            >
              {{ t('objects.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <div class="pager">
      <el-button size="small" :disabled="!afterStack.length" @click="prevPage">{{ t('objects.prev') }}</el-button>
      <el-button size="small" :disabled="!canNext" @click="nextPage">{{ t('objects.next') }}</el-button>
      <span class="hint">{{ t('objects.perPage', { n: pageSize }) }}</span>
    </div>

    <el-drawer
      v-model="drawer"
      class="object-detail-drawer"
      :title="t('objects.drawerTitle')"
      size="50%"
      append-to-body
    >
      <template v-if="detail">
        <div class="object-detail-toolbar">
          <el-button
            v-if="detail.id"
            size="small"
            :loading="deletingId === detail.id"
            :disabled="deletingId !== null"
            @click="onDeleteFromDetail"
          >
            {{ t('objects.delete') }}
          </el-button>
        </div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="id">{{ detail.id }}</el-descriptions-item>
          <el-descriptions-item :label="t('objects.class')">{{ detail.class || t('common.emDash') }}</el-descriptions-item>
          <el-descriptions-item :label="t('objects.created')">{{ formatUnixTime(detail.creationTimeUnix) }}</el-descriptions-item>
          <el-descriptions-item :label="t('objects.updated')">{{ formatUnixTime(detail.lastUpdateTimeUnix) }}</el-descriptions-item>
          <el-descriptions-item :label="t('objects.vector')" :span="2">
            {{
              detail.vector?.length
                ? t('objects.vectorPresent', { n: detail.vector.length })
                : t('objects.vectorMissing')
            }}
          </el-descriptions-item>
        </el-descriptions>
        <h4 class="h4">{{ t('objects.propsTitle') }}</h4>
        <pre class="json">{{ jsonProps }}</pre>
        <h4 v-if="detail.vector?.length" class="h4">{{ t('objects.vectorPreview') }}</h4>
        <pre v-if="detail.vector?.length" class="json">{{ vectorPreview }}</pre>
        <h4 class="h4">{{ t('objects.fullJson') }}</h4>
        <pre class="json">{{ fullJson }}</pre>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deleteObjectById, getObjectById, listObjects, type WeaviateObject } from '@/api/weaviate'
import { formatUnixTime } from '@/utils/dateTime'

const { t } = useI18n()
const route = useRoute()
const rows = ref<WeaviateObject[]>([])
/** 当前页请求使用的 after 游标（首页为 undefined） */
const pageAfter = ref<string | undefined>(undefined)
/** 返回上一页所需的 after 历史栈 */
const afterStack = ref<(string | undefined)[]>([])
const pageSize = 20

const drawer = ref(false)
const detail = ref<WeaviateObject | null>(null)
/** 正在删除的对象 id；非空时禁用其它删除按钮 */
const deletingId = ref<string | null>(null)

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
  if (!props) return t('common.emDash')
  const keys = Object.keys(props).slice(0, 3)
  const parts = keys.map((k) => `${k}: ${String(props[k]).slice(0, 80)}`)
  return parts.join('；') || t('common.emDash')
}

async function loadPage(after?: string) {
  pageAfter.value = after
  const res = await listObjects(className.value, { limit: pageSize, after })
  rows.value = res.objects ?? []
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

async function confirmAndDeleteObject(id: string) {
  try {
    await ElMessageBox.confirm(t('objects.deleteConfirmMsg', { id }), t('objects.deleteConfirmTitle'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
      customClass: 'wc-objects-delete-msgbox',
      customStyle: { backgroundColor: 'var(--wc-surface)' },
      appendTo: document.body,
      modalClass: 'wc-objects-delete-msgbox-overlay',
    })
  } catch {
    return
  }
  deletingId.value = id
  try {
    await deleteObjectById(className.value, id)
    ElMessage.success(t('objects.deleteOk'))
    if (detail.value?.id === id) {
      drawer.value = false
      detail.value = null
    }
    await loadPage(pageAfter.value)
    if (rows.value.length === 0 && afterStack.value.length > 0) {
      const prev = afterStack.value.pop()
      await loadPage(prev)
    }
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : t('objects.deleteFail'))
  } finally {
    deletingId.value = null
  }
}

function onDeleteClick(row: WeaviateObject) {
  const id = row.id
  if (!id) return
  void confirmAndDeleteObject(id)
}

function onDeleteFromDetail() {
  const id = detail.value?.id
  if (!id) return
  void confirmAndDeleteObject(id)
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

.object-detail-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
</style>

<style>
/* 抽屉挂 body，需非 scoped；收紧标题栏与首行（删除按钮）间距 */
.object-detail-drawer.el-drawer .el-drawer__body {
  padding-top: 6px;
}
</style>
