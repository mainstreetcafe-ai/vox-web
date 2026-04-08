import type { ResponseType } from '@/types'

interface Props {
  text: string
  type: ResponseType
  onConfirm?: () => void
  onCancel?: () => void
  onDismiss?: () => void
}

const borderColors: Record<ResponseType, string> = {
  success: 'border-success',
  info: 'border-gray-dim',
  confirm: 'border-maroon',
  error: 'border-error',
}

export function ResponseCard({ text, type, onConfirm, onCancel, onDismiss }: Props) {
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
    </div>
  )
}
