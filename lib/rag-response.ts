import type { ChatMessage } from '@/lib/opportunity-ai-client'
import { type RagSource, toContactActions, toSourceReferences, toSuggestions } from '@/lib/rag-sources'

// Response of the rag-getway chat routes (POST /v1/<assistant>/chat), shared by the API routes.
export interface RagChatResponse {
  answer: string
  sources?: RagSource[]
  suggestions?: unknown
  actions?: unknown
}

export function isRagChatResponse(value: unknown): value is RagChatResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.answer === 'string' && (candidate.sources === undefined || Array.isArray(candidate.sources))
}

export function toAssistantMessage(data: RagChatResponse): ChatMessage {
  return {
    id: `assistant-${crypto.randomUUID()}`,
    role: 'assistant',
    content: data.answer,
    createdAt: new Date().toISOString(),
    source: 'text',
    sources: toSourceReferences(data.sources),
    suggestions: toSuggestions(data.suggestions),
    actions: toContactActions(data.actions),
  }
}

// The backend returns { detail: string } for its own errors and { detail: [...] } for validation errors.
export function gatewayErrorMessage(status: number, data: unknown): string {
  if (status === 429) return 'Too many questions in a short time. Please wait a moment and try again.'
  if (status === 401 || status === 403) return 'The assistant is not configured correctly.'
  if (status === 422) return 'The question could not be processed.'
  const detail = data && typeof data === 'object' ? (data as Record<string, unknown>).detail : undefined
  return typeof detail === 'string' ? detail : 'The assistant could not answer right now.'
}
