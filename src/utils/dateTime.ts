function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 全站统一日期时间：`2026/3/18 01:07:53`（月日不补零，时分秒两位）
 */
export function formatWcDateTime(input: Date | number): string {
  const d = typeof input === 'number' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return '—'
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${y}/${m}/${day} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

/** Weaviate REST 返回 Unix 秒；若误传毫秒则兼容 */
export function formatUnixTime(ts: number | undefined): string {
  if (ts == null || !Number.isFinite(ts)) return '—'
  const sec = ts > 1e12 ? ts / 1000 : ts
  const d = new Date(sec * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  return formatWcDateTime(d)
}
