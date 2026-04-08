import { MessageCard } from '@/components/MessageCard'
import { useMessages } from '@/hooks/useMessages'

export function FeedView() {
  const { messages, isLoading } = useMessages()

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-white text-2xl font-bold leading-tight">Feed</h1>
        <p className="text-gray text-[13px] mt-1">Kitchen + manager alerts</p>
      </div>

      {/* Messages */}
      {isLoading ? (
        <p className="text-gray-dim text-[13px] text-center pt-10">Loading...</p>
      ) : messages.length > 0 ? (
        <div className="flex flex-col gap-2.5 px-4 pb-4">
          {messages.map(msg => (
            <MessageCard key={msg.id} message={msg} />
          ))}
        </div>
      ) : (
        <div className="text-center pt-20">
          <p className="text-gray text-base">No messages yet</p>
          <p className="text-gray-dim text-[13px] mt-1">Kitchen and manager alerts will appear here</p>
        </div>
      )}

      {/* Footer hint */}
      <p className="text-gray-dim/60 text-xs text-center pt-5 pb-10">
        Swipe right for voice commands
      </p>
    </div>
  )
}
