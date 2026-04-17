import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { parseConnectionInput } from '@/utils/connectionUrl'

const REMEMBER_KEY = 'wc_remember_host'

/** 当前存储格式 */
export interface RememberedLogin {
  address: string
  apiKey: string
}

export const useConnectionStore = defineStore('connection', () => {
  const host = ref('')
  const port = ref(8080)
  const protocol = ref<'http' | 'https'>('http')
  const apiKey = ref('')
  /** 是否将连接地址与 API Key 写入本机浏览器 */
  const remember = ref(false)
  const connected = ref(false)

  /**
   * 开发：Vite 同域 /weaviate。
   * 生产：若构建时开启 VITE_USE_SAME_ORIGIN_WEAVIATE_PROXY（如 Docker+Nginx+Node），则同样走 /weaviate，由服务端 Node 转发。
   */
  const useSameOriginWeaviateProxy = computed(
    () =>
      import.meta.env.DEV ||
      import.meta.env.VITE_USE_SAME_ORIGIN_WEAVIATE_PROXY === 'true',
  )

  const connectionUrl = computed(() => {
    const h = host.value.trim()
    if (!h) return ''
    return `${protocol.value}://${h}:${port.value}`
  })

  const baseURL = computed(() => {
    if (useSameOriginWeaviateProxy.value) {
      return `${window.location.origin}/weaviate`
    }
    return connectionUrl.value
  })

  function loadRemembered() {
    try {
      const raw = localStorage.getItem(REMEMBER_KEY)
      if (!raw) return
      const p = JSON.parse(raw) as RememberedLogin & {
        host?: string
        port?: number
        protocol?: string
        useDevProxy?: boolean
      }

      if (typeof p.address === 'string' && p.address.trim()) {
        const parsed = parseConnectionInput(p.address)
        if (parsed) {
          host.value = parsed.host
          port.value = parsed.port
          protocol.value = parsed.protocol
          apiKey.value = typeof p.apiKey === 'string' ? p.apiKey : ''
          remember.value = true
          return
        }
      }

      if (typeof p.host === 'string' && p.host.trim()) {
        host.value = p.host
        port.value = typeof p.port === 'number' ? p.port : 8080
        protocol.value = p.protocol === 'https' ? 'https' : 'http'
        apiKey.value = ''
        remember.value = true
      }
    } catch {
      /* ignore */
    }
  }

  function saveRemembered() {
    if (!remember.value) {
      localStorage.removeItem(REMEMBER_KEY)
      return
    }
    const address = connectionUrl.value
    if (!address) return
    const payload: RememberedLogin = {
      address,
      apiKey: apiKey.value,
    }
    localStorage.setItem(REMEMBER_KEY, JSON.stringify(payload))
  }

  function applyAuthHeaders(headers: Record<string, string>) {
    const k = apiKey.value.trim()
    if (k) {
      headers['Authorization'] = k.startsWith('Bearer ') ? k : `Bearer ${k}`
    }
    if (useSameOriginWeaviateProxy.value && connectionUrl.value) {
      headers['X-Weaviate-Target'] = connectionUrl.value
    }
  }

  function disconnect() {
    connected.value = false
    apiKey.value = ''
  }

  return {
    host,
    port,
    protocol,
    apiKey,
    remember,
    connected,
    useSameOriginWeaviateProxy,
    connectionUrl,
    baseURL,
    loadRemembered,
    saveRemembered,
    applyAuthHeaders,
    disconnect,
  }
})
