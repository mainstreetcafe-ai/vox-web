import { WaveformVisualizer } from './WaveformVisualizer'

type RingState = 'idle' | 'listening' | 'processing'

interface Props {
  state: RingState
  onTap: () => void
}

export function BreathingRing({ state, onTap }: Props) {
  const isIdle = state === 'idle'
  const isListening = state === 'listening'
  const isProcessing = state === 'processing'

  const ringSize = isIdle ? 140 : 180
  const borderWidth = isListening ? 4 : 2

  return (
    <div
      className="relative flex items-center justify-center cursor-pointer"
      style={{ width: 220, height: 220 }}
      onClick={onTap}
    >
      {/* Glow */}
      {!isIdle && (
        <div
          className="absolute rounded-full bg-maroon/15 blur-xl transition-opacity duration-300"
          style={{ width: ringSize + 40, height: ringSize + 40 }}
        />
      )}

      {/* Ring */}
      <div
        className="rounded-full border-maroon flex items-center justify-center transition-all duration-300"
        style={{
          width: ringSize,
          height: ringSize,
          borderWidth,
          borderStyle: 'solid',
          animation: isListening
            ? 'breathe-active 0.4s ease-in-out infinite'
            : isProcessing
              ? 'breathe 1s ease-in-out infinite'
              : 'breathe 0.83s ease-in-out infinite',
        }}
      >
        {isIdle && (
          <span className="text-gray text-[13px] uppercase tracking-widest">
            Tap to speak
          </span>
        )}
        {isListening && <WaveformVisualizer />}
        {isProcessing && (
          <div className="w-6 h-6 border-2 border-maroon border-t-transparent rounded-full animate-spin" />
        )}
      </div>
    </div>
  )
}
