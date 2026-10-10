import type { SourceReference } from '@/lib/opportunity-ai-client'

// A source as returned by the rag-getway backend (POST /chat and the voice WebSocket).
export interface RagSource {
  content: string
  metadata?: Record<string, unknown>
  score?: number
}

// Sources without a title are not shown: a bare "Source N" tells the user nothing.
export function toSourceReference(source: RagSource, index: number): SourceReference | undefined {
  const metadata = source.metadata ?? {}
  const text = (key: string) => (typeof metadata[key] === 'string' && metadata[key] ? (metadata[key] as string) : undefined)
  const title = text('title')
  if (!title) return undefined
  return {
    id: `source-${index + 1}`,
    title,
    section: text('section'),
    url: text('url'),
  }
}

export function toSourceReferences(value: unknown): SourceReference[] {
  if (!Array.isArray(value)) return []
  return (value as RagSource[])
    .map(toSourceReference)
    .filter((source): source is SourceReference => source !== undefined)
}
