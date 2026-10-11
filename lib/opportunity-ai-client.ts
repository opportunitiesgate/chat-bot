import type { ErrorKey, Locale } from '@/lib/i18n'
import { type HistoryEntry, OPENING_MESSAGE_ID } from '@/lib/chat-history'
import { VoiceConversation, type VoiceHandlers } from '@/lib/voice-conversation'

export type SourceKind = 'page' | 'organization' | 'web' | 'site'

export interface SourceReference {
  id: string
  title: string
  section?: string
  url?: string
  /** Where the source comes from, when it is not OpportunitiesGate's stored opportunity text:
   * "page" a page the opportunity links to (apply page, organizer's website), "organization" the
   * organization's OpportunitiesGate record, "web" a web search result, "site" one of
   * OpportunitiesGate's own pages (about, contact, legal). */
  kind?: SourceKind
}

/** Another opportunity the RAG server suggests; opening it navigates the host page. */
export interface OpportunitySuggestion {
  opportunityId: string
  title: string
  slug: string
}

/** The OpportunitiesGate site, for links opened outside the host page's iframe. */
export const SITE_URL = 'https://opportunitiesgate.net'

/** The suggested opportunity's page on the OpportunitiesGate site, in the interface language. */
export function opportunityPageUrl(locale: Locale, slug: string): string {
  return `${SITE_URL}/${locale}/opportunities/${encodeURIComponent(slug)}`
}

/** A message to the OpportunitiesGate team drafted by the RAG server; sent only when the user clicks Send. */
export interface ContactAction {
  id: string
  label: string
  subject: string
  message: string
  language: string
  token: string
  expiresAt: string
}

/** What the user confirms: the action's token and their (possibly edited) subject and message. */
export interface ContactMessage {
  token: string
  subject: string
  message: string
  language: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  source: 'text' | 'voice'
  sources?: SourceReference[]
  suggestions?: OpportunitySuggestion[]
  actions?: ContactAction[]
}

export interface OpportunityAiClient {
  sendMessage(opportunityId: string, message: string, history?: HistoryEntry[]): Promise<ChatMessage>
  createVoiceConversation(opportunityId: string, handlers: VoiceHandlers): VoiceConversation
  sendContactMessage(opportunityId: string, contact: ContactMessage): Promise<void>
}

/** A failed text question, with a translatable reason. */
export class ChatRequestError extends Error {
  constructor(readonly key: ErrorKey) {
    super(key)
  }
}

/** `chatPath` replaces the opportunity chat route, e.g. /api/assistants/site/chat for a site assistant. */
export function createOpportunityAiClient(
  socketUrl: string,
  embedToken?: string,
  language?: Locale,
  chatPath?: string,
): OpportunityAiClient {
  const authHeaders: Record<string, string> = embedToken ? { 'X-Embed-Token': embedToken } : {}
  return {
    async sendMessage(opportunityId, message, history = []) {
      let response: Response
      try {
        response = await fetch(chatPath ?? `/api/opportunities/${encodeURIComponent(opportunityId)}/chat`, {
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
    async sendContactMessage(opportunityId, contact) {
      let response: Response
      try {
        response = await fetch(`/api/opportunities/${encodeURIComponent(opportunityId)}/actions/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(contact),
        })
      } catch {
        throw new ChatRequestError('unreachable')
      }
      if (response.ok) return
      const code = await response
        .json()
        .then((data: { code?: unknown }) => data?.code)
        .catch(() => undefined)
      throw new ChatRequestError(
        response.status === 401
          ? 'sessionExpired'
          : code === 'EXPIRED'
            ? 'contactExpired'
            : code === 'LIMIT'
              ? 'contactLimit'
              : code === 'NO_EMAIL'
                ? 'contactNoEmail'
                : 'contactFailed',
      )
    },
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
