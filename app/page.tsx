import { OpportunityChat } from '@/components/opportunity-chat'

export default function Home() {
  return (
    <main className="min-h-screen bg-[#F6EFE8]">
      <OpportunityChat
        opportunityId="opp_123"
        apiUrl="https://ai-chat.opportunitiesgate.net"
      />
    </main>
  )
}
