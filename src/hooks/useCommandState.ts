import { useState, useRef, useCallback, useEffect } from 'react'
import type { CommandState, CommandResponse } from '@/types'
import { APP_CONFIG } from '@/lib/constants'
import { Haptics } from '@/lib/haptics'
import { SpeechService } from '@/services/speechService'
import { parseCommand } from '@/services/commandParser'
import { classifyTranscript, CLASSIFY_CONFIDENCE_THRESHOLD } from '@/services/classifyService'
import { grammarSync } from '@/services/grammar'
import { repairTranscript, describeRepairs, vocabFor } from '@/services/repair'
import { executeCommand, type ExecutorContext } from '@/services/commandExecutor'
import { logCommand, flagCommandWrong } from '@/services/commandLogger'
import { useAuth, type StaffMember } from '@/contexts/AuthContext'
import { useTableSessions } from './useTableSessions'
import { useEightySix } from './useEightySix'
import { useMessages } from './useMessages'
import { useTicket } from './useTicket'

export function useCommandState() {
  const { staff } = useAuth()
  const { tables, seatTable, clearTable, closeTable } = useTableSessions()
  const { items: eightySixItems, eightySix, unEightySix } = useEightySix()
  const { sendMessage } = useMessages()
  const ticketHook = useTicket(staff)

  const [state, setState] = useState<CommandState>('idle')
  const [transcription, setTranscription] = useState('')
  const [response, setResponse] = useState<CommandResponse | null>(null)
  const [showResponse, setShowResponse] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(true)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speechRef = useRef<SpeechService | null>(null)
  const finalTranscriptRef = useRef('')
  const latestTranscriptRef = useRef('')
  const errorShownRef = useRef(false)
  const lastCommandIdRef = useRef<string | null>(null)

  // Keep refs current for async processTranscript
  const staffRef = useRef<StaffMember | null>(staff)
  const ctxRef = useRef<ExecutorContext | null>(null)
  const ticketRef = useRef(ticketHook)

  useEffect(() => { staffRef.current = staff }, [staff])
  useEffect(() => { ticketRef.current = ticketHook })
  useEffect(() => {
    if (!staff) { ctxRef.current = null; return }
    ctxRef.current = {
      staff,
      tables,
      eightySixItems,
      onSeatTable: seatTable,
      onClearTable: clearTable,
      onCloseTable: closeTable,
      onEightySix: eightySix,
      onUnEightySix: unEightySix,
      onSendMessage: sendMessage,
    }
  }, [staff, tables, eightySixItems, seatTable, clearTable, closeTable, eightySix, unEightySix, sendMessage])

  // Initialize speech service
  useEffect(() => {
    const service = new SpeechService(APP_CONFIG.silenceTimeoutMs)
    speechRef.current = service
    setSpeechSupported(service.isSupported)

    service.subscribe(
      (text, isFinal) => {
        if (isFinal) finalTranscriptRef.current = text
        latestTranscriptRef.current = text
        setTranscription(text)
      },
      (speechState) => {
        if (speechState === 'error') {
          // Mic blocked / recognition failed. Fail LOUD -- the core action must never
          // dead-tap silently. Surface a message via the normal response path.
          setTranscription('')
          finalTranscriptRef.current = ''
          latestTranscriptRef.current = ''
          errorShownRef.current = true
          setResponse({
            text: 'Microphone blocked. Turn on mic access for Vox in your phone settings, then tap again.',
            type: 'error',
            requiresConfirmation: false,
          })
          setShowResponse(true)
          setState('responding')
          setTimeout(() => {
            setShowResponse(false)
            setTimeout(() => {
              setState('idle')
              setResponse(null)
              errorShownRef.current = false
            }, 300)
          }, APP_CONFIG.responseDismissMs)
          return
        }
        if (speechState === 'idle') {
          if (errorShownRef.current) return // don't clobber the error message with an idle reset
          const transcript = finalTranscriptRef.current || latestTranscriptRef.current
          if (transcript) {
            processTranscript(transcript)
          } else {
            setState('idle')
          }
        }
      }
    )

    return () => service.stop()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clearDismissTimer = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current)
      dismissTimer.current = null
    }
  }, [])

  const dismissResponse = useCallback(() => {
    clearDismissTimer()
    setShowResponse(false)
    setTimeout(() => {
      setState('idle')
      setResponse(null)
    }, 300)
  }, [clearDismissTimer])

  const processTranscript = useCallback(async (rawTranscript: string) => {
    setState('processing')
    Haptics.medium()

    const ctx = ctxRef.current
    if (!ctx) {
      setResponse({ text: 'Not logged in.', type: 'error', requiresConfirmation: false })
      setShowResponse(true)
      setState('responding')
      return
    }

    // Deterministic transcript repair BEFORE anything parses (offline, against
    // the bundled grammar). Every repair is visible: the transcription line
    // updates to what we USED, annotated with what we HEARD -- a repaired
    // utterance must never read as if the server said it.
    let transcript = rawTranscript
    const grammar = grammarSync()
    if (grammar) {
      const r = repairTranscript(rawTranscript, vocabFor(grammar))
      if (r.changed) {
        transcript = r.text
        setTranscription(`${r.text}  (${describeRepairs(r)})`)
      }
    }

    const t = ticketRef.current

    // --- Ticket mode: route utterances to ticket handler ---
    if (t.isActive) {
      const result = t.processUtterance(transcript)

      if (result === 'SEND') {
        const success = await t.sendTicket()
        logCommand(
          { intent: 'ticket_send', entities: {}, confidence: 1, rawTranscript: transcript },
          { text: success ? 'Saved' : 'Failed', type: success ? 'success' : 'error', requiresConfirmation: false },
          ctx.staff,
          'ticket',
        ).catch(() => {})

        if (success) {
          Haptics.success()
        } else {
          Haptics.error()
          setResponse({ text: 'Failed to save ticket', type: 'error', requiresConfirmation: false })
          setShowResponse(true)
          setState('responding')
          dismissTimer.current = setTimeout(dismissResponse, APP_CONFIG.responseDismissMs)
        }
        // Stay idle; the ticket UI remains visible with the Done button.
        setState('idle')
        return
      }

      if (result === 'CANCEL') {
        logCommand(
          { intent: 'ticket_cancel', entities: {}, confidence: 1, rawTranscript: transcript },
          { text: 'Order cancelled', type: 'info', requiresConfirmation: false },
          ctx.staff,
          'ticket',
        ).catch(() => {})
        Haptics.light()
        setState('idle')
        return
      }

      // Item added/removed/modified -- no response card, ticket view shows the change
      logCommand(
        { intent: 'ticket_item', entities: {}, confidence: 1, rawTranscript: transcript },
        { text: result, type: 'info', requiresConfirmation: false },
        ctx.staff,
        'ticket',
      ).then((id) => { if (id) lastCommandIdRef.current = id }).catch(() => {})
      Haptics.success()
      setState('idle')
      return
    }

    // --- Normal mode ---
    let parsed = parseCommand(transcript)
    let source: 'regex' | 'llm' = 'regex'

    // LLM fallback: when the regex can't read the utterance, ask the on-Mini
    // classifier. Inert (returns null) until VITE_VOX_CLASSIFY_URL is set, so
    // until the tunnel is live this is a no-op and unknowns go to the Feed.
    if (parsed.intent === 'unknown' || parsed.confidence < CLASSIFY_CONFIDENCE_THRESHOLD) {
      const llm = await classifyTranscript(transcript)
      if (llm) {
        parsed = llm
        source = 'llm'
      }
    }

    // Intercept ticket_start before executor
    if (parsed.intent === 'ticket_start') {
      const table = parsed.entities.table_number
      const guests = parseInt(parsed.entities.guest_count) || 2
      t.startTicket(table, guests)
      logCommand(
        parsed,
        { text: `Ticket started: ${table}`, type: 'success', requiresConfirmation: false },
        ctx.staff,
        source,
      ).then((id) => { if (id) lastCommandIdRef.current = id }).catch(() => {})
      Haptics.success()
      setState('idle')
      return
    }

    const commandResponse = await executeCommand(parsed, ctx)

    // Log every command for training + the post-fix unknown-rate metric
    logCommand(parsed, commandResponse, ctx.staff, source)
      .then((id) => { if (id) lastCommandIdRef.current = id }).catch(() => {})

    setResponse(commandResponse)
    setShowResponse(true)
    setState('responding')

    if (commandResponse.type === 'success') Haptics.success()
    if (commandResponse.type === 'error') Haptics.error()

    if (!commandResponse.requiresConfirmation) {
      dismissTimer.current = setTimeout(dismissResponse, APP_CONFIG.responseDismissMs)
    }
  }, [dismissResponse, sendMessage])

  const startListening = useCallback(() => {
    setState('listening')
    setTranscription('')
    setResponse(null)
    setShowResponse(false)
    errorShownRef.current = false
    finalTranscriptRef.current = ''
    latestTranscriptRef.current = ''
    Haptics.light()

    if (speechRef.current?.isSupported) {
      speechRef.current.start()
    } else {
      mockVoice(setTranscription, (text) => {
        finalTranscriptRef.current = text
        processTranscript(text)
      })
    }
  }, [processTranscript])

  const stopListening = useCallback(() => {
    if (state !== 'listening') return
    speechRef.current?.stop()
    Haptics.medium()

    const transcript = finalTranscriptRef.current || transcription
    if (transcript) {
      processTranscript(transcript)
    } else {
      setState('idle')
    }
  }, [state, transcription, processTranscript])

  const confirmAction = useCallback(() => {
    Haptics.heavy()
    setResponse(prev => prev ? { ...prev, text: prev.text.split('\n')[0], type: 'success', requiresConfirmation: false } : null)
    dismissTimer.current = setTimeout(dismissResponse, 2000)
  }, [dismissResponse])

  const cancelAction = useCallback(() => {
    Haptics.light()
    dismissResponse()
  }, [dismissResponse])

  // One-tap ground-truth: flag the most-recently-logged command as a wrong parse.
  const markLastWrong = useCallback(async () => {
    const id = lastCommandIdRef.current
    if (!id) return false
    Haptics.medium()
    return flagCommandWrong(id)
  }, [])

  return {
    state,
    transcription,
    response,
    showResponse,
    speechSupported,
    startListening,
    stopListening,
    confirmAction,
    cancelAction,
    dismissResponse,
    markLastWrong,
    // Ticket
    ticket: ticketHook.ticket,
    ticketActive: ticketHook.isActive,
    isTicketOpen: ticketHook.isOpen,
    ticketStatus: ticketHook.statusText,
    startTicket: ticketHook.startTicket,
    addItemManually: ticketHook.addItemManually,
    cancelTicket: ticketHook.cancelTicket,
    sendTicket: ticketHook.sendTicket,
    markTicketDone: ticketHook.markDone,
  }
}

function mockVoice(
  onPartial: (text: string) => void,
  onFinal: (text: string) => void,
) {
  const words = ['What', 'is', 'the', 'potato', 'chip', 'chicken']
  let accumulated = ''
  let i = 0

  const tick = () => {
    if (i >= words.length) {
      setTimeout(() => onFinal(accumulated), 1500)
      return
    }
    accumulated += (accumulated ? ' ' : '') + words[i]
    onPartial(accumulated)
    i++
    setTimeout(tick, 300)
  }
  tick()
}
