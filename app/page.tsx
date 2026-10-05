import { OpportunityChat } from '@/components/opportunity-chat'

export default function Home() {
  return (
    <main className="min-h-screen bg-[#F6EFE8]">
      <OpportunityChat
        opportunityId="6ab6e65f09c96c7c70d3a3b5"
        apiUrl={process.env.AI_CHAT_URL ?? 'https://ai-chat.opportunitiesgate.net'}
        socketUrl={process.env.NEXT_PUBLIC_AI_VOICE_SOCKET_URL ?? 'wss://ai-chat.opportunitiesgate.net/ws/voice'}
      />
    </main>
  )
}
