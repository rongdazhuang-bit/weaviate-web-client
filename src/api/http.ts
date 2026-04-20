import axios, { type AxiosInstance } from 'axios'
import { useConnectionStore } from '@/stores/connection'
import { useRequestLoadingStore } from '@/stores/requestLoading'

let weaviateClient: AxiosInstance | null = null

/**
 * Weaviate 专用 Axios：baseURL 为同域 `/weaviate`（connection store），并注入 `Authorization` + `X-Weaviate-Target`。
 * 单例 + 每次请求从 Pinia 取最新配置。
 */
export function createWeaviateAxios(): AxiosInstance {
  if (!weaviateClient) {
    weaviateClient = axios.create({
      timeout: 120_000,
      validateStatus: (s) => s >= 200 && s < 500,
    })
    weaviateClient.interceptors.request.use(
      (config) => {
        useRequestLoadingStore().begin()
        try {
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
        } catch (e) {
          useRequestLoadingStore().end()
          throw e
        }
      },
      (err) => {
        useRequestLoadingStore().end()
        return Promise.reject(err)
      },
    )
    weaviateClient.interceptors.response.use(
      (res) => {
        useRequestLoadingStore().end()
        return res
      },
      (err) => {
        useRequestLoadingStore().end()
        return Promise.reject(err)
      },
    )
  }
  return weaviateClient
}
