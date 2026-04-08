import type { FeedMessage } from '@/types'
import { relativeTime } from '@/lib/time'

interface Props {
  message: FeedMessage
}

const dotColorMap = {
  alert: 'bg-error',
  manager: 'bg-maroon',
  info: 'bg-gray-dim',
}

export function MessageCard({ message }: Props) {
  return (
    <div className="bg-surface rounded-xl px-[18px] py-3.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${dotColorMap[message.messageType]}`} />
          <span className="text-white text-sm font-semibold">{message.senderName}</span>
        </div>
        <span className="text-gray-dim text-[11px]">{relativeTime(message.timestamp)}</span>
      </div>

      {/* Body */}
      <p className="text-gray text-sm leading-relaxed mt-2 pl-4">
        {message.messageText}
      </p>
    </div>
  )
}
