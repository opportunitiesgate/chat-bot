import type { ContactAction, OpportunitySuggestion, SourceReference } from '@/lib/opportunity-ai-client'

// A source as returned by the rag-getway backend (POST /v1/opportunity/chat and the voice WebSocket).
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
    ...(metadata.type === 'web' ? { kind: 'web' as const } : {}),
  }
}

export function toSourceReferences(value: unknown): SourceReference[] {
  if (!Array.isArray(value)) return []
  return (value as RagSource[])
    .map(toSourceReference)
    .filter((source): source is SourceReference => source !== undefined)
}

const MAX_SUGGESTIONS = 3
// Slugs become part of the host page's URL: only lowercase letters, digits and dashes.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Suggestions from the RAG server (POST /v1/opportunity/chat and the voice WebSocket), validated. */
export function toSuggestions(value: unknown): OpportunitySuggestion[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (item): item is OpportunitySuggestion & { type: string } =>
        !!item &&
        typeof item === 'object' &&
        item.type === 'opportunity' &&
        typeof item.opportunityId === 'string' &&
        typeof item.title === 'string' &&
        item.title.trim() !== '' &&
        typeof item.slug === 'string' &&
        SLUG.test(item.slug),
    )
    .slice(0, MAX_SUGGESTIONS)
    .map(({ opportunityId, title, slug }) => ({ opportunityId, title: title.trim(), slug }))
}

const text = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''

/** Messages to the team drafted by the RAG server (chat and voice), validated; anything else is dropped. */
export function toContactActions(value: unknown): ContactAction[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): ContactAction[] => {
    if (!item || typeof item !== 'object' || item.type !== 'send_contact_message') return []
    const { id, label, token, expiresAt, preview } = item as Record<string, unknown>
    const { subject, message, language } = (preview && typeof preview === 'object' ? preview : {}) as Record<string, unknown>
    if (!text(id) || !text(label) || !text(token) || !text(expiresAt) || !text(message)) return []
    return [
      {
        id,
        label,
        token,
        expiresAt,
        subject: text(subject) ? subject : '',
        message,
        language: text(language) ? language : 'en',
      },
    ]
  })
}
