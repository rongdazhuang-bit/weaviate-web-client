import axios from 'axios'

/** 当前页为 HTTPS 且连接地址为 HTTP 时，浏览器会拦截（混合内容），与 CORS 无关 */
export function isMixedContentBlocked(connectionAddress: string): boolean {
  if (typeof window === 'undefined') return false
  if (window.location.protocol !== 'https:') return false
  const t = connectionAddress.trim().toLowerCase()
  return t.startsWith('http://')
}

/** 登录/连接 Weaviate 时的可读错误说明 */
export function describeConnectionError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const code = err.code
    const msg = (err.message || '').toLowerCase()

    if (code === 'ECONNABORTED' || msg.includes('timeout')) {
      return '请求超时，请检查网络或目标服务是否可达'
    }

    if (code === 'ERR_NETWORK' || err.message === 'Network Error') {
      return '无法连接到该地址，请确认 Weaviate 已启动，且地址、端口、协议正确。若控制台出现跨域相关报错，需在服务端配置 CORS，或将前端与 Weaviate 置于同域反向代理之后。'
    }

    const st = err.response?.status
    if (st === 401 || st === 403) {
      return '鉴权失败，请检查 API Key'
    }
    if (st && st >= 400) {
      const t = err.response?.data as { error?: string; message?: string } | undefined
      const detail =
        (typeof t === 'object' && t && 'error' in t && typeof t.error === 'string' && t.error) ||
        (typeof t === 'object' && t && 'message' in t && typeof t.message === 'string' && t.message) ||
        ''
      return detail ? `${detail}（HTTP ${st}）` : `请求失败（HTTP ${st}）`
    }

    if (err.message) return err.message
  }

  if (err instanceof Error) return err.message
  return '连接失败'
}
