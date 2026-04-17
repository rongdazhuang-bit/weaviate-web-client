<template>
  <div class="page">
    <el-card shadow="never">
      <el-form inline size="small" class="form">
        <el-form-item :label="t('folders.pathField')">
          <el-select v-model="pathField" :placeholder="t('folders.selectProp')" style="width: 220px" filterable>
            <el-option v-for="p in propNames" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button @click="buildTree" :loading="scanning">{{ t('folders.scanTree') }}</el-button>
        </el-form-item>
      </el-form>
      <el-tree v-if="treeData.length" :data="treeData" :props="treeProps" default-expand-all />
      <el-empty v-else :description="t('folders.emptyHint')" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { fetchClassSchema, listObjects, type WeaviateClass } from '@/api/weaviate'
import { propertyNamesFromClass } from '@/utils/schema'

interface TreeNode {
  label: string
  children?: TreeNode[]
}

const { t } = useI18n()
const route = useRoute()
const scanning = ref(false)
const cls = ref<WeaviateClass | null>(null)
const pathField = ref('')
const treeData = ref<TreeNode[]>([])
const pageSize = 100
const maxPages = 10

const treeProps = { label: 'label', children: 'children' }

const className = computed(() => decodeURIComponent(route.params.name as string))
const propNames = computed(() => propertyNamesFromClass(cls.value))

async function loadSchema() {
  cls.value = await fetchClassSchema(className.value)
  const names = propNames.value
  if (names.length && !pathField.value) {
    pathField.value = names.find((n) => /path|dir|folder|file/i.test(n)) || names[0] || ''
  }
}

type TNode = { name: string; children: Map<string, TNode> }

function addSegments(root: Map<string, TNode>, segments: string[]) {
  if (!segments.length) return
  const [head, ...tail] = segments
  if (!root.has(head)) root.set(head, { name: head, children: new Map() })
  const node = root.get(head)!
  addSegments(node.children, tail)
}

function toElTree(m: Map<string, TNode>): TreeNode[] {
  return Array.from(m.values()).map((n) => ({
    label: n.name,
    children: n.children.size ? toElTree(n.children) : undefined,
  }))
}

async function buildTree() {
  const field = pathField.value.trim()
  if (!field) return
  scanning.value = true
  try {
    const roots = new Map<string, TNode>()
    let after: string | undefined
    for (let page = 0; page < maxPages; page++) {
      const res = await listObjects(className.value, { limit: pageSize, after })
      const objs = res.objects ?? []
      if (!objs.length) break
      for (const o of objs) {
        const props = o.properties ?? {}
        const raw = props[field]
        const s = raw === undefined || raw === null ? '' : String(raw)
        const segments = s.split('/').filter(Boolean)
        if (!segments.length) {
          const emptyLabel = t('folders.emptyPath')
          if (!roots.has(emptyLabel)) roots.set(emptyLabel, { name: emptyLabel, children: new Map() })
          continue
        }
        addSegments(roots, segments)
      }
      after = objs[objs.length - 1]?.id
      if (!after || objs.length < pageSize) break
    }
    treeData.value = toElTree(roots)
  } finally {
    scanning.value = false
  }
}

watch(
  () => route.params.name,
  async () => {
    treeData.value = []
    await loadSchema()
  },
)

onMounted(async () => {
  await loadSchema()
})
</script>

<style scoped>
.form {
  margin-bottom: 8px;
}
</style>
