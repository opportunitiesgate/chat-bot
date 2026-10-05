'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  CircleStop,
  FileText,
  HelpCircle,
  Loader2,
  MessageCircle,
  Mic,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Volume2,
  X,
} from 'lucide-react'
import { ChatMessage, OpportunityAiClient, createOpportunityAiClient } from '@/lib/opportunity-ai-client'
import type { SourceReference } from '@/lib/opportunity-ai-client'
import type { VoiceConversation, VoicePhase } from '@/lib/voice-conversation'

export interface OpportunityChatProps {
  opportunityId: string
  socketUrl: string
  opportunityName?: string
}

type VoiceState = 'idle' | Exclude<VoicePhase, 'ended'>
type PanelState = 'closed' | 'open' | 'minimized'

const DEFAULT_ERROR = 'I couldn’t retrieve an answer right now.'

const suggestions = [
  'What is the application deadline?',
  'Who is eligible?',
  'How much funding is available?',
  'What documents are required?',
  'What are the main objectives?',
  'How do I apply?',
]

export function OpportunityChat({ opportunityId, socketUrl, opportunityName = 'European Innovation Funding Programme' }: OpportunityChatProps) {
  const [panelState, setPanelState] = useState<PanelState>('closed')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoadingConversation, setIsLoadingConversation] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [voiceSeconds, setVoiceSeconds] = useState(0)
  const [queuePosition, setQueuePosition] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const clientRef = useRef<OpportunityAiClient>(createOpportunityAiClient(socketUrl))
  const voiceRef = useRef<VoiceConversation | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (panelState !== 'open' || messages.length > 0) return
    setIsLoadingConversation(true)
    clientRef.current.getConversation(opportunityId).then(setMessages).catch(() => setError(DEFAULT_ERROR)).finally(() => setIsLoadingConversation(false))
  }, [opportunityId, panelState, messages.length])

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
      const answer = await clientRef.current.sendMessage(opportunityId, trimmed)
      setMessages((current) => [...current, answer])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : DEFAULT_ERROR)
    } finally {
      setIsStreaming(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendMessage()
  }

  function addVoiceMessage(role: ChatMessage['role'], content: string, sources?: SourceReference[]) {
    const message: ChatMessage = { id: `${role}-voice-${Date.now()}`, role, content, createdAt: new Date().toISOString(), source: 'voice', sources }
    setMessages((current) => [...current, message])
  }

  function startVoice() {
    setError(null)
    setQueuePosition(null)
    const conversation = clientRef.current.createVoiceConversation(opportunityId, {
      onPhase: (phase) => setVoiceState(phase === 'ended' ? 'idle' : phase),
      onQueuePosition: setQueuePosition,
      onTranscript: (text) => addVoiceMessage('user', text),
      onAnswer: (text, sources) => addVoiceMessage('assistant', text, sources),
      onError: setError,
      onEnded: (message) => {
        voiceRef.current = null
        setQueuePosition(null)
        if (message) setError(message)
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
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3 sm:bottom-7 sm:right-7">
      {isVisible && panelState === 'open' && (
        <section aria-label="Opportunity Assistant" className="flex h-[min(700px,calc(100vh-2rem))] w-[min(430px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[24px] border border-[#164642]/15 bg-[#FFFAF6] shadow-[0_24px_70px_rgba(13,29,79,0.2)] sm:h-[680px]">
          <header className="shrink-0 border-b border-[#164642]/10 bg-[#164642] px-5 pb-4 pt-5 text-[#FFFAF6]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-[#E9601F] text-white"><Sparkles className="size-5" /></div>
                <div><h2 className="font-semibold tracking-[-0.02em]">Opportunity Assistant</h2><p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#CDE4DE]"><span className="size-1.5 rounded-full bg-[#97C1FD]" /> Ready to help</p></div>
              </div>
              <div className="flex items-center gap-1"><button onClick={() => setPanelState('minimized')} aria-label="Minimize assistant" className="rounded-lg p-2 text-[#CDE4DE] transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#97C1FD]"><Minus className="size-4" /></button><button onClick={() => setPanelState('closed')} aria-label="Close assistant" className="rounded-lg p-2 text-[#CDE4DE] transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#97C1FD]"><X className="size-4" /></button></div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-xs text-[#E6F2EE]"><FileText className="size-3.5 shrink-0 text-[#97C1FD]" /><span className="truncate">Answering about <strong className="font-medium">this opportunity</strong></span></div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
            <OpportunityContext name={opportunityName} />
            {isLoadingConversation ? <LoadingMessages /> : <div className="space-y-5">{messages.map((message) => <ChatBubble key={message.id} message={message} />)}{isStreaming && <StreamingMessage />}</div>}
            {messages.length <= 1 && !isLoadingConversation && !isStreaming && <SuggestedQuestions onSelect={(question) => void sendMessage(question)} />}
            {error && <ErrorMessage message={error} onRetry={() => setError(null)} />}
            <div ref={messagesEndRef} />
          </div>

          {voiceState !== 'idle' && <VoiceStatus state={voiceState} seconds={voiceSeconds} queuePosition={queuePosition} onAction={handleMicClick} onEnd={() => voiceRef.current?.end()} />}
          <form onSubmit={handleSubmit} className="shrink-0 border-t border-[#164642]/10 bg-[#FFFAF6] p-3 sm:p-4">
            <div className="flex items-center gap-2 rounded-2xl border border-[#164642]/15 bg-white px-2 py-2 shadow-sm focus-within:border-[#164642]/40 focus-within:ring-2 focus-within:ring-[#97C1FD]/40">
              <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} disabled={voiceState !== 'idle' || isStreaming} placeholder="Ask about this opportunity..." aria-label="Ask a question" className="min-w-0 flex-1 bg-transparent px-2 text-sm text-[#1B1B1B] outline-none placeholder:text-[#6D7775]" />
              <button type="button" onClick={handleMicClick} disabled={voiceState === 'processing' || isStreaming} aria-label={voiceState === 'recording' ? 'Send voice question' : 'Ask by voice'} className={`flex size-9 shrink-0 items-center justify-center rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#97C1FD] ${voiceState === 'recording' ? 'bg-[#E9601F] text-white' : 'text-[#164642] hover:bg-[#F6EFE8]'}`}><Mic className="size-4" /></button>
              <button type="submit" disabled={!input.trim() || isStreaming || voiceState !== 'idle'} aria-label="Send question" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#E9601F] text-white transition hover:bg-[#cb4d18] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E9601F] focus-visible:ring-offset-2"><ArrowUp className="size-4" /></button>
            </div>
            <p className="mt-2 text-center text-[10px] text-[#6D7775]">Answers are based on the documents for this opportunity</p>
          </form>
        </section>
      )}
      {isVisible && panelState === 'minimized' && <button onClick={() => setPanelState('open')} className="flex items-center gap-2 rounded-full bg-[#164642] px-4 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-[#0d3936] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#97C1FD]"><Sparkles className="size-4 text-[#97C1FD]" /> Opportunity Assistant <Plus className="size-4" /></button>}
      {panelState === 'closed' && <button onClick={openPanel} aria-label="Open Opportunity Assistant" className="group flex items-center gap-2 rounded-full bg-[#164642] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(22,70,66,0.25)] transition hover:-translate-y-0.5 hover:bg-[#0d3936] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#97C1FD] focus-visible:ring-offset-2"><span className="flex size-7 items-center justify-center rounded-full bg-[#E9601F]"><Sparkles className="size-3.5" /></span> Ask AI <ChevronRight className="size-4 text-[#97C1FD] transition group-hover:translate-x-0.5" /></button>}
    </div>
  )
}

function OpportunityContext({ name }: { name: string }) { return <div className="mb-6 rounded-2xl border border-[#164642]/10 bg-[#F6EFE8] p-3.5"><div className="flex items-start gap-3"><div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#164642]"><BookOpen className="size-4" /></div><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6D7775]">Current opportunity</p><p className="mt-1 text-sm font-semibold leading-snug text-[#164642]">{name}</p></div><Check className="ml-auto mt-1 size-4 shrink-0 text-[#E9601F]" /></div></div> }

function SuggestedQuestions({ onSelect }: { onSelect: (question: string) => void }) { return <div className="mt-6"><div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#164642]"><HelpCircle className="size-3.5" /> Explore this opportunity</div><div className="grid gap-2">{suggestions.map((question) => <button key={question} onClick={() => onSelect(question)} className="flex w-full items-center justify-between rounded-xl border border-[#164642]/10 bg-white px-3 py-2.5 text-left text-xs text-[#1B1B1B] transition hover:border-[#97C1FD] hover:bg-[#F6EFE8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#97C1FD]"><span>{question}</span><ChevronRight className="size-3.5 shrink-0 text-[#E9601F]" /></button>)}</div></div> }

function ChatBubble({ message }: { message: ChatMessage }) { const isAssistant = message.role === 'assistant'; return <div className={`flex gap-2.5 ${isAssistant ? '' : 'justify-end'}`}>{isAssistant && <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#164642] text-[#97C1FD]"><Sparkles className="size-3.5" /></div>}<div className={`max-w-[86%] ${isAssistant ? '' : 'items-end'}`}><div className={`rounded-2xl px-3.5 py-3 text-sm leading-relaxed ${isAssistant ? 'rounded-tl-md border border-[#164642]/10 bg-white text-[#1B1B1B]' : 'rounded-tr-md bg-[#164642] text-white'}`}><FormattedContent content={message.content} /></div>{message.sources && <SourceReferences sources={message.sources} />}</div></div> }

function FormattedContent({ content }: { content: string }) { return <div className="space-y-2">{content.split('\n').map((line, index) => <p key={`${line}-${index}`}>{line.split(/(\*\*.*?\*\*)/g).map((part, partIndex) => part.startsWith('**') ? <strong key={partIndex}>{part.slice(2, -2)}</strong> : part.startsWith('- ') ? <span key={partIndex} className="block pl-3 before:mr-2 before:content-['•']">{part.slice(2)}</span> : <span key={partIndex}>{part}</span>)}</p>)}</div> }

function SourceReferences({ sources }: { sources: SourceReference[] }) { return <div className="mt-2 rounded-xl border border-[#164642]/10 bg-[#F6EFE8]/70 p-2.5"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6D7775]">Sources</p><div className="space-y-1.5">{sources.map((source) => <a key={source.id} href={source.url ?? '#'} target={source.url ? '_blank' : undefined} rel="noreferrer" className="flex items-center gap-2 text-xs text-[#164642] hover:underline"><FileText className="size-3.5 text-[#E9601F]" /><span>{source.title}{source.section && <span className="text-[#6D7775]"> · {source.section}</span>}</span></a>)}</div></div> }

function StreamingMessage() { return <div className="flex gap-2.5"><div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#164642] text-[#97C1FD]"><Sparkles className="size-3.5" /></div><div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-[#164642]/10 bg-white px-4 py-3 text-sm text-[#6D7775]"><span>Thinking through the opportunity</span><span className="flex gap-0.5"><i className="size-1 animate-bounce rounded-full bg-[#E9601F] [animation-delay:-0.2s]" /><i className="size-1 animate-bounce rounded-full bg-[#E9601F] [animation-delay:-0.1s]" /><i className="size-1 animate-bounce rounded-full bg-[#E9601F]" /></span></div></div> }

function LoadingMessages() { return <div className="space-y-4"><div className="h-20 animate-pulse rounded-2xl bg-[#F6EFE8]" /><div className="h-10 w-3/4 animate-pulse rounded-xl bg-[#F6EFE8]" /></div> }
function ErrorMessage({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="mt-5 rounded-2xl border border-[#E9601F]/25 bg-[#fff4ed] p-4"><p className="text-sm font-semibold text-[#164642]">Something went wrong.</p><p className="mt-1 text-xs text-[#6D7775]">{message}</p><button onClick={onRetry} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#E9601F] hover:underline"><RotateCcw className="size-3.5" /> Try again</button></div> }

function VoiceStatus({ state, seconds, queuePosition, onAction, onEnd }: { state: Exclude<VoiceState, 'idle'>; seconds: number; queuePosition: number | null; onAction: () => void; onEnd: () => void }) {
  const labels: Record<Exclude<VoiceState, 'idle'>, string> = {
    connecting: 'Connecting to the voice assistant...',
    queued: queuePosition ? `All voice sessions are busy. You are number ${queuePosition} in the queue.` : 'All voice sessions are busy. You are in the queue.',
    ready: 'Tap the microphone to ask your question.',
    recording: 'Listening... tap the microphone to send.',
    processing: 'Thinking about your question...',
    speaking: 'Assistant is speaking... tap to skip.',
  }
  const busy = state === 'connecting' || state === 'queued' || state === 'processing'
  return <div className="shrink-0 border-t border-[#164642]/10 bg-[#F6EFE8] px-4 py-3"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2.5 text-sm font-medium text-[#164642]">{state === 'recording' && <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#E9601F] text-white"><Mic className="size-3.5" /></span>}{busy && <Loader2 className="size-4 shrink-0 animate-spin text-[#E9601F]" />}{state === 'speaking' && <Volume2 className="size-4 shrink-0 text-[#E9601F]" />}{state === 'ready' && <Mic className="size-4 shrink-0 text-[#E9601F]" />}<span>{labels[state]}</span>{state === 'recording' && <span className="font-mono text-xs text-[#6D7775]">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</span>}</div><div className="flex shrink-0 items-center gap-1.5">{(state === 'recording' || state === 'speaking') && <button onClick={onAction} aria-label={state === 'recording' ? 'Send voice question' : 'Skip spoken answer'} className="flex size-8 items-center justify-center rounded-lg border border-[#164642]/15 bg-white text-[#164642] hover:bg-[#FFFAF6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#97C1FD]">{state === 'speaking' ? <Square className="size-3.5 fill-current" /> : <CircleStop className="size-4" />}</button>}<button onClick={onEnd} aria-label="End voice conversation" className="flex size-8 items-center justify-center rounded-lg border border-[#164642]/15 bg-white text-[#164642] hover:bg-[#FFFAF6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#97C1FD]"><X className="size-4" /></button></div></div>{state === 'recording' && <div className="mt-2 flex h-3 items-center justify-center gap-0.5">{Array.from({ length: 28 }, (_, index) => <span key={index} className="w-0.5 rounded-full bg-[#E9601F]" style={{ height: `${5 + ((index * 7) % 9)}px` }} />)}</div>}</div>
}

export const opportunityChatIcons = { MessageCircle, Volume2 }
