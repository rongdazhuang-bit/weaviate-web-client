import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useEmbeddingStore = defineStore('embedding', () => {
  const baseURL = ref('https://api.openai.com/v1')
  const apiKey = ref('')
  const model = ref('text-embedding-3-small')
  const dimensions = ref<number | null>(null)

  return {
    baseURL,
    apiKey,
    model,
    dimensions,
  }
})
