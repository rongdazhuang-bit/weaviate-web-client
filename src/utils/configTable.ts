/** 将 Schema 中的配置对象展平为两列表格行（字段 / 值） */

export interface ConfigTableRow {
  key: string
  value: string
}

export function configObjectToRows(obj: unknown): ConfigTableRow[] {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return []
  return Object.entries(obj as Record<string, unknown>).map(([key, value]) => ({
    key,
    value: formatConfigValue(value),
  }))
}

function formatConfigValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return v
  return JSON.stringify(v, null, 2)
}
