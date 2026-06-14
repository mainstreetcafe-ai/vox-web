import { useState } from 'react'
import type { ResponseType } from '@/types'

interface Props {
  text: string
  type: ResponseType
  onConfirm?: () => void
  onCancel?: () => void
  onDismiss?: () => void
  onFlagWrong?: () => void
}

const borderColors: Record<ResponseType, string> = {
  success: 'border-success',
  info: 'border-gray-dim',
  confirm: 'border-maroon',
  error: 'border-error',
}

export function ResponseCard({ text, type, onConfirm, onCancel, onDismiss, onFlagWrong }: Props) {
  const [flagged, setFlagged] = useState(false)

  return (
    <div
      className={`bg-surface rounded-2xl border ${borderColors[type]} px-6 py-5`}
      onClick={type !== 'confirm' ? onDismiss : undefined}
    >
      {type === 'success' && (
        <p className="text-success text-[11px] font-semibold uppercase tracking-widest mb-2">
          Confirmed
        </p>
      )}

      <p className="text-white text-[17px]">{text}</p>

      {type === 'confirm' && (
        <div className="flex gap-3 mt-4">
          <button
            onClick={onConfirm}
            className="flex-1 bg-maroon text-white font-semibold py-3.5 rounded-[10px] text-base active:opacity-80"
          >
            Confirm
          </button>
          <button
            onClick={onCancel}
            className="flex-1 border border-gray-dim text-gray font-semibold py-3.5 rounded-[10px] text-base active:opacity-80"
          >
            Cancel
          </button>
        </div>
      )}

      {/* One-tap ground-truth: flag a wrong parse. Trains the self-improvement loop. */}
      {type !== 'confirm' && onFlagWrong && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (flagged) return
            setFlagged(true)
            onFlagWrong()
          }}
          className={`mt-3 text-[12px] uppercase tracking-widest ${
            flagged ? 'text-success' : 'text-gray-dim active:text-error'
          }`}
        >
          {flagged ? 'Flagged - thanks' : 'Wrong?'}
        </button>
      )}
    </div>
  )
}
