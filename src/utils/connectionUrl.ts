/**
 * 从「连接地址」解析 host / port / protocol（协议一律来自输入：含 scheme 则按 URL；无 scheme 视为 http）。
 * - 带 `http://` 或 `https://`：按 URL 解析；省略端口时用 80（http）或 443（https）。
 * - 不带 scheme：按 `host` 或 `host:port` 解析；省略端口时默认 8080；协议固定为 **http**。
 */
export function parseConnectionInput(input: string): {
  host: string
  port: number
  protocol: 'http' | 'https'
} | null {
  const t = input.trim()
  if (!t) return null

  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t)
      const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80
      return {
        host: u.hostname,
        port,
        protocol: u.protocol === 'https:' ? 'https' : 'http',
      }
    } catch {
      return null
    }
  }

  try {
    const u = new URL(`http://${t.replace(/^\/+/, '')}`)
    const port = u.port ? Number(u.port) : 8080
    return {
      host: u.hostname,
      port,
      protocol: 'http',
    }
  } catch {
    return null
  }
}
