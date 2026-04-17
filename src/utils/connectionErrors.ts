import axios from 'axios'
import { i18n } from '@/i18n'

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
