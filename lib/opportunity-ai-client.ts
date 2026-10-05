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
  sendMessage(opportunityId: string, message: string): Promise<ChatMessage>
  getConversation(opportunityId: string): Promise<ChatMessage[]>
  createVoiceConversation(opportunityId: string, handlers: VoiceHandlers): VoiceConversation
}

export function createOpportunityAiClient(socketUrl: string): OpportunityAiClient {
  return {
    // The AI server keeps no conversation history, so a conversation starts with the opening message.
    async getConversation() {
      return [createOpeningMessage()]
    },
    async sendMessage(opportunityId, message) {
      const response = await fetch(`/api/opportunities/${encodeURIComponent(opportunityId)}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Message request failed (${response.status})`)
      if (!isChatMessage(data)) throw new Error('The assistant returned an invalid response.')
      return { ...data, source: 'text' }
    },
    createVoiceConversation: (opportunityId, handlers) => new VoiceConversation(socketUrl, opportunityId, handlers),
  }
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  return typeof message.id === 'string' && message.role === 'assistant' && typeof message.content === 'string'
}

export function createOpeningMessage(): ChatMessage {
  return { id: 'welcome', role: 'assistant', source: 'text', content: "Hello. I'm here to help you make sense of this opportunity. Ask me about eligibility, deadlines, funding, or the application process and I'll point you to the relevant details.", createdAt: new Date().toISOString() }
}

export default createOpportunityAiClient
