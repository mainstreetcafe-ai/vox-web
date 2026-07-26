import { useState } from 'react'
import { MessageCard } from '@/components/MessageCard'
import { useMessages } from '@/hooks/useMessages'
import { useEightySix } from '@/hooks/useEightySix'
import { useAuth } from '@/contexts/AuthContext'
import { ItemPicker } from '@/components/ItemPicker'
import { Haptics } from '@/lib/haptics'

export function FeedView() {
  const { messages, isLoading } = useMessages()
  const { staff } = useAuth()
  const { items: eightySixed, eightySix, unEightySix } = useEightySix()
  const [picking, setPicking] = useState(false)

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold leading-tight">Feed</h1>
            <p className="text-gray text-[13px] mt-1">Kitchen + manager alerts</p>
          </div>
          {/* 86 is the most time-critical thing a server ever needs to say --
              it gets a button, not a sentence. */}
          <button
            onClick={() => { Haptics.medium(); setPicking(true) }}
            className="min-h-[44px] px-4 rounded-xl bg-surface border border-error/40
                       text-error text-[14px] font-semibold active:bg-surface-hover"
          >
            86 an item
          </button>
        </div>

        {eightySixed.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {eightySixed.map(i => (
              <button
                key={i.itemName}
                onClick={() => { Haptics.light(); unEightySix(i.itemName) }}
                className="min-h-[36px] px-3 rounded-full bg-error/10 border border-error/40
                           text-error text-[13px]"
              >
                {i.itemName} -- tap to restore
              </button>
            ))}
          </div>
        )}
      </div>

      {picking && (
        <ItemPicker
          onClose={() => setPicking(false)}
          onAdd={name => { eightySix(name, staff?.name ?? 'staff'); setPicking(false) }}
        />
      )}

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
