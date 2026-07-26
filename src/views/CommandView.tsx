import { useState, useEffect } from 'react'
import { BreathingRing } from '@/components/BreathingRing'
import { QuickDrinks } from '@/components/QuickActions'
import { ItemPicker } from '@/components/ItemPicker'
import { OPEN_TABLE_EVENT, type OpenTableDetail } from '@/services/tableActions'
import { ResponseCard } from '@/components/ResponseCard'
import { TicketView } from '@/components/TicketView'
import { useCommandState } from '@/hooks/useCommandState'

export function CommandView() {
  const cmd = useCommandState()
  // One-tap "wrong" for the last ticket entry; resets when a new utterance starts.
  const [ticketWrong, setTicketWrong] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  useEffect(() => { if (cmd.state === 'listening') setTicketWrong(false) }, [cmd.state])

  // The floor view dispatches "open this table"; the ticket lives here, so act on it.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<OpenTableDetail>).detail
      if (d?.table) cmd.startTicket(d.table, d.party)
    }
    window.addEventListener(OPEN_TABLE_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_TABLE_EVENT, onOpen)
  }, [cmd])

  const handleRingTap = () => {
    if (cmd.state === 'idle' || cmd.state === 'responding') {
      cmd.startListening()
    } else if (cmd.state === 'listening') {
      cmd.stopListening()
    }
  }

  const ringState = cmd.state === 'listening' ? 'listening'
    : cmd.state === 'processing' ? 'processing'
    : cmd.ticketActive ? 'ticket'
    : 'idle'

  // --- Ticket mode layout ---
  // Shown while building (mini-ring active) AND after save (read-only with Done button).
  if (cmd.isTicketOpen && cmd.ticket) {
    const isSaved = cmd.ticket.status === 'sent'
    return (
      <div className="h-full flex flex-col relative">
        {/* Ticket view -- top ~65% while building, full while saved */}
        <div className={`${isSaved ? 'flex-1' : 'flex-[65]'} overflow-y-auto px-4 pt-4 pb-2`}>
          <TicketView
            ticket={cmd.ticket}
            onSend={cmd.sendTicket}
            onCancel={cmd.cancelTicket}
            onDone={cmd.markTicketDone}
          />
        </div>

        {/* Button path -- works with no network and no speech (the floor of the system). */}
        {!isSaved && (
          <div className="px-4 pb-2 shrink-0">
            <QuickDrinks onAdd={(name, qty) => cmd.addItemManually(name, qty, [])} />
            <button
              onClick={() => setPickerOpen(true)}
              className="w-full mt-2 min-h-[48px] rounded-xl bg-surface active:bg-surface-hover
                         border border-white/5 text-white text-[15px] font-medium"
            >
              Add item from menu
            </button>
          </div>
        )}

        {pickerOpen && (
          <ItemPicker
            onClose={() => setPickerOpen(false)}
            onAdd={(name, qty, mods) => { cmd.addItemManually(name, qty, mods); setPickerOpen(false) }}
          />
        )}

        {/* Mini ring + status -- only while building. After save the Done button is the exit. */}
        {!isSaved && (
          <div className="flex-[35] flex flex-col items-center justify-center pb-4">
            {(cmd.state === 'listening' || cmd.state === 'processing') && (
              <p
                className={`text-base text-center mb-2 transition-opacity duration-300 max-w-[85%] min-h-[22px] ${
                  cmd.state === 'processing' ? 'opacity-50' : 'opacity-100'
                }`}
              >
                {cmd.transcription || '\u00A0'}
              </p>
            )}

            {cmd.state === 'processing' && (
              <p className="text-gray text-[11px] mb-1">Processing...</p>
            )}

            <BreathingRing state={ringState} onTap={handleRingTap} />

            <p className="text-gray text-[13px] mt-2">{cmd.ticketStatus}</p>
            <button
              onClick={() => { if (!ticketWrong) { setTicketWrong(true); cmd.markLastWrong() } }}
              className={`mt-1 text-[11px] uppercase tracking-widest ${
                ticketWrong ? 'text-success' : 'text-gray-dim active:text-error'
              }`}
            >
              {ticketWrong ? 'Flagged - thanks' : 'Last entry wrong?'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // --- Normal mode layout (unchanged) ---
  return (
    <div className="h-full flex flex-col items-center relative px-4">
      {/* Speech support warning */}
      {!cmd.speechSupported && cmd.state === 'idle' && (
        <p className="text-gray-dim text-xs absolute top-4">
          Speech not supported -- using demo mode
        </p>
      )}

      {/* Center section: transcription + ring */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Transcription */}
        {(cmd.state === 'listening' || cmd.state === 'processing') && (
          <p
            className={`text-xl text-center mb-6 transition-opacity duration-300 min-h-[28px] max-w-[90%] ${
              cmd.state === 'processing' ? 'opacity-50' : 'opacity-100'
            }`}
          >
            {cmd.transcription || '\u00A0'}
          </p>
        )}

        {cmd.state === 'processing' && (
          <p className="text-gray text-[13px] mb-2">Processing...</p>
        )}

        {/* Ring */}
        <BreathingRing state={ringState} onTap={handleRingTap} />
      </div>

      {/* Button path on the idle screen -- the emptiest real estate in the app, and
          the fallback when speech or the tailnet is unavailable. */}
      {cmd.state === 'idle' && !cmd.showResponse && !cmd.isTicketOpen && (
        <div className="w-full px-1 pb-3 shrink-0">
          <QuickDrinks onAdd={(name, qty) => cmd.addItemManually(name, qty, [])} />
        </div>
      )}

      {/* Swipe wayfinding -- only while idle, matching the hints on Dashboard + Feed */}
      {cmd.state === 'idle' && !cmd.showResponse && (
        <p className="text-gray-dim/60 text-xs text-center mb-2">
          Swipe right for the floor -- left for the feed
        </p>
      )}

      {/* Wordmark */}
      <p
        className="text-gray-dim/40 text-base tracking-[6px] uppercase mb-8"
        style={{ fontFamily: "'SF Pro Rounded', -apple-system, system-ui, sans-serif", fontWeight: 300 }}
      >
        VOX
      </p>

      {/* Response card */}
      {cmd.showResponse && cmd.response && (
        <div
          className="absolute bottom-6 left-4 right-4 transition-all duration-300"
          style={{
            animation: 'slideUp 0.3s ease-out',
          }}
        >
          <ResponseCard
            text={cmd.response.text}
            type={cmd.response.type}
            onConfirm={cmd.confirmAction}
            onCancel={cmd.cancelAction}
            onDismiss={cmd.dismissResponse}
            onFlagWrong={cmd.markLastWrong}
          />
        </div>
      )}
    </div>
  )
}
