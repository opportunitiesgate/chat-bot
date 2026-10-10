'use client'

import { type CSSProperties, FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleStop,
  FileText,
  HelpCircle,
  Loader2,
  Mic,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Volume2,
  X,
} from 'lucide-react'
import { DEFAULT_LOCALE, type ErrorKey, isRtl, type Locale, MESSAGES, type Messages } from '@/lib/i18n'
import {
  ChatMessage,
  ChatRequestError,
  OpportunityAiClient,
  createOpeningMessage,
  createOpportunityAiClient,
} from '@/lib/opportunity-ai-client'
import { toHistory } from '@/lib/chat-history'
import { type OpportunitySuggestion, opportunityPageUrl, type SourceReference } from '@/lib/opportunity-ai-client'
import type { VoiceConversation, VoicePhase } from '@/lib/voice-conversation'

export interface OpportunityChatProps {
  opportunityId: string
  socketUrl: string
  opportunityName?: string
  /** Signed by the OpportunitiesGate site for this viewer and opportunity; sent with every request. */
  embedToken?: string
  /** Inside the host page's iframe: the widget fills the iframe, which the host sizes. */
  embedded?: boolean
  onPanelStateChange?: (state: PanelState) => void
  /** Size of the closed launcher or the minimized pill, so the host can fit the iframe to it. */
  onLauncherResize?: (size: LauncherSize) => void
  /** Opens a suggested opportunity in the host page; returns false when it cannot (no host). */
  onOpenSuggestion?: (suggestion: OpportunitySuggestion) => boolean
  /** Interface language; answers follow each question's own language. */
  locale?: Locale
  /** Replaces "Opportunity Assistant" in the header and buttons. */
  assistantName?: string
  /** Replaces the sparkles icon in the header and the launcher. */
  logoUrl?: string
  /** CSS custom properties overriding the default palette (see lib/embed-options.ts). */
  themeStyle?: CSSProperties
}

type VoiceState = 'idle' | Exclude<VoicePhase, 'ended'>
export type PanelState = 'closed' | 'open' | 'minimized'
export type LauncherSize = { width: number; height: number }

// Every color comes from the .assistant-theme variables (app/globals.css), so the host can restyle it.
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--assistant-focus)'

export function OpportunityChat({
  opportunityId,
  socketUrl,
  opportunityName,
  embedToken,
  embedded = false,
  onPanelStateChange,
  onLauncherResize,
  onOpenSuggestion,
  locale = DEFAULT_LOCALE,
  assistantName,
  logoUrl,
  themeStyle,
}: OpportunityChatProps) {
  const t = MESSAGES[locale]
  const name = assistantName || t.assistantName
  const [panelState, setPanelState] = useState<PanelState>('closed')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [voiceSeconds, setVoiceSeconds] = useState(0)
  const [queuePosition, setQueuePosition] = useState<number | null>(null)
  const [error, setError] = useState<ErrorKey | null>(null)
  const clientRef = useRef<OpportunityAiClient>(createOpportunityAiClient(socketUrl, embedToken, locale))
  const voiceRef = useRef<VoiceConversation | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (panelState === 'open' && messages.length === 0) setMessages([createOpeningMessage(t.opening)])
  }, [panelState, messages.length, t.opening])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  useEffect(() => {
    if (voiceState !== 'recording') return
    setVoiceSeconds(0)
    const timer = window.setInterval(() => setVoiceSeconds((seconds) => seconds + 1), 1000)
    return () => window.clearInterval(timer)
  }, [voiceState])

  useEffect(() => () => voiceRef.current?.end(), [])

  useEffect(() => onPanelStateChange?.(panelState), [panelState, onPanelStateChange])

  // The launcher's width depends on the language, the name and the logo: report it as it changes.
  const launcherObserver = useRef<ResizeObserver | null>(null)
  const launcherRef = useCallback(
    (element: HTMLButtonElement | null) => {
      launcherObserver.current?.disconnect()
      launcherObserver.current = null
      if (!element || !onLauncherResize) return
      const observer = new ResizeObserver(() => {
        const rect = element.getBoundingClientRect()
        onLauncherResize({ width: Math.ceil(rect.width), height: Math.ceil(rect.height) })
      })
      observer.observe(element)
      launcherObserver.current = observer
    },
    [onLauncherResize],
  )

  function openPanel() {
    setPanelState('open')
    window.setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function sendMessage(message = input) {
    const trimmed = message.trim()
    if (!trimmed || isStreaming || voiceState !== 'idle') return
    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: trimmed, createdAt: new Date().toISOString(), source: 'text' }
    setMessages((current) => [...current, userMessage])
    setInput('')
    setError(null)
    setIsStreaming(true)
    try {
      // `messages` is the conversation before this question (the state update above is not applied yet).
      const answer = await clientRef.current.sendMessage(opportunityId, trimmed, toHistory(messages))
      setMessages((current) => [...current, answer])
    } catch (caught) {
      setError(caught instanceof ChatRequestError ? caught.key : 'generic')
    } finally {
      setIsStreaming(false)
    }
  }

  function openSuggestion(suggestion: OpportunitySuggestion) {
    if (onOpenSuggestion?.(suggestion)) return
    window.open(opportunityPageUrl(locale, suggestion.slug), '_blank', 'noopener,noreferrer')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendMessage()
  }

  function addVoiceMessage(
    role: ChatMessage['role'],
    content: string,
    sources?: SourceReference[],
    suggestions?: OpportunitySuggestion[],
  ) {
    const message: ChatMessage = { id: `${role}-voice-${Date.now()}`, role, content, createdAt: new Date().toISOString(), source: 'voice', sources, suggestions }
    setMessages((current) => [...current, message])
  }

  function startVoice() {
    setError(null)
    setQueuePosition(null)
    const conversation = clientRef.current.createVoiceConversation(opportunityId, {
      onPhase: (phase) => setVoiceState(phase === 'ended' ? 'idle' : phase),
      onQueuePosition: setQueuePosition,
      onTranscript: (text) => addVoiceMessage('user', text),
      onAnswer: (text, sources, suggestions) => addVoiceMessage('assistant', text, sources, suggestions),
      onError: setError,
      onEnded: (reason) => {
        voiceRef.current = null
        setQueuePosition(null)
        if (reason) setError(reason)
      },
    })
    voiceRef.current = conversation
    void conversation.start()
  }

  // Click to talk: the mic starts a session and records; the next click sends the question.
  function handleMicClick() {
    const conversation = voiceRef.current
    if (!conversation) return startVoice()
    if (voiceState === 'recording') return conversation.stopRecording()
    if (voiceState === 'ready') return conversation.startRecording()
    if (voiceState === 'speaking') return conversation.stopSpeaking()
    if (voiceState === 'connecting' || voiceState === 'queued') return conversation.end()
  }

  const isVisible = panelState !== 'closed'
  const position = embedded
    ? 'fixed inset-0 flex flex-col items-end justify-end p-3'
    : 'fixed bottom-5 end-5 z-50 flex flex-col items-end gap-3 sm:bottom-7 sm:end-7'
  return (
    <div dir={isRtl(locale) ? 'rtl' : 'ltr'} lang={locale} style={themeStyle} className={`assistant-theme ${position}`}>
      {isVisible && panelState === 'open' && (
        <section
          aria-label={name}
          className={`flex ${embedded ? 'h-full w-full' : 'h-[min(700px,calc(100vh-2rem))] w-[min(430px,calc(100vw-2rem))] sm:h-[680px]'} flex-col overflow-hidden rounded-[24px] border border-(--assistant-primary)/15 bg-(--assistant-background) shadow-[0_24px_70px_rgba(13,29,79,0.2)]`}
        >
          <header className="shrink-0 border-b border-(--assistant-primary)/10 bg-(--assistant-primary) px-5 pb-4 pt-5 text-(--assistant-background)">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Logo logoUrl={logoUrl} className="size-10 rounded-2xl" iconClassName="size-5" />
                <div className="min-w-0">
                  <h2 className="truncate font-semibold tracking-[-0.02em]">{name}</h2>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-(--assistant-on-primary-muted)">
                    <span className="size-1.5 rounded-full bg-(--assistant-focus)" /> {t.readyToHelp}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPanelState('minimized')} aria-label={t.minimize} className={`rounded-lg p-2 text-(--assistant-on-primary-muted) transition hover:bg-white/10 hover:text-white ${FOCUS_RING}`}>
                  <Minus className="size-4" />
                </button>
                <button onClick={() => setPanelState('closed')} aria-label={t.close} className={`rounded-lg p-2 text-(--assistant-on-primary-muted) transition hover:bg-white/10 hover:text-white ${FOCUS_RING}`}>
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-xs text-(--assistant-on-primary-muted)">
              <FileText className="size-3.5 shrink-0 text-(--assistant-focus)" />
              <span className="truncate">
                {t.answeringAbout} <strong className="font-medium">{t.thisOpportunity}</strong>
              </span>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
            <OpportunityContext t={t} name={opportunityName || t.thisOpportunity} />
            <div className="space-y-5">
              {messages.map((message) => <ChatBubble key={message.id} message={message} t={t} onOpenSuggestion={openSuggestion} />)}
              {isStreaming && <StreamingMessage t={t} />}
            </div>
            {messages.length <= 1 && !isStreaming && <SuggestedQuestions t={t} onSelect={(question) => void sendMessage(question)} />}
            {error && <ErrorMessage t={t} message={t.errors[error]} onRetry={() => setError(null)} />}
            <div ref={messagesEndRef} />
          </div>

          {voiceState !== 'idle' && <VoiceStatus t={t} state={voiceState} seconds={voiceSeconds} queuePosition={queuePosition} onAction={handleMicClick} onEnd={() => voiceRef.current?.end()} />}
          <form onSubmit={handleSubmit} className="shrink-0 border-t border-(--assistant-primary)/10 bg-(--assistant-background) p-3 sm:p-4">
            <div className="flex items-center gap-2 rounded-2xl border border-(--assistant-primary)/15 bg-white px-2 py-2 shadow-sm focus-within:border-(--assistant-primary)/40 focus-within:ring-2 focus-within:ring-(--assistant-focus)/40">
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={voiceState !== 'idle' || isStreaming}
                placeholder={t.inputPlaceholder}
                aria-label={t.askQuestion}
                dir="auto"
                className="min-w-0 flex-1 bg-transparent px-2 text-sm text-(--assistant-text) outline-none placeholder:text-(--assistant-muted)"
              />
              <button
                type="button"
                onClick={handleMicClick}
                disabled={voiceState === 'processing' || isStreaming}
                aria-label={voiceState === 'recording' ? t.sendVoiceQuestion : t.askByVoice}
                className={`flex size-9 shrink-0 items-center justify-center rounded-xl transition ${FOCUS_RING} ${voiceState === 'recording' ? 'bg-(--assistant-accent) text-white' : 'text-(--assistant-primary) hover:bg-(--assistant-surface)'}`}
              >
                <Mic className="size-4" />
              </button>
              <button
                type="submit"
                disabled={!input.trim() || isStreaming || voiceState !== 'idle'}
                aria-label={t.sendQuestion}
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-(--assistant-accent) text-white transition hover:bg-(--assistant-accent-hover) disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--assistant-accent) focus-visible:ring-offset-2"
              >
                <ArrowUp className="size-4" />
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-(--assistant-muted)">{t.footer}</p>
          </form>
        </section>
      )}
      {isVisible && panelState === 'minimized' && (
        <button ref={launcherRef} onClick={() => setPanelState('open')} className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-(--assistant-primary) px-4 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-(--assistant-primary-hover) ${FOCUS_RING}`}>
          <Logo logoUrl={logoUrl} className="size-5 rounded-md" iconClassName="size-3" />
          <span className="max-w-[12rem] truncate">{name}</span>
          <Plus className="size-4" />
        </button>
      )}
      {panelState === 'closed' && (
        <button
          ref={launcherRef}
          onClick={openPanel}
          aria-label={t.open(name)}
          className="group flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-(--assistant-primary) px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(22,70,66,0.25)] transition hover:-translate-y-0.5 hover:bg-(--assistant-primary-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--assistant-focus) focus-visible:ring-offset-2"
        >
          <Logo logoUrl={logoUrl} className="size-7 rounded-full" iconClassName="size-3.5" />
          {t.askAi}
          <ChevronRight className="size-4 text-(--assistant-focus) transition group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
        </button>
      )}
    </div>
  )
}

/** The host's logo when given (and loadable), otherwise the sparkles badge. */
function Logo({ logoUrl, className, iconClassName }: { logoUrl?: string; className: string; iconClassName: string }) {
  const [failed, setFailed] = useState(false)
  const image = useRef<HTMLImageElement>(null)
  // A server-rendered image can fail before hydration, when onError is not attached yet.
  useEffect(() => {
    const element = image.current
    if (element?.complete && element.naturalWidth === 0) setFailed(true)
  }, [logoUrl])
  if (logoUrl && !failed) {
    // eslint-disable-next-line @next/next/no-img-element -- any https origin, chosen by the host page
    return <img ref={image} src={logoUrl} alt="" onError={() => setFailed(true)} className={`${className} shrink-0 bg-white object-contain p-1`} />
  }
  return (
    <span className={`${className} flex shrink-0 items-center justify-center bg-(--assistant-accent) text-white`}>
      <Sparkles className={iconClassName} />
    </span>
  )
}

function OpportunityContext({ t, name }: { t: Messages; name: string }) {
  return (
    <div className="mb-6 rounded-2xl border border-(--assistant-primary)/10 bg-(--assistant-surface) p-3.5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-white text-(--assistant-primary)"><BookOpen className="size-4" /></div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-(--assistant-muted)">{t.currentOpportunity}</p>
          <p dir="auto" className="mt-1 text-sm font-semibold leading-snug text-(--assistant-primary)">{name}</p>
        </div>
        <Check className="ms-auto mt-1 size-4 shrink-0 text-(--assistant-accent)" />
      </div>
    </div>
  )
}

function SuggestedQuestions({ t, onSelect }: { t: Messages; onSelect: (question: string) => void }) {
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-(--assistant-primary)"><HelpCircle className="size-3.5" /> {t.exploreOpportunity}</div>
      <div className="grid gap-2">
        {t.suggestions.map((question) => (
          <button key={question} onClick={() => onSelect(question)} className={`flex w-full items-center justify-between rounded-xl border border-(--assistant-primary)/10 bg-white px-3 py-2.5 text-start text-xs text-(--assistant-text) transition hover:border-(--assistant-focus) hover:bg-(--assistant-surface) ${FOCUS_RING}`}>
            <span>{question}</span>
            <ChevronRight className="size-3.5 shrink-0 text-(--assistant-accent) rtl:rotate-180" />
          </button>
        ))}
      </div>
    </div>
  )
}

function ChatBubble({
  message,
  t,
  onOpenSuggestion,
}: {
  message: ChatMessage
  t: Messages
  onOpenSuggestion: (suggestion: OpportunitySuggestion) => void
}) {
  const isAssistant = message.role === 'assistant'
  return (
    <div className={`flex gap-2.5 ${isAssistant ? '' : 'justify-end'}`}>
      {isAssistant && <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--assistant-primary) text-(--assistant-focus)"><Sparkles className="size-3.5" /></div>}
      <div className={`max-w-[86%] ${isAssistant ? '' : 'items-end'}`}>
        <div className={`rounded-2xl px-3.5 py-3 text-sm leading-relaxed ${isAssistant ? 'rounded-ss-md border border-(--assistant-primary)/10 bg-white text-(--assistant-text)' : 'rounded-se-md bg-(--assistant-primary) text-white'}`}>
          <FormattedContent content={message.content} />
        </div>
        {message.sources && message.sources.length > 0 && <SourceReferences t={t} sources={message.sources} />}
        {message.suggestions && message.suggestions.length > 0 && (
          <SuggestionCards t={t} suggestions={message.suggestions} onOpen={onOpenSuggestion} />
        )}
      </div>
    </div>
  )
}

// dir="auto": an answer may be in another language (and direction) than the interface.
function FormattedContent({ content }: { content: string }) {
  return (
    <div className="space-y-2">
      {content.split('\n').map((line, index) => (
        <p key={`${line}-${index}`} dir="auto">
          {line.split(/(\*\*.*?\*\*)/g).map((part, partIndex) =>
            part.startsWith('**') ? (
              <strong key={partIndex}>{part.slice(2, -2)}</strong>
            ) : part.startsWith('- ') ? (
              <span key={partIndex} className="block ps-3 before:me-2 before:content-['•']">{part.slice(2)}</span>
            ) : (
              <span key={partIndex}>{part}</span>
            ),
          )}
        </p>
      ))}
    </div>
  )
}

function SourceReferences({ t, sources }: { t: Messages; sources: SourceReference[] }) {
  return (
    <div className="mt-2 rounded-xl border border-(--assistant-primary)/10 bg-(--assistant-surface)/70 p-2.5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-(--assistant-muted)">{t.sources}</p>
      <div className="space-y-1.5">
        {sources.map((source) => (
          <a key={source.id} href={source.url ?? '#'} target={source.url ? '_blank' : undefined} rel="noreferrer" className="flex items-center gap-2 text-xs text-(--assistant-primary) hover:underline">
            <FileText className="size-3.5 text-(--assistant-accent)" />
            <span dir="auto">
              {source.title}
              {source.section && <span className="text-(--assistant-muted)"> · {source.section}</span>}
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

// Built from the RAG server's structured suggestions (real titles and slugs), never from the answer text.
function SuggestionCards({
  t,
  suggestions,
  onOpen,
}: {
  t: Messages
  suggestions: OpportunitySuggestion[]
  onOpen: (suggestion: OpportunitySuggestion) => void
}) {
  return (
    <div className="mt-2 rounded-xl border border-(--assistant-primary)/10 bg-(--assistant-surface)/70 p-2.5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-(--assistant-muted)">{t.relatedOpportunities}</p>
      <div className="space-y-1.5">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.opportunityId}
            type="button"
            onClick={() => onOpen(suggestion)}
            className={`flex w-full items-center gap-2 rounded-lg border border-(--assistant-primary)/10 bg-white px-3 py-2 text-start text-xs font-medium text-(--assistant-primary) transition hover:border-(--assistant-accent)/40 ${FOCUS_RING}`}
          >
            <span className="flex-1" dir="auto">{suggestion.title}</span>
            <ArrowUpRight className="size-3.5 shrink-0 text-(--assistant-accent) rtl:-scale-x-100" />
          </button>
        ))}
      </div>
    </div>
  )
}

function StreamingMessage({ t }: { t: Messages }) {
  return (
    <div className="flex gap-2.5">
      <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--assistant-primary) text-(--assistant-focus)"><Sparkles className="size-3.5" /></div>
      <div className="flex items-center gap-2 rounded-2xl rounded-ss-md border border-(--assistant-primary)/10 bg-white px-4 py-3 text-sm text-(--assistant-muted)">
        <span>{t.thinking}</span>
        <span className="flex gap-0.5">
          <i className="size-1 animate-bounce rounded-full bg-(--assistant-accent) [animation-delay:-0.2s]" />
          <i className="size-1 animate-bounce rounded-full bg-(--assistant-accent) [animation-delay:-0.1s]" />
          <i className="size-1 animate-bounce rounded-full bg-(--assistant-accent)" />
        </span>
      </div>
    </div>
  )
}

function ErrorMessage({ t, message, onRetry }: { t: Messages; message: string; onRetry: () => void }) {
  return (
    <div className="mt-5 rounded-2xl border border-(--assistant-accent)/25 bg-(--assistant-error-surface) p-4">
      <p className="text-sm font-semibold text-(--assistant-primary)">{t.errorTitle}</p>
      <p className="mt-1 text-xs text-(--assistant-muted)">{message}</p>
      <button onClick={onRetry} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-(--assistant-accent) hover:underline">
        <RotateCcw className="size-3.5" /> {t.tryAgain}
      </button>
    </div>
  )
}

function VoiceStatus({ t, state, seconds, queuePosition, onAction, onEnd }: { t: Messages; state: Exclude<VoiceState, 'idle'>; seconds: number; queuePosition: number | null; onAction: () => void; onEnd: () => void }) {
  const labels: Record<Exclude<VoiceState, 'idle'>, string> = {
    connecting: t.voice.connecting,
    queued: t.voice.queued(queuePosition),
    ready: t.voice.ready,
    recording: t.voice.recording,
    processing: t.voice.processing,
    speaking: t.voice.speaking,
  }
  const busy = state === 'connecting' || state === 'queued' || state === 'processing'
  const iconButton = `flex size-8 items-center justify-center rounded-lg border border-(--assistant-primary)/15 bg-white text-(--assistant-primary) hover:bg-(--assistant-background) ${FOCUS_RING}`
  return (
    <div className="shrink-0 border-t border-(--assistant-primary)/10 bg-(--assistant-surface) px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5 text-sm font-medium text-(--assistant-primary)">
          {state === 'recording' && <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-(--assistant-accent) text-white"><Mic className="size-3.5" /></span>}
          {busy && <Loader2 className="size-4 shrink-0 animate-spin text-(--assistant-accent)" />}
          {state === 'speaking' && <Volume2 className="size-4 shrink-0 text-(--assistant-accent)" />}
          {state === 'ready' && <Mic className="size-4 shrink-0 text-(--assistant-accent)" />}
          <span>{labels[state]}</span>
          {state === 'recording' && (
            <span dir="ltr" className="font-mono text-xs text-(--assistant-muted)">
              {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {(state === 'recording' || state === 'speaking') && (
            <button onClick={onAction} aria-label={state === 'recording' ? t.sendVoiceQuestion : t.voice.skip} className={iconButton}>
              {state === 'speaking' ? <Square className="size-3.5 fill-current" /> : <CircleStop className="size-4" />}
            </button>
          )}
          <button onClick={onEnd} aria-label={t.voice.end} className={iconButton}>
            <X className="size-4" />
          </button>
        </div>
      </div>
      {state === 'recording' && (
        <div className="mt-2 flex h-3 items-center justify-center gap-0.5">
          {Array.from({ length: 28 }, (_, index) => <span key={index} className="w-0.5 rounded-full bg-(--assistant-accent)" style={{ height: `${5 + ((index * 7) % 9)}px` }} />)}
        </div>
      )}
    </div>
  )
}
