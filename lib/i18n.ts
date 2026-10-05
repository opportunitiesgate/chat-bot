// Interface languages of the assistant. The host page picks one (?lang= on /embed); English is the default.
// Answers follow the language of each question, whatever the interface language.

export const LOCALES = ['en', 'fr', 'ar'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

export function resolveLocale(value: string | null | undefined): Locale {
  const code = value?.toLowerCase().split('-')[0]
  return (LOCALES as readonly string[]).includes(code ?? '') ? (code as Locale) : DEFAULT_LOCALE
}

export function isRtl(locale: Locale): boolean {
  return locale === 'ar'
}

/** Error keys: the voice server's error codes plus the client's own failures. */
export type ErrorKey =
  | 'generic'
  | 'rateLimited'
  | 'sessionExpired'
  | 'unreachable'
  | 'MICROPHONE_DENIED'
  | 'VOICE_UNAVAILABLE'
  | 'CONNECTION_CLOSED'
  | 'QUEUE_TIMEOUT'
  | 'SESSION_TIMEOUT'
  | 'NO_SPEECH'
  | 'STT_FAILED'
  | 'EMPTY_AUDIO'
  | 'AUDIO_TOO_LARGE'
  | 'AI_UNAVAILABLE'
  | 'TTS_FAILED'
  | 'TTS_UNAVAILABLE'
  | 'UNAUTHORIZED'
  | 'TURN_IN_PROGRESS'

export interface Messages {
  assistantName: string
  readyToHelp: string
  minimize: string
  close: string
  answeringAbout: string
  thisOpportunity: string
  currentOpportunity: string
  exploreOpportunity: string
  suggestions: string[]
  thinking: string
  sources: string
  inputPlaceholder: string
  askQuestion: string
  askByVoice: string
  sendVoiceQuestion: string
  sendQuestion: string
  footer: string
  askAi: string
  open: (name: string) => string
  errorTitle: string
  tryAgain: string
  opening: string
  voice: {
    connecting: string
    queued: (position: number | null) => string
    ready: string
    recording: string
    processing: string
    speaking: string
    skip: string
    end: string
  }
  errors: Record<ErrorKey, string>
}

const en: Messages = {
  assistantName: 'Opportunity Assistant',
  readyToHelp: 'Ready to help',
  minimize: 'Minimize assistant',
  close: 'Close assistant',
  answeringAbout: 'Answering about',
  thisOpportunity: 'this opportunity',
  currentOpportunity: 'Current opportunity',
  exploreOpportunity: 'Explore this opportunity',
  suggestions: [
    'What is the application deadline?',
    'Who is eligible?',
    'How much funding is available?',
    'What documents are required?',
    'What are the main objectives?',
    'How do I apply?',
  ],
  thinking: 'Thinking through the opportunity',
  sources: 'Sources',
  inputPlaceholder: 'Ask about this opportunity...',
  askQuestion: 'Ask a question',
  askByVoice: 'Ask by voice',
  sendVoiceQuestion: 'Send voice question',
  sendQuestion: 'Send question',
  footer: 'Answers are based on the documents for this opportunity',
  askAi: 'Ask AI',
  open: (name) => `Open ${name}`,
  errorTitle: 'Something went wrong.',
  tryAgain: 'Try again',
  opening:
    "Hello. I'm here to help you make sense of this opportunity. Ask me about eligibility, deadlines, funding, or the application process and I'll point you to the relevant details.",
  voice: {
    connecting: 'Connecting to the voice assistant...',
    queued: (position) =>
      position ? `All voice sessions are busy. You are number ${position} in the queue.` : 'All voice sessions are busy. You are in the queue.',
    ready: 'Tap the microphone to ask your question.',
    recording: 'Listening... tap the microphone to send.',
    processing: 'Thinking about your question...',
    speaking: 'Assistant is speaking... tap to skip.',
    skip: 'Skip spoken answer',
    end: 'End voice conversation',
  },
  errors: {
    generic: 'I couldn’t retrieve an answer right now.',
    rateLimited: 'Too many questions in a short time. Please wait a moment and try again.',
    sessionExpired: 'This assistant session has expired. Please reload the page.',
    unreachable: 'The assistant is unreachable right now.',
    MICROPHONE_DENIED: 'Microphone access was denied. Allow the microphone in your browser to talk to the assistant.',
    VOICE_UNAVAILABLE: 'The voice assistant is not available right now.',
    CONNECTION_CLOSED: 'The voice connection was closed.',
    QUEUE_TIMEOUT: 'No voice session became available in time. Please try again later.',
    SESSION_TIMEOUT: 'The maximum voice session duration has been reached.',
    NO_SPEECH: 'I didn’t catch that. Please try again and speak a little closer to the microphone.',
    STT_FAILED: 'I couldn’t understand the recording. Please try again.',
    EMPTY_AUDIO: 'No audio was recorded. Please try again.',
    AUDIO_TOO_LARGE: 'That recording was too long. Please ask a shorter question.',
    AI_UNAVAILABLE: 'I couldn’t retrieve an answer right now. Please try again in a moment.',
    TTS_FAILED: 'The answer is shown above, but it could not be spoken.',
    TTS_UNAVAILABLE: 'The answer is shown above; spoken answers aren’t available in this language.',
    UNAUTHORIZED: 'The voice session could not be authorized. Please try again.',
    TURN_IN_PROGRESS: 'Please wait for the current answer before asking again.',
  },
}

const fr: Messages = {
  assistantName: 'Assistant de l’opportunité',
  readyToHelp: 'Prêt à vous aider',
  minimize: 'Réduire l’assistant',
  close: 'Fermer l’assistant',
  answeringAbout: 'Réponses sur',
  thisOpportunity: 'cette opportunité',
  currentOpportunity: 'Opportunité actuelle',
  exploreOpportunity: 'Explorer cette opportunité',
  suggestions: [
    'Quelle est la date limite de candidature ?',
    'Qui est éligible ?',
    'Quel est le montant du financement ?',
    'Quels documents sont requis ?',
    'Quels sont les objectifs principaux ?',
    'Comment postuler ?',
  ],
  thinking: 'Analyse de l’opportunité en cours',
  sources: 'Sources',
  inputPlaceholder: 'Posez une question sur cette opportunité...',
  askQuestion: 'Poser une question',
  askByVoice: 'Poser une question à voix haute',
  sendVoiceQuestion: 'Envoyer la question vocale',
  sendQuestion: 'Envoyer la question',
  footer: 'Les réponses s’appuient sur les documents de cette opportunité',
  askAi: 'Demander à l’IA',
  open: (name) => `Ouvrir ${name}`,
  errorTitle: 'Une erreur s’est produite.',
  tryAgain: 'Réessayer',
  opening:
    'Bonjour. Je suis là pour vous aider à comprendre cette opportunité. Posez-moi vos questions sur l’éligibilité, les dates limites, le financement ou la candidature, et je vous indiquerai les informations utiles.',
  voice: {
    connecting: 'Connexion à l’assistant vocal...',
    queued: (position) =>
      position
        ? `Toutes les sessions vocales sont occupées. Vous êtes le numéro ${position} dans la file d’attente.`
        : 'Toutes les sessions vocales sont occupées. Vous êtes dans la file d’attente.',
    ready: 'Touchez le micro pour poser votre question.',
    recording: 'Écoute en cours... touchez le micro pour envoyer.',
    processing: 'Réflexion sur votre question...',
    speaking: 'L’assistant parle... touchez pour passer.',
    skip: 'Passer la réponse orale',
    end: 'Terminer la conversation vocale',
  },
  errors: {
    generic: 'Je n’ai pas pu obtenir de réponse pour le moment.',
    rateLimited: 'Trop de questions en peu de temps. Patientez un instant puis réessayez.',
    sessionExpired: 'La session de l’assistant a expiré. Veuillez recharger la page.',
    unreachable: 'L’assistant est injoignable pour le moment.',
    MICROPHONE_DENIED: 'L’accès au micro a été refusé. Autorisez le micro dans votre navigateur pour parler à l’assistant.',
    VOICE_UNAVAILABLE: 'L’assistant vocal n’est pas disponible pour le moment.',
    CONNECTION_CLOSED: 'La connexion vocale a été fermée.',
    QUEUE_TIMEOUT: 'Aucune session vocale ne s’est libérée à temps. Réessayez plus tard.',
    SESSION_TIMEOUT: 'La durée maximale de la session vocale est atteinte.',
    NO_SPEECH: 'Je n’ai pas entendu. Réessayez en parlant un peu plus près du micro.',
    STT_FAILED: 'Je n’ai pas compris l’enregistrement. Veuillez réessayer.',
    EMPTY_AUDIO: 'Aucun son n’a été enregistré. Veuillez réessayer.',
    AUDIO_TOO_LARGE: 'L’enregistrement était trop long. Posez une question plus courte.',
    AI_UNAVAILABLE: 'Je n’ai pas pu obtenir de réponse. Réessayez dans un instant.',
    TTS_FAILED: 'La réponse est affichée ci-dessus, mais elle n’a pas pu être lue à voix haute.',
    TTS_UNAVAILABLE: 'La réponse est affichée ci-dessus ; la lecture à voix haute n’est pas disponible dans cette langue.',
    UNAUTHORIZED: 'La session vocale n’a pas pu être autorisée. Veuillez réessayer.',
    TURN_IN_PROGRESS: 'Attendez la fin de la réponse en cours avant de poser une autre question.',
  },
}

const ar: Messages = {
  assistantName: 'مساعد الفرصة',
  readyToHelp: 'جاهز للمساعدة',
  minimize: 'تصغير المساعد',
  close: 'إغلاق المساعد',
  answeringAbout: 'إجابات حول',
  thisOpportunity: 'هذه الفرصة',
  currentOpportunity: 'الفرصة الحالية',
  exploreOpportunity: 'استكشف هذه الفرصة',
  suggestions: [
    'ما هو الموعد النهائي للتقديم؟',
    'من يحق له التقديم؟',
    'ما هو مبلغ التمويل المتاح؟',
    'ما هي الوثائق المطلوبة؟',
    'ما هي الأهداف الرئيسية؟',
    'كيف أقدم طلبي؟',
  ],
  thinking: 'جارٍ تحليل الفرصة',
  sources: 'المصادر',
  inputPlaceholder: 'اسأل عن هذه الفرصة...',
  askQuestion: 'اطرح سؤالًا',
  askByVoice: 'اسأل بالصوت',
  sendVoiceQuestion: 'إرسال السؤال الصوتي',
  sendQuestion: 'إرسال السؤال',
  footer: 'تستند الإجابات إلى وثائق هذه الفرصة',
  askAi: 'اسأل الذكاء الاصطناعي',
  open: (name) => `فتح ${name}`,
  errorTitle: 'حدث خطأ ما.',
  tryAgain: 'إعادة المحاولة',
  opening:
    'مرحبًا. أنا هنا لمساعدتك على فهم هذه الفرصة. اسألني عن شروط الأهلية أو المواعيد النهائية أو التمويل أو طريقة التقديم، وسأرشدك إلى المعلومات المناسبة.',
  voice: {
    connecting: 'جارٍ الاتصال بالمساعد الصوتي...',
    queued: (position) =>
      position ? `جميع الجلسات الصوتية مشغولة. ترتيبك في قائمة الانتظار: ${position}.` : 'جميع الجلسات الصوتية مشغولة. أنت في قائمة الانتظار.',
    ready: 'اضغط على الميكروفون لطرح سؤالك.',
    recording: 'جارٍ الاستماع... اضغط على الميكروفون للإرسال.',
    processing: 'جارٍ التفكير في سؤالك...',
    speaking: 'المساعد يتحدث... اضغط للتخطي.',
    skip: 'تخطي الإجابة الصوتية',
    end: 'إنهاء المحادثة الصوتية',
  },
  errors: {
    generic: 'تعذر الحصول على إجابة الآن.',
    rateLimited: 'أسئلة كثيرة في وقت قصير. يرجى الانتظار قليلًا ثم المحاولة مجددًا.',
    sessionExpired: 'انتهت صلاحية جلسة المساعد. يرجى إعادة تحميل الصفحة.',
    unreachable: 'يتعذر الوصول إلى المساعد الآن.',
    MICROPHONE_DENIED: 'تم رفض الوصول إلى الميكروفون. اسمح باستخدام الميكروفون في متصفحك للتحدث مع المساعد.',
    VOICE_UNAVAILABLE: 'المساعد الصوتي غير متاح الآن.',
    CONNECTION_CLOSED: 'تم إغلاق الاتصال الصوتي.',
    QUEUE_TIMEOUT: 'لم تتوفر جلسة صوتية في الوقت المحدد. يرجى المحاولة لاحقًا.',
    SESSION_TIMEOUT: 'تم بلوغ الحد الأقصى لمدة الجلسة الصوتية.',
    NO_SPEECH: 'لم أسمعك جيدًا. حاول مرة أخرى وتحدث بالقرب من الميكروفون.',
    STT_FAILED: 'لم أتمكن من فهم التسجيل. يرجى المحاولة مجددًا.',
    EMPTY_AUDIO: 'لم يتم تسجيل أي صوت. يرجى المحاولة مجددًا.',
    AUDIO_TOO_LARGE: 'التسجيل طويل جدًا. يرجى طرح سؤال أقصر.',
    AI_UNAVAILABLE: 'تعذر الحصول على إجابة الآن. يرجى المحاولة بعد قليل.',
    TTS_FAILED: 'الإجابة معروضة أعلاه، لكن تعذر نطقها.',
    TTS_UNAVAILABLE: 'الإجابة معروضة أعلاه؛ الإجابات الصوتية غير متاحة بهذه اللغة.',
    UNAUTHORIZED: 'تعذر التحقق من الجلسة الصوتية. يرجى المحاولة مجددًا.',
    TURN_IN_PROGRESS: 'يرجى انتظار انتهاء الإجابة الحالية قبل طرح سؤال جديد.',
  },
}

export const MESSAGES: Record<Locale, Messages> = { en, fr, ar }
