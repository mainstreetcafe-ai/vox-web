import { useState, useRef, useCallback, useEffect } from 'react'
import type { CommandState, CommandResponse } from '@/types'
import { APP_CONFIG } from '@/lib/constants'
import { Haptics } from '@/lib/haptics'
import { SpeechService } from '@/services/speechService'
import { parseCommand } from '@/services/commandParser'
import { executeCommand, type ExecutorContext } from '@/services/commandExecutor'
import { logCommand } from '@/services/commandLogger'
import { useAuth, type StaffMember } from '@/contexts/AuthContext'
import { useTableSessions } from './useTableSessions'
import { useEightySix } from './useEightySix'
import { useMessages } from './useMessages'

export function useCommandState() {
  const { staff } = useAuth()
  const { tables, seatTable, clearTable, closeTable } = useTableSessions()
  const { items: eightySixItems, eightySix, unEightySix } = useEightySix()
  const { sendMessage } = useMessages()

  const [state, setState] = useState<CommandState>('idle')
  const [transcription, setTranscription] = useState('')
  const [response, setResponse] = useState<CommandResponse | null>(null)
  const [showResponse, setShowResponse] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(true)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speechRef = useRef<SpeechService | null>(null)
  const finalTranscriptRef = useRef('')

  // Keep refs current for async processTranscript
  const staffRef = useRef<StaffMember | null>(staff)
  const ctxRef = useRef<ExecutorContext | null>(null)

  useEffect(() => { staffRef.current = staff }, [staff])
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
        setTranscription(text)
      },
      (speechState) => {
        if (speechState === 'idle') {
          const transcript = finalTranscriptRef.current
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

  const processTranscript = useCallback(async (transcript: string) => {
    setState('processing')
    Haptics.medium()

    const ctx = ctxRef.current
    if (!ctx) {
      setResponse({ text: 'Not logged in.', type: 'error', requiresConfirmation: false })
      setShowResponse(true)
      setState('responding')
      return
    }

    const parsed = parseCommand(transcript)
    const commandResponse = await executeCommand(parsed, ctx)

    // Log every command for training
    logCommand(parsed, commandResponse, ctx.staff).catch(() => {})

    setResponse(commandResponse)
    setShowResponse(true)
    setState('responding')

    if (commandResponse.type === 'success') Haptics.success()
    if (commandResponse.type === 'error') Haptics.error()

    if (!commandResponse.requiresConfirmation) {
      dismissTimer.current = setTimeout(dismissResponse, APP_CONFIG.responseDismissMs)
    }
  }, [dismissResponse])

  const startListening = useCallback(() => {
    setState('listening')
    setTranscription('')
    setResponse(null)
    setShowResponse(false)
    finalTranscriptRef.current = ''
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
