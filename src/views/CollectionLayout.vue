<template>
  <div class="collection-layout">
    <el-tabs
      :model-value="activeTab"
      class="collection-tabs"
      @tab-change="onTabChange"
    >
      <el-tab-pane label="概览" name="overview" />
      <el-tab-pane label="对象" name="objects" />
      <el-tab-pane label="文件夹" name="folders" />
    </el-tabs>
    <div
      class="collection-tab-content"
      :class="{ 'collection-tab-content--fill': isObjectsRoute }"
    >
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const activeTab = computed(() => {
  if (route.name === 'collection-folders') return 'folders'
  if (route.name === 'collection-objects') return 'objects'
  return 'overview'
})

const isObjectsRoute = computed(() => route.name === 'collection-objects')

function onTabChange(name: string | number) {
  const raw = route.params.name as string
  const base = `/app/collections/${raw}`
  const n = String(name)
  if (n === 'overview') router.push(base)
  else if (n === 'folders') router.push(`${base}/folders`)
  else router.push(`${base}/objects`)
}
</script>

<style scoped>
.collection-layout {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.collection-tabs {
  flex-shrink: 0;
}

.collection-tabs :deep(.el-tabs__content) {
  display: none;
}

.collection-tab-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.collection-tab-content--fill {
  overflow: hidden;
}

.collection-tab-content--fill > :deep(*) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
