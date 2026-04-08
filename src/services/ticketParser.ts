import { extractModifiers } from '@/data/modifiers'
import { searchMenu } from './menuSearch'
import type { TicketItem, TicketModifier } from '@/types'

export type TicketCommand =
  | { type: 'add_item'; item: TicketItem }
  | { type: 'remove_seat'; seat: number }
  | { type: 'remove_item'; itemName: string }
  | { type: 'add_modifier'; seat: number; modifier: TicketModifier }
  | { type: 'send' }
  | { type: 'cancel' }

const SEND_PATTERN = /\b(send it|fire it|that'?s it|send the order|fire the order)\b/i
const CANCEL_PATTERN = /\b(cancel|never mind|nevermind|scratch that)\b/i
const REMOVE_SEAT_PATTERN = /\bremove seat (\d+)\b/i
const REMOVE_ITEM_PATTERN = /\bremove (?:the )?(.+)/i
const ADD_MOD_PATTERN = /\badd (.+) to seat (\d+)\b/i

export function parseTicketUtterance(utterance: string): TicketCommand | null {
  const text = utterance.trim()

  if (SEND_PATTERN.test(text)) return { type: 'send' }
  if (CANCEL_PATTERN.test(text)) return { type: 'cancel' }

  const removeSeat = text.match(REMOVE_SEAT_PATTERN)
  if (removeSeat) return { type: 'remove_seat', seat: parseInt(removeSeat[1]) }

  const removeItem = text.match(REMOVE_ITEM_PATTERN)
  if (removeItem && !removeSeat) return { type: 'remove_item', itemName: removeItem[1] }

  const addMod = text.match(ADD_MOD_PATTERN)
  if (addMod) {
    const { modifiers } = extractModifiers(addMod[1])
    if (modifiers.length > 0) {
      return { type: 'add_modifier', seat: parseInt(addMod[2]), modifier: modifiers[0] }
    }
  }

  const item = parseTicketItem(text)
  if (item) return { type: 'add_item', item }

  return null
}

function parseTicketItem(text: string): TicketItem | null {
  let remaining = text

  // 1. Extract seat number
  let seat = 0
  const seatMatch = remaining.match(/\bseat (\d+)\b/i)
  if (seatMatch) {
    seat = parseInt(seatMatch[1])
    remaining = remaining.replace(seatMatch[0], '').trim()
  }

  // 2. Extract leading quantity
  let quantity = 1
  const qtyMatch = remaining.match(/^(\d+)\s+/)
  if (qtyMatch) {
    quantity = parseInt(qtyMatch[1])
    remaining = remaining.slice(qtyMatch[0].length)
  }

  // 3. Greedy-subtract modifiers (longest first)
  const { modifiers, remaining: afterMods } = extractModifiers(remaining)

  // 4. Remaining text = menu item name
  const menuQuery = afterMods.trim()
  if (!menuQuery) return null

  // 5. Resolve against menu
  const menuResult = searchMenu(menuQuery)

  return {
    seat,
    quantity,
    menuItemName: menuResult?.name ?? titleCase(menuQuery),
    menuItemPrice: menuResult?.price ?? null,
    modifiers,
    rawUtterance: text,
  }
}

function titleCase(str: string): string {
  return str.replace(/\b\w/g, c => c.toUpperCase())
}
