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
  source?: 'text' | 'voice'
  sources?: SourceReference[]
}

export type VoiceSessionState =
  | 'idle'
  | 'connecting'
  | 'queued'
  | 'active'
  | 'closing'
  | 'closed'
  | 'timeout'
  | 'error'

export type VoiceEvent =
  | { type: 'session.queued'; position: number }
  | { type: 'session.started'; sessionId: string }
  | { type: 'session.queue_position'; position: number }
  | { type: 'session.timeout'; message?: string }
  | { type: 'error'; message: string }

export interface OpportunityAiClient {
  readonly socketUrl: string
  sendMessage(opportunityId: string, message: string): Promise<ChatMessage>
  getConversation(opportunityId: string): Promise<ChatMessage[]>
}

export function createOpportunityAiClient(apiUrl: string, _apiKey: string, socketUrl: string): OpportunityAiClient {
  const baseUrl = apiUrl.replace(/\/$/, '')
  return {
    socketUrl,
    async getConversation(opportunityId) {
      const response = await fetch(`/api/opportunities/${encodeURIComponent(opportunityId)}/conversation`)
      if (!response.ok) throw new Error(`Conversation request failed (${response.status})`)
      const data = await response.json()
      return Array.isArray(data) ? data : data.messages ?? []
    },
    async sendMessage(opportunityId, message) {
      const response = await fetch(`/api/opportunities/${encodeURIComponent(opportunityId)}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, apiUrl: baseUrl }),
      })
      if (!response.ok) throw new Error(`Message request failed (${response.status})`)
      return { ...(await response.json()), source: 'text' }
    },
  }
}

export function parseVoiceEvent(value: unknown): VoiceEvent | null {
  if (!value || typeof value !== 'object' || !('type' in value)) return null
  const event = value as Record<string, unknown>
  if (event.type === 'session.queued' && typeof event.position === 'number') return { type: event.type, position: event.position }
  if (event.type === 'session.started' && typeof event.sessionId === 'string') return { type: event.type, sessionId: event.sessionId }
  if (event.type === 'session.queue_position' && typeof event.position === 'number') return { type: event.type, position: event.position }
  if (event.type === 'session.timeout') return { type: event.type, message: typeof event.message === 'string' ? event.message : undefined }
  if (event.type === 'error' && typeof event.message === 'string') return { type: event.type, message: event.message }
  return null
}

export function createOpeningMessage(): ChatMessage {
  return {
    id: 'welcome',
    role: 'assistant',
    source: 'text',
    content: 'Hello. I\'m here to help you make sense of this opportunity. Ask me about eligibility, deadlines, funding, or the application process and I\'ll point you to the relevant details.',
    createdAt: new Date().toISOString(),
  }
}

export function createMockOpportunityAiClient(_apiUrl: string, socketUrl = ''): OpportunityAiClient {
  return {
    socketUrl,
    async getConversation() { return [createOpeningMessage()] },
    async sendMessage(_opportunityId, message) {
      return { id: `assistant-${Date.now()}`, role: 'assistant', source: 'text', content: `I can help you explore ${message}.`, createdAt: new Date().toISOString() }
    },
  }
}

export default createOpportunityAiClient
