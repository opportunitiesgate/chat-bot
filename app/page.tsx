// The assistant is only used embedded in OpportunitiesGate opportunity pages (/embed/[opportunityId]),
// which pass a signed token proving the viewer may see that opportunity's details.
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F6EFE8] p-6">
      <p className="max-w-md text-center text-sm text-[#164642]">
        The Opportunity Assistant is available on OpportunitiesGate opportunity pages.
      </p>
    </main>
  )
}
