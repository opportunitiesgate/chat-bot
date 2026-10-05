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

export type VoiceSessionState = 'idle' | 'connecting' | 'queued' | 'active' | 'closing' | 'closed' | 'timeout' | 'error'

export type VoiceEvent =
  | { type: 'session.queued'; position: number }
  | { type: 'session.started'; sessionId: string }
  | { type: 'session.queue_position'; position: number }
  | { type: 'session.timeout'; message?: string }
  | { type: 'error'; message: string }

export interface VoiceTransport {
  connect(opportunityId: string, handlers: { onEvent: (event: VoiceEvent) => void; onClose: () => void; onError: () => void }): void
  sendSessionEnd(): void
  close(): void
}

export interface OpportunityAiClient {
  sendMessage(opportunityId: string, message: string): Promise<ChatMessage>
  getConversation(opportunityId: string): Promise<ChatMessage[]>
  createVoiceTransport(): VoiceTransport
}

export function createOpportunityAiClient(apiUrl: string, socketUrl: string): OpportunityAiClient {
  const voiceTransport = () => new BrowserVoiceTransport(socketUrl)
  return {
    async getConversation(opportunityId) {
      const response = await fetch(`/api/opportunities/${encodeURIComponent(opportunityId)}/conversation`)
      if (!response.ok) throw new Error(`Conversation request failed (${response.status})`)
      const data = await response.json()
      return (Array.isArray(data) ? data : data.messages ?? []).map((message: ChatMessage) => ({ ...message, source: message.source ?? 'text' }))
    },
    async sendMessage(opportunityId, message) {
      const response = await fetch(`/api/opportunities/${encodeURIComponent(opportunityId)}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) })
      if (!response.ok) throw new Error(`Message request failed (${response.status})`)
      return { ...(await response.json()), source: 'text' }
    },
    createVoiceTransport: voiceTransport,
  }
}

class BrowserVoiceTransport implements VoiceTransport {
  private socket: WebSocket | null = null
  constructor(private readonly socketUrl: string) {}

  connect(opportunityId: string, handlers: { onEvent: (event: VoiceEvent) => void; onClose: () => void; onError: () => void }) {
    this.close()
    this.socket = new WebSocket(this.socketUrl)
    this.socket.onopen = () => this.socket?.send(JSON.stringify({ type: 'session.start', opportunityId }))
    this.socket.onmessage = (event) => {
      try {
        const parsed = parseVoiceEvent(JSON.parse(event.data))
        if (parsed) handlers.onEvent(parsed)
      } catch { handlers.onError() }
    }
    this.socket.onerror = handlers.onError
    this.socket.onclose = handlers.onClose
  }

  sendSessionEnd() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'session.end' }))
  }

  close() {
    this.socket?.close()
    this.socket = null
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
  return { id: 'welcome', role: 'assistant', source: 'text', content: "Hello. I'm here to help you make sense of this opportunity. Ask me about eligibility, deadlines, funding, or the application process and I'll point you to the relevant details.", createdAt: new Date().toISOString() }
}

export default createOpportunityAiClient
