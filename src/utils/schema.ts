import type { WeaviateClass } from '@/api/weaviate'

export function propertyNamesFromClass(cls: WeaviateClass | null | undefined): string[] {
  if (!cls?.properties?.length) return []
  return cls.properties.map((p) => p.name).filter(Boolean)
}
