import { BreathingRing } from '@/components/BreathingRing'
import { ResponseCard } from '@/components/ResponseCard'
import { useCommandState } from '@/hooks/useCommandState'

export function CommandView() {
  const cmd = useCommandState()

  const handleRingTap = () => {
    if (cmd.state === 'idle' || cmd.state === 'responding') {
      cmd.startListening()
    } else if (cmd.state === 'listening') {
      cmd.stopListening()
    }
  }

  const ringState = cmd.state === 'listening' ? 'listening'
    : cmd.state === 'processing' ? 'processing'
    : 'idle'

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
          />
        </div>
      )}
    </div>
  )
}
