type SpeechCallback = (transcript: string, isFinal: boolean) => void
type StateCallback = (state: 'idle' | 'listening' | 'error') => void

const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)

export class SpeechService {
  private recognition: any | null = null
  private onTranscript: SpeechCallback | null = null
  private onStateChange: StateCallback | null = null
  private silenceTimer: ReturnType<typeof setTimeout> | null = null
  private silenceTimeoutMs: number
  private hasResult = false

  readonly isSupported: boolean

  constructor(silenceTimeoutMs = 2000) {
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
    this.hasResult = false

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    // iOS: continuous mode is unreliable. Use single-utterance mode.
    // Desktop: continuous mode works fine with silence detection.
    recognition.continuous = !isIOS

    recognition.onstart = () => {
      this.onStateChange?.('listening')

      // Safety timeout: if no results after 8 seconds, stop
      this.silenceTimer = setTimeout(() => {
        if (!this.hasResult) {
          this.stop()
        }
      }, 8000)
    }

    recognition.onresult = (event: any) => {
      this.hasResult = true

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

        // On continuous mode, set silence timer after final result
        if (!isIOS) {
          this.resetSilenceTimer()
        }
      } else if (interimTranscript) {
        this.onTranscript?.(interimTranscript.trim(), false)
      }
    }

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        // Not real errors -- just stop gracefully
        this.onStateChange?.('idle')
        return
      }
      console.error('Speech error:', event.error)
      this.onStateChange?.('error')
    }

    recognition.onend = () => {
      this.clearSilenceTimer()
      this.onStateChange?.('idle')
    }

    this.recognition = recognition

    try {
      recognition.start()
    } catch (e) {
      console.error('Speech start failed:', e)
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
