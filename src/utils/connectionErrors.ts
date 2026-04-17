import axios from 'axios'
import { i18n } from '@/i18n'

/** 按运行环境选择 .env 中的覆盖文案：development > production > 通用，均未设置则走 i18n */
function networkConnectionMessageOverride(): string | undefined {
  if (import.meta.env.DEV) {
    const d = import.meta.env.VITE_CONNECTION_NETWORK_MESSAGE_DEVELOPMENT?.trim()
    if (d) return d
  }
  if (import.meta.env.PROD) {
    const p = import.meta.env.VITE_CONNECTION_NETWORK_MESSAGE_PRODUCTION?.trim()
    if (p) return p
  }
  const common = import.meta.env.VITE_CONNECTION_NETWORK_MESSAGE?.trim()
  return common || undefined
}

/** 当前页为 HTTPS 且连接地址为 HTTP 时，浏览器会拦截（混合内容），与 CORS 无关 */
export function isMixedContentBlocked(connectionAddress: string): boolean {
  if (typeof window === 'undefined') return false
  if (window.location.protocol !== 'https:') return false
  const t = connectionAddress.trim().toLowerCase()
  return t.startsWith('http://')
}

/** 登录/连接 Weaviate 时的可读错误说明 */
export function describeConnectionError(err: unknown): string {
  const t = i18n.global.t
  if (axios.isAxiosError(err)) {
    const code = err.code
    const msg = (err.message || '').toLowerCase()

    if (code === 'ECONNABORTED' || msg.includes('timeout')) {
      return t('errors.connection.timeout')
    }

    if (code === 'ERR_NETWORK' || err.message === 'Network Error') {
      const custom = networkConnectionMessageOverride()
      if (custom) return custom
      return t('errors.connection.network')
    }

    const st = err.response?.status
    if (st === 401 || st === 403) {
      return t('errors.connection.auth')
    }
    if (st && st >= 400) {
      const body = err.response?.data as { error?: string; message?: string } | undefined
      const detail =
        (typeof body === 'object' && body && 'error' in body && typeof body.error === 'string' && body.error) ||
        (typeof body === 'object' && body && 'message' in body && typeof body.message === 'string' && body.message) ||
        ''
      return detail
        ? t('errors.connection.httpDetail', { detail, status: st })
        : t('errors.connection.httpFail', { status: st })
    }

    if (err.message) return err.message
  }

  if (err instanceof Error) return err.message
  return t('errors.connection.failed')
}
