import type { ErrorKey, Locale } from '@/lib/i18n'
import { type HistoryEntry, OPENING_MESSAGE_ID } from '@/lib/chat-history'
import { VoiceConversation, type VoiceHandlers } from '@/lib/voice-conversation'

export interface SourceReference {
  id: string
  title: string
  section?: string
  url?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  source: 'text' | 'voice'
  sources?: SourceReference[]
}

export interface OpportunityAiClient {
  sendMessage(opportunityId: string, message: string, history?: HistoryEntry[]): Promise<ChatMessage>
  createVoiceConversation(opportunityId: string, handlers: VoiceHandlers): VoiceConversation
}

/** A failed text question, with a translatable reason. */
export class ChatRequestError extends Error {
  constructor(readonly key: ErrorKey) {
    super(key)
  }
}

export function createOpportunityAiClient(socketUrl: string, embedToken?: string, language?: Locale): OpportunityAiClient {
  const authHeaders: Record<string, string> = embedToken ? { 'X-Embed-Token': embedToken } : {}
  return {
    async sendMessage(opportunityId, message, history = []) {
      let response: Response
      try {
        response = await fetch(`/api/opportunities/${encodeURIComponent(opportunityId)}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          // The interface language: the answer uses it only when the question's language is unclear.
          body: JSON.stringify({ message, language, history }),
        })
      } catch {
        throw new ChatRequestError('unreachable')
      }
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new ChatRequestError(response.status === 429 ? 'rateLimited' : response.status === 401 ? 'sessionExpired' : 'generic')
      }
      if (!isChatMessage(data)) throw new ChatRequestError('generic')
      return { ...data, source: 'text' }
    },
    createVoiceConversation: (opportunityId, handlers) =>
      new VoiceConversation(socketUrl, opportunityId, handlers, authHeaders, language),
  }
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  return typeof message.id === 'string' && message.role === 'assistant' && typeof message.content === 'string'
}

/** Every conversation starts with this message; it is not part of the history sent to the AI server. */
export function createOpeningMessage(content: string): ChatMessage {
  return { id: OPENING_MESSAGE_ID, role: 'assistant', source: 'text', content, createdAt: new Date().toISOString() }
}

export default createOpportunityAiClient
