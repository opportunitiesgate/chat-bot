import type { SourceReference } from '@/lib/opportunity-ai-client'

// A source as returned by the rag-getway backend (POST /chat and the voice WebSocket).
export interface RagSource {
  content: string
  metadata?: Record<string, unknown>
  score?: number
}

export function toSourceReference(source: RagSource, index: number): SourceReference {
  const metadata = source.metadata ?? {}
  const text = (key: string) => (typeof metadata[key] === 'string' && metadata[key] ? (metadata[key] as string) : undefined)
  return {
    id: `source-${index + 1}`,
    title: text('title') ?? `Source ${index + 1}`,
    section: text('section'),
    url: text('url'),
  }
}

export function toSourceReferences(value: unknown): SourceReference[] {
  return Array.isArray(value) ? (value as RagSource[]).map(toSourceReference) : []
}
