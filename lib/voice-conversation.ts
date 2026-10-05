import type { SourceReference } from '@/lib/opportunity-ai-client'
import { toSourceReferences } from '@/lib/rag-sources'

// One click-to-talk voice session with the rag-getway /ws/voice WebSocket:
// microphone → MediaRecorder chunks → audio.commit → transcript + answer + spoken WAV sentences.

export type VoicePhase = 'connecting' | 'queued' | 'ready' | 'recording' | 'processing' | 'speaking' | 'ended'

export interface VoiceHandlers {
  onPhase(phase: VoicePhase): void
  onQueuePosition(position: number): void
  onTranscript(text: string): void
  onAnswer(text: string, sources: SourceReference[]): void
  onError(message: string): void
  onEnded(message?: string): void
}

const USER_ID_STORAGE_KEY = 'opportunity-assistant-user-id'
const RECORDER_TIMESLICE_MS = 250
const RECORDER_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']

// Turn-level errors leave the session usable; the user can simply ask again.
const ERROR_MESSAGES: Record<string, string> = {
  NO_SPEECH: "I didn't catch that. Please try again and speak a little closer to the microphone.",
  STT_FAILED: "I couldn't understand the recording. Please try again.",
  EMPTY_AUDIO: 'No audio was recorded. Please try again.',
  AUDIO_TOO_LARGE: 'That recording was too long. Please ask a shorter question.',
  AI_UNAVAILABLE: "I couldn't retrieve an answer right now. Please try again in a moment.",
  TTS_FAILED: 'The answer is shown above, but it could not be spoken.',
  UNAUTHORIZED: 'The voice session could not be authorized. Please try again.',
}

export class VoiceConversation {
  private socket: WebSocket | null = null
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private audioContext: AudioContext | null = null
  private playing = new Set<AudioBufferSourceNode>()
  private playHead = 0
  // Chunks are base64-encoded asynchronously; chaining keeps them (and the commit) in order.
  private sendChain: Promise<void> = Promise.resolve()
  private playChain: Promise<void> = Promise.resolve()
  private phase: VoicePhase = 'connecting'
  private ended = false
  // After the user skips a spoken answer, the rest of that turn's sentences are dropped.
  private finalAudioReceived = true
  private muted = false

  constructor(
    private readonly socketUrl: string,
    private readonly opportunityId: string,
    private readonly handlers: VoiceHandlers,
  ) {}

  /** Must be called from a click: it creates the AudioContext and asks for the microphone. */
  async start(): Promise<void> {
    this.setPhase('connecting')
    this.audioContext = new AudioContext()
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch {
      this.fail('Microphone access was denied. Allow the microphone in your browser to talk to the assistant.')
      return
    }

    const userId = anonymousUserId()
    const credentials = await requestVoiceToken(this.opportunityId, userId).catch((error: unknown) => {
      this.fail(error instanceof Error ? error.message : 'The voice assistant is not available right now.')
      return null
    })
    if (!credentials || this.ended) return
    const { token, botId } = credentials

    const socket = new WebSocket(this.socketUrl)
    this.socket = socket
    socket.onopen = () =>
      socket.send(JSON.stringify({ type: 'session.start', userId, botId, opportunityId: this.opportunityId, token }))
    socket.onmessage = (event) => this.handleEvent(event.data)
    socket.onclose = () => {
      if (!this.ended) this.finish('The voice connection was closed.')
    }
  }

  /** Start recording a question (the session must be ready). */
  startRecording(): void {
    if (this.phase !== 'ready' || !this.stream) return
    const mimeType = RECORDER_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
    const recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined)
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.enqueueSend(async () => ({ type: 'audio.chunk', data: await blobToBase64(event.data) }))
    }
    recorder.onstop = () => this.enqueueSend(async () => ({ type: 'audio.commit' }))
    recorder.start(RECORDER_TIMESLICE_MS)
    this.recorder = recorder
    this.setPhase('recording')
  }

  /** Stop recording and send the question. */
  stopRecording(): void {
    if (this.recorder?.state !== 'recording') return
    this.recorder.stop()
    this.finalAudioReceived = false
    this.muted = false
    this.setPhase('processing')
  }

  /** Stop the spoken answer early (the text answer stays in the chat). */
  stopSpeaking(): void {
    if (!this.finalAudioReceived) this.muted = true
    for (const source of this.playing) {
      source.onended = null
      source.stop()
    }
    this.playing.clear()
    this.playChain = Promise.resolve()
    if (this.phase === 'speaking') this.setPhase('ready')
  }

  end(): void {
    if (this.ended) return
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'session.end' }))
    this.finish()
  }

  private handleEvent(raw: unknown): void {
    let event: Record<string, unknown>
    try {
      event = JSON.parse(String(raw))
    } catch {
      return
    }
    switch (event.type) {
      case 'session.queued':
      case 'session.queue_position':
        this.setPhase('queued')
        if (typeof event.position === 'number') this.handlers.onQueuePosition(event.position)
        break
      case 'session.started':
        this.setPhase('ready')
        this.startRecording() // the user clicked the mic to talk
        break
      case 'transcript.final':
        if (typeof event.text === 'string') this.handlers.onTranscript(event.text)
        break
      case 'response.completed':
        if (typeof event.text === 'string') this.handlers.onAnswer(event.text, toSourceReferences(event.sources))
        break
      case 'audio.chunk':
        if (typeof event.data === 'string') this.play(event.data, event.final === true)
        break
      case 'error': {
        const code = typeof event.code === 'string' ? event.code : ''
        this.handlers.onError(ERROR_MESSAGES[code] ?? (typeof event.message === 'string' ? event.message : 'Something went wrong.'))
        if (this.phase === 'processing' || this.phase === 'recording') this.setPhase('ready')
        break
      }
      case 'session.timeout':
        this.finish(typeof event.message === 'string' ? event.message : 'The voice session has ended.')
        break
      case 'session.ended':
        this.finish()
        break
    }
  }

  private play(base64: string, final: boolean): void {
    const context = this.audioContext
    if (final) this.finalAudioReceived = true
    if (this.muted) {
      if (final) this.muted = false
      return
    }
    if (!context) return
    this.setPhase('speaking')
    const bytes = base64ToArrayBuffer(base64)
    // Decode in arrival order and schedule each sentence right after the previous one.
    this.playChain = this.playChain
      .then(async () => {
        const buffer = await context.decodeAudioData(bytes)
        if (this.ended) return
        const source = context.createBufferSource()
        source.buffer = buffer
        source.connect(context.destination)
        const startAt = Math.max(context.currentTime, this.playHead)
        source.start(startAt)
        this.playHead = startAt + buffer.duration
        this.playing.add(source)
        source.onended = () => {
          this.playing.delete(source)
          if (final && this.phase === 'speaking') this.setPhase('ready')
        }
      })
      .catch(() => {
        if (final && this.phase === 'speaking') this.setPhase('ready')
      })
  }

  private enqueueSend(build: () => Promise<Record<string, unknown>>): void {
    this.sendChain = this.sendChain.then(async () => {
      const message = await build()
      if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message))
    })
  }

  private setPhase(phase: VoicePhase): void {
    this.phase = phase
    this.handlers.onPhase(phase)
  }

  private fail(message: string): void {
    this.handlers.onError(message)
    this.finish()
  }

  private finish(message?: string): void {
    if (this.ended) return
    this.ended = true
    if (this.recorder) {
      this.recorder.ondataavailable = null
      this.recorder.onstop = null
      if (this.recorder.state !== 'inactive') this.recorder.stop()
    }
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stopSpeaking()
    if (this.socket) {
      this.socket.onclose = null
      this.socket.close()
    }
    void this.audioContext?.close()
    this.setPhase('ended')
    this.handlers.onEnded(message)
  }
}

async function requestVoiceToken(opportunityId: string, userId: string): Promise<{ token: string; botId: string }> {
  const response = await fetch(`/api/opportunities/${encodeURIComponent(opportunityId)}/voice-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || typeof data?.token !== 'string' || typeof data?.botId !== 'string') {
    throw new Error(typeof data?.error === 'string' ? data.error : 'The voice assistant is not available right now.')
  }
  return { token: data.token, botId: data.botId }
}

// An anonymous, per-browser id so the AI server can tell sessions apart; it identifies nobody.
function anonymousUserId(): string {
  try {
    const existing = window.localStorage.getItem(USER_ID_STORAGE_KEY)
    if (existing) return existing
    const created = `anon-${crypto.randomUUID()}`
    window.localStorage.setItem(USER_ID_STORAGE_KEY, created)
    return created
  } catch {
    return `anon-${crypto.randomUUID()}`
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}
