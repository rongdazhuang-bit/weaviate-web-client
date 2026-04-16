<template>
  <div class="page page-cluster">
    <h2 class="title">集群与发现</h2>

    <section class="nodes-dashboard mt" aria-label="节点仪表盘">
      <div v-if="nodeList.length" class="nodes-grid">
        <el-card
          v-for="(n, idx) in nodeList"
          :key="`${n.name}-${idx}`"
          shadow="never"
          class="node-dash-card"
        >
          <dl class="node-dash-dl">
            <div class="node-dash-row">
              <dt>名称</dt>
              <dd class="wrap">{{ n.name }}</dd>
            </div>
            <div class="node-dash-row">
              <dt>模式</dt>
              <dd>{{ n.operationalMode }}</dd>
            </div>
            <div class="node-dash-row">
              <dt>状态</dt>
              <dd>
                <el-tag :type="statusTagType(n.status)" size="small">{{ n.status }}</el-tag>
              </dd>
            </div>
            <div class="node-dash-row">
              <dt>版本</dt>
              <dd class="mono">{{ n.version }}</dd>
            </div>
          </dl>
        </el-card>
      </div>
      <el-empty v-else description="暂无节点数据" />
    </section>

    <el-card shadow="never" class="meta-card meta-card--fill mt">
      <template #header>元信息（/v1/meta）</template>
      <div v-if="metaJson" class="meta-json-scroll">
        <pre class="json">{{ metaJson }}</pre>
      </div>
      <el-empty v-else description="暂无数据" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchMeta,
  fetchNodes,
  parseWeaviateNodesPayload,
  type WeaviateMeta,
} from '@/api/weaviate'

const nodes = ref<unknown | null>(null)
const meta = ref<WeaviateMeta | null>(null)

const nodeList = computed(() => parseWeaviateNodesPayload(nodes.value))

const metaJson = computed(() => (meta.value ? JSON.stringify(meta.value, null, 2) : ''))

function statusTagType(
  status: string,
): 'success' | 'warning' | 'danger' | 'info' {
  const u = status.toUpperCase()
  if (u === '—') return 'info'
  if (u.includes('HEALTHY') || u === 'OK' || u.includes('READY')) return 'success'
  if (u.includes('UNHEALTHY') || u.includes('FAILED') || u.includes('ERROR')) return 'danger'
  return 'warning'
}

async function load() {
  const [metaRes, nodesRes] = await Promise.allSettled([fetchMeta(), fetchNodes()])
  meta.value = metaRes.status === 'fulfilled' ? metaRes.value : null
  nodes.value = nodesRes.status === 'fulfilled' ? nodesRes.value : null
}

onMounted(() => {
  load()
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

.page-cluster {
  min-height: 0;
}

.page-cluster .title {
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

/* 占满主区域剩余高度，JSON 仅在框内滚动 */
.meta-card--fill {
  flex: 1;
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
