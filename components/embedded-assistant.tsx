'use client'

import { type CSSProperties, useCallback, useEffect, useState } from 'react'
import { type LauncherSize, OpportunityChat, type PanelState } from '@/components/opportunity-chat'
import type { Locale } from '@/lib/i18n'
import { isAllowedOrigin } from '@/lib/embed-origins'
import type { OpportunitySuggestion } from '@/lib/opportunity-ai-client'

// Messages to the host page (opportunitiesgate-front, .../[slug]/_components/opportunity-assistant.tsx),
// which sizes the iframe to the widget and opens suggested opportunities (a link inside the iframe
// would only navigate the iframe). Sent only to the framing origin, and only if it is allowed.
// `size` (closed / minimized only) is the room the widget needs, padding included.
export type EmbedMessage =
  | { type: 'opportunity-assistant:state'; state: PanelState; size?: LauncherSize }
  | { type: 'opportunity-assistant:navigate'; opportunityId: string; slug: string }
  | { type: 'opportunity-assistant:unavailable' }

/** The widget's padding inside the iframe (p-3 on each side). */
const FRAME_PADDING = 24

function parentOrigin(allowedOrigins: string[]): string | null {
  if (window.parent === window) return null
  const framing = window.location.ancestorOrigins?.[0] ?? (document.referrer ? new URL(document.referrer).origin : null)
  return framing && isAllowedOrigin(framing, allowedOrigins) ? framing : null
}

/** Returns false when there is no allowed host to send to. */
function postToHost(message: EmbedMessage, allowedOrigins: string[]): boolean {
  const origin = parentOrigin(allowedOrigins)
  if (origin) window.parent.postMessage(message, origin)
  return origin !== null
}

interface EmbeddedAssistantProps {
  opportunityId: string
  opportunityName?: string
  embedToken: string
  socketUrl: string
  allowedOrigins: string[]
  locale: Locale
  assistantName?: string
  logoUrl?: string
  themeStyle: CSSProperties
}

export function EmbeddedAssistant({ allowedOrigins, ...chat }: EmbeddedAssistantProps) {
  const [state, setState] = useState<PanelState>('closed')
  const [launcher, setLauncher] = useState<LauncherSize | null>(null)

  useEffect(() => {
    const size =
      state !== 'open' && launcher
        ? { width: launcher.width + FRAME_PADDING, height: launcher.height + FRAME_PADDING }
        : undefined
    postToHost({ type: 'opportunity-assistant:state', state, size }, allowedOrigins)
  }, [state, launcher, allowedOrigins])

  // The host navigates its own window to the opportunity's page; without a host the widget opens a tab.
  const onOpenSuggestion = useCallback(
    ({ opportunityId, slug }: OpportunitySuggestion) =>
      postToHost({ type: 'opportunity-assistant:navigate', opportunityId, slug }, allowedOrigins),
    [allowedOrigins],
  )

  const onLauncherResize = useCallback(
    (size: LauncherSize) =>
      setLauncher((current) => (current?.width === size.width && current?.height === size.height ? current : size)),
    [],
  )
  return (
    <div data-embedded-assistant>
      <OpportunityChat
        {...chat}
        embedded
        onPanelStateChange={setState}
        onLauncherResize={onLauncherResize}
        onOpenSuggestion={onOpenSuggestion}
      />
    </div>
  )
}

/** Invalid or expired token: tell the host to remove the iframe. */
export function EmbedUnavailable({ allowedOrigins }: { allowedOrigins: string[] }) {
  useEffect(() => {
    postToHost({ type: 'opportunity-assistant:unavailable' }, allowedOrigins)
  }, [allowedOrigins])
  return <div data-embedded-assistant />
}
