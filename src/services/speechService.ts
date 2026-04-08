type SpeechCallback = (transcript: string, isFinal: boolean) => void
type StateCallback = (state: 'idle' | 'listening' | 'error') => void

const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

export class SpeechService {
  private recognition: any | null = null
  private onTranscript: SpeechCallback | null = null
  private onStateChange: StateCallback | null = null
  private silenceTimer: ReturnType<typeof setTimeout> | null = null
  private silenceTimeoutMs: number

  readonly isSupported: boolean

  constructor(silenceTimeoutMs = 1500) {
    this.isSupported = !!SpeechRecognition
    this.silenceTimeoutMs = silenceTimeoutMs
  }

  subscribe(onTranscript: SpeechCallback, onStateChange: StateCallback) {
    this.onTranscript = onTranscript
    this.onStateChange = onStateChange
  }

  start() {
    if (!this.isSupported) {
      this.onStateChange?.('error')
      return
    }

    this.stop()

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      this.onStateChange?.('listening')
    }

    recognition.onresult = (event: any) => {
      this.resetSilenceTimer()

      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript += result[0].transcript
        } else {
          interimTranscript += result[0].transcript
        }
      }

      if (finalTranscript) {
        this.onTranscript?.(finalTranscript.trim(), true)
      } else if (interimTranscript) {
        this.onTranscript?.(interimTranscript.trim(), false)
      }
    }

    recognition.onerror = (event: any) => {
      // 'no-speech' and 'aborted' are not real errors
      if (event.error === 'no-speech' || event.error === 'aborted') return
      console.error('Speech recognition error:', event.error)
      this.onStateChange?.('error')
    }

    recognition.onend = () => {
      this.clearSilenceTimer()
      this.onStateChange?.('idle')
    }

    this.recognition = recognition

    try {
      recognition.start()
    } catch {
      this.onStateChange?.('error')
    }
  }

  stop() {
    this.clearSilenceTimer()
    if (this.recognition) {
      try { this.recognition.stop() } catch { /* already stopped */ }
      this.recognition = null
    }
  }

  private resetSilenceTimer() {
    this.clearSilenceTimer()
    this.silenceTimer = setTimeout(() => {
      this.stop()
    }, this.silenceTimeoutMs)
  }

  private clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
  }
}
