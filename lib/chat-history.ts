import type { ChatMessage } from '@/lib/opportunity-ai-client'

/** One earlier message sent back to the AI server, which keeps no conversation history itself. */
export interface HistoryEntry {
  role: 'user' | 'assistant'
  content: string
}

// The last 3 exchanges are enough for follow-ups ("and the deadline?"); more slows the CPU model.
const MAX_HISTORY_MESSAGES = 6
const MAX_HISTORY_MESSAGE_CHARS = 500

/** Id of the message every conversation starts with; it is not part of the history. */
export const OPENING_MESSAGE_ID = 'welcome'

/** The recent conversation before a new question, oldest first (browser side). */
export function toHistory(messages: ChatMessage[]): HistoryEntry[] {
  return parseHistory(messages.filter((message) => message.id !== OPENING_MESSAGE_ID))
}

/**
 * Keeps only well-formed user/assistant entries (never a "system" turn), the most recent ones,
 * each capped. Used on the server too, where the browser's input is untrusted.
 */
export function parseHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (entry): entry is HistoryEntry =>
        !!entry &&
        typeof entry === 'object' &&
        (entry.role === 'user' || entry.role === 'assistant') &&
        typeof entry.content === 'string' &&
        entry.content.trim() !== '',
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map(({ role, content }) => ({ role, content: content.trim().slice(0, MAX_HISTORY_MESSAGE_CHARS) }))
}
