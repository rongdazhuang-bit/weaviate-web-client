import axios, { type AxiosInstance } from 'axios'
import { useConnectionStore } from '@/stores/connection'

let weaviateClient: AxiosInstance | null = null

/**
 * 单例 + 每次请求从 Pinia 注入最新 baseURL / 头，避免登录后仍使用空 baseURL 的实例。
 */
export function createWeaviateAxios(): AxiosInstance {
  if (!weaviateClient) {
    weaviateClient = axios.create({
      timeout: 120_000,
      validateStatus: (s) => s >= 200 && s < 500,
    })
    weaviateClient.interceptors.request.use((config) => {
      const c = useConnectionStore()
      config.baseURL = c.baseURL
      const h: Record<string, string> = {}
      c.applyAuthHeaders(h)
      config.headers = config.headers ?? {}
      for (const [key, val] of Object.entries(h)) {
        const headers = config.headers as { set?: (k: string, v: string) => void } & Record<string, string>
        if (typeof headers.set === 'function') headers.set(key, val)
        else headers[key] = val
      }
      return config
    })
  }
  return weaviateClient
}
