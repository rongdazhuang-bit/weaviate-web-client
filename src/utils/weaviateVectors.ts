/**
 * 从 Weaviate REST 返回的对象中解析向量字段（兼容单向量、命名向量、嵌套 default）。
 */
export interface ExtractedVectors {
  vector?: number[]
  vectors?: Record<string, number[]>
}

export function extractVectorsFromWeaviateObject(obj: Record<string, unknown>): ExtractedVectors {
  const out: ExtractedVectors = {}
  const v = obj.vector
  const vs = obj.vectors

  if (Array.isArray(v) && v.length > 0) {
    out.vector = v as number[]
  } else if (v && typeof v === 'object' && !Array.isArray(v)) {
    const d = (v as { default?: unknown }).default
    if (Array.isArray(d) && d.length > 0) out.vector = d as number[]
  }

  if (vs && typeof vs === 'object' && !Array.isArray(vs)) {
    const entries: Record<string, number[]> = {}
    for (const [k, val] of Object.entries(vs as Record<string, unknown>)) {
      if (Array.isArray(val) && (val as unknown[]).length > 0) {
        entries[k] = val as number[]
      }
    }
    if (Object.keys(entries).length > 0) out.vectors = entries
  }

  return out
}

export function hasVectorPayload(extracted: ExtractedVectors): boolean {
  if (extracted.vector && extracted.vector.length > 0) return true
  if (extracted.vectors && Object.keys(extracted.vectors).length > 0) return true
  return false
}
