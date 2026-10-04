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
  sources?: SourceReference[]
}

export interface OpportunityAiClient {
  sendMessage(opportunityId: string, message: string): Promise<ChatMessage>
  getConversation(opportunityId: string): Promise<ChatMessage[]>
}

const sourceReferences: SourceReference[] = [
  { id: 'eligibility', title: 'Eligibility criteria', section: 'Who can apply' },
  { id: 'funding', title: 'Funding conditions', section: 'Budget and funding' },
  { id: 'programme', title: 'Official programme page', url: 'https://commission.europa.eu' },
]

const openingMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hello. I’m here to help you make sense of this opportunity. Ask me about eligibility, deadlines, funding, or the application process and I’ll point you to the relevant details.",
  createdAt: new Date().toISOString(),
}

export function createOpportunityAiClient(apiUrl: string, apiKey: string): OpportunityAiClient {
  const baseUrl = apiUrl.replace(/\/$/, '')
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'X-API-Key': apiKey }

  return {
    async getConversation(opportunityId) {
      const response = await fetch(`${baseUrl}/opportunities/${encodeURIComponent(opportunityId)}/conversation`, { headers })
      if (!response.ok) throw new Error(`Conversation request failed (${response.status})`)
      const data = await response.json()
      return Array.isArray(data) ? data : data.messages ?? []
    },
    async sendMessage(opportunityId, message) {
      const response = await fetch(`${baseUrl}/opportunities/${encodeURIComponent(opportunityId)}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message }),
      })
      if (!response.ok) throw new Error(`Message request failed (${response.status})`)
      return response.json()
    },
  }
} 

export function createMockOpportunityAiClient(_apiUrl: string): OpportunityAiClient {
  return {
    async getConversation(_opportunityId) { await wait(450); return [openingMessage] },
    async sendMessage(_opportunityId, message) {
      await wait(1100)
      return { id: `assistant-${Date.now()}`, role: 'assistant', content: responseFor(message), createdAt: new Date().toISOString(), sources: sourceReferences }
    },
  }
}

function responseFor(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('deadline') || normalized.includes('when')) {
    return '**The application deadline is 30 September 2025.** Applications must be submitted through the official programme portal before 17:00 Brussels time.\n\nI recommend allowing time to validate your organisation details and upload the required annexes.'
  }
  if (normalized.includes('eligible') || normalized.includes('who')) {
    return '**Eligible applicants** include public bodies, research organisations, and eligible private entities established in an EU Member State or an associated country.\n\nA consortium may be required for some action types, so check the specific call conditions before applying.'
  }
  if (normalized.includes('funding') || normalized.includes('amount')) {
    return '**Up to €2.5 million** is available per project, with the programme typically funding up to 70% of eligible costs. The final grant depends on your action type, budget, and evaluation outcome.'
  }
  if (normalized.includes('document') || normalized.includes('requirement')) {
    return '**You’ll typically need:**\n\n- A completed application form\n- A technical proposal and work plan\n- A detailed budget\n- Legal entity and financial identification forms\n\nThe call documents contain the definitive checklist.'
  }
  return 'Based on the opportunity information available, this programme supports collaborative innovation projects with measurable impact. I can help you explore **eligibility, deadlines, funding, and required documents** in more detail.'
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}
