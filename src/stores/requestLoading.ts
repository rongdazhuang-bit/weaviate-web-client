import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/**
 * 全局 API 请求进行中计数（axios Weaviate / 嵌入等），供全屏 v-loading 使用。
 */
export const useRequestLoadingStore = defineStore('requestLoading', () => {
  const pending = ref(0)
  const active = computed(() => pending.value > 0)

  function begin() {
    pending.value += 1
  }

  function end() {
    pending.value = Math.max(0, pending.value - 1)
  }

  return { pending, active, begin, end }
})
