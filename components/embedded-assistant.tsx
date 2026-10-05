'use client'

import { useCallback, useEffect } from 'react'
import { OpportunityChat, type PanelState } from '@/components/opportunity-chat'
import { isAllowedOrigin } from '@/lib/embed-origins'

// Messages to the host page (opportunitiesgate-front, .../[slug]/_components/opportunity-assistant.tsx),
// which sizes the iframe to the widget. Sent only to the framing origin, and only if it is allowed.
export type EmbedMessage =
  | { type: 'opportunity-assistant:state'; state: PanelState }
  | { type: 'opportunity-assistant:unavailable' }

function parentOrigin(allowedOrigins: string[]): string | null {
  if (window.parent === window) return null
  const framing = window.location.ancestorOrigins?.[0] ?? (document.referrer ? new URL(document.referrer).origin : null)
  return framing && isAllowedOrigin(framing, allowedOrigins) ? framing : null
}

function postToHost(message: EmbedMessage, allowedOrigins: string[]) {
  const origin = parentOrigin(allowedOrigins)
  if (origin) window.parent.postMessage(message, origin)
}

interface EmbeddedAssistantProps {
  opportunityId: string
  opportunityName?: string
  embedToken: string
  socketUrl: string
  allowedOrigins: string[]
}

export function EmbeddedAssistant({ allowedOrigins, ...chat }: EmbeddedAssistantProps) {
  const onPanelStateChange = useCallback(
    (state: PanelState) => postToHost({ type: 'opportunity-assistant:state', state }, allowedOrigins),
    [allowedOrigins],
  )
  return (
    <div data-embedded-assistant>
      <OpportunityChat {...chat} embedded onPanelStateChange={onPanelStateChange} />
    </div>
  )
}

/** Invalid or expired token: tell the host to remove the iframe. */
export function EmbedUnavailable({ allowedOrigins }: { allowedOrigins: string[] }) {
  useEffect(() => postToHost({ type: 'opportunity-assistant:unavailable' }, allowedOrigins), [allowedOrigins])
  return <div data-embedded-assistant />
}
