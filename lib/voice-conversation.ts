import type { ErrorKey, Locale } from '@/lib/i18n'
import type { OpportunitySuggestion, SourceReference } from '@/lib/opportunity-ai-client'
import { toSourceReferences, toSuggestions } from '@/lib/rag-sources'

// One click-to-talk voice session with the rag-getway /ws/voice WebSocket:
// microphone → MediaRecorder chunks → audio.commit → transcript + answer + spoken WAV sentences.

export type VoicePhase = 'connecting' | 'queued' | 'ready' | 'recording' | 'processing' | 'speaking' | 'ended'

export interface VoiceHandlers {
  onPhase(phase: VoicePhase): void
  onQueuePosition(position: number): void
  onTranscript(text: string): void
  onAnswer(text: string, sources: SourceReference[], suggestions: OpportunitySuggestion[]): void
  /** A translatable error key; turn-level errors leave the session usable. */
  onError(error: ErrorKey): void
  onEnded(reason?: ErrorKey): void
}

const SERVER_ERROR_KEYS: readonly string[] = [
  'NO_SPEECH',
  'STT_FAILED',
  'EMPTY_AUDIO',
  'AUDIO_TOO_LARGE',
  'AI_UNAVAILABLE',
  'TTS_FAILED',
  'TTS_UNAVAILABLE',
  'UNAUTHORIZED',
  'TURN_IN_PROGRESS',
]

class VoiceTokenError extends Error {
  constructor(readonly key: ErrorKey) {
    super(key)
  }
}

const RECORDER_TIMESLICE_MS = 250
const RECORDER_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']

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
    private readonly authHeaders: Record<string, string> = {},
    /** Interface language: the server uses it when the spoken language is unclear. */
    private readonly language?: Locale,
  ) {}

  /** Must be called from a click: it creates the AudioContext and asks for the microphone. */
  async start(): Promise<void> {
    this.setPhase('connecting')
    this.audioContext = new AudioContext()
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch {
      this.fail('MICROPHONE_DENIED')
      return
    }

    const credentials = await requestVoiceToken(this.opportunityId, this.authHeaders).catch((error: unknown) => {
      this.fail(error instanceof VoiceTokenError ? error.key : 'VOICE_UNAVAILABLE')
      return null
    })
    if (!credentials || this.ended) return
    // The token is bound to this user and bot; session.start must repeat them exactly.
    const { token, userId, botId } = credentials

    const socket = new WebSocket(this.socketUrl)
    this.socket = socket
    socket.onopen = () =>
      socket.send(
        JSON.stringify({ type: 'session.start', userId, botId, opportunityId: this.opportunityId, token, language: this.language }),
      )
    socket.onmessage = (event) => this.handleEvent(event.data)
    socket.onclose = () => {
      if (!this.ended) this.finish('CONNECTION_CLOSED')
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
        if (typeof event.text === 'string') {
          this.handlers.onAnswer(event.text, toSourceReferences(event.sources), toSuggestions(event.suggestions))
        }
        break
      case 'audio.chunk':
        if (typeof event.data === 'string') this.play(event.data, event.final === true)
        break
      case 'error': {
        const code = typeof event.code === 'string' ? event.code : ''
        this.handlers.onError(SERVER_ERROR_KEYS.includes(code) ? (code as ErrorKey) : 'generic')
        if (this.phase === 'processing' || this.phase === 'recording') this.setPhase('ready')
        break
      }
      case 'session.timeout':
        this.finish(this.phase === 'queued' ? 'QUEUE_TIMEOUT' : 'SESSION_TIMEOUT')
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

  private fail(error: ErrorKey): void {
    this.handlers.onError(error)
    this.finish()
  }

  private finish(reason?: ErrorKey): void {
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
    this.handlers.onEnded(reason)
  }
}

async function requestVoiceToken(
  opportunityId: string,
  authHeaders: Record<string, string>,
): Promise<{ token: string; userId: string; botId: string }> {
  const response = await fetch(`/api/opportunities/${encodeURIComponent(opportunityId)}/voice-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || typeof data?.token !== 'string' || typeof data?.userId !== 'string' || typeof data?.botId !== 'string') {
    throw new VoiceTokenError(response.status === 401 ? 'sessionExpired' : response.status === 429 ? 'rateLimited' : 'VOICE_UNAVAILABLE')
  }
  return { token: data.token, userId: data.userId, botId: data.botId }
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
