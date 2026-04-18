import { defineStore } from 'pinia'
import { ref } from 'vue'
import { aggregateCount, fetchSchema } from '@/api/weaviate'
import { useConnectionStore } from '@/stores/connection'

export interface CollectionStatRow {
  name: string
  count: number | null
}

/** 概览页「集合统计」：异步拉取后按连接 URL 缓存于内存，退出登录时清空 */
export const useCollectionStatsStore = defineStore('collectionStats', () => {
  const rows = ref<CollectionStatRow[]>([])
  /** 缓存对应的连接地址，切换实例后自动失效 */
  const cachedForUrl = ref<string | null>(null)
  const lastUpdatedAt = ref<number | null>(null)
  const loading = ref(false)

  function reset() {
    rows.value = []
    cachedForUrl.value = null
    lastUpdatedAt.value = null
  }

  /**
   * @param force 为 true 时忽略缓存并重新统计
   */
  async function fetchStats(force = false) {
    const conn = useConnectionStore()
    const url = conn.connectionUrl
    if (!url?.trim()) {
      reset()
      return
    }
    if (!force && rows.value.length > 0 && cachedForUrl.value === url) {
      return
    }

    loading.value = true
    try {
      const classes = await fetchSchema()
      const pairs = await Promise.all(
        classes.map(async (c) => ({
          name: c.class,
          count: await aggregateCount(c.class),
        })),
      )
      pairs.sort((a, b) => a.name.localeCompare(b.name))
      rows.value = pairs
      cachedForUrl.value = url
      lastUpdatedAt.value = Date.now()
    } catch (e) {
      rows.value = []
      cachedForUrl.value = null
      lastUpdatedAt.value = null
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    rows,
    cachedForUrl,
    lastUpdatedAt,
    loading,
    fetchStats,
    reset,
  }
})
