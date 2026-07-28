export type CommandState = 'idle' | 'listening' | 'processing' | 'responding'

export type ResponseType = 'success' | 'info' | 'confirm' | 'error'

export type TableStatusType = 'open' | 'active' | 'attention' | 'closed'

export type MessageType = 'alert' | 'manager' | 'info'

export type StaffRole = 'server' | 'manager' | 'kitchen' | 'host'

export interface CommandResponse {
  text: string
  type: ResponseType
  requiresConfirmation: boolean
}

export interface TableSession {
  tableNumber: string
  section: string
  status: TableStatusType
  guestCount: number
  checkTotal: number
  itemCount: number
  openedAt: string | null
  closedAt: string | null
  serverId: string | null
}

export interface FeedMessage {
  id: string
  senderName: string
  messageText: string
  messageType: MessageType
  timestamp: string
  isRead: boolean
}

export interface StaffSession {
  staffId: string
  staffName: string
  role: StaffRole
  shiftStart: string
  shiftEnd: string | null
  isActive: boolean
}

export interface CommandQueueItem {
  id: string
  transcription: string
  intent: string | null
  timestamp: string
  isSent: boolean
  response: string | null
  responseType: ResponseType | null
}

// --- Ticket types ---

// Lifecycle: building (dictating) -> sent (saved, server walking to POS) -> done (entered in SHIFT4).
// 'sent' is the captured-but-not-yet-entered state; named for backward compatibility with the
// vox_tickets.status text column already in use.
export type TicketStatus = 'building' | 'sent' | 'done' | 'cancelled'

export type OrderType = 'dine_in' | 'to_go'

export type ModifierCategory = 'cook_temp' | 'meat' | 'side' | 'bread'

export interface TicketModifier {
  text: string
  category: ModifierCategory
}

export interface TicketItem {
  seat: number
  quantity: number
  menuItemName: string
  menuItemPrice: number | null
  modifiers: TicketModifier[]
  rawUtterance: string
}

export interface Ticket {
  tableNumber: string
  serverName: string
  serverId: string
  guestCount: number
  orderType: OrderType
  items: TicketItem[]
  status: TicketStatus
  createdAt: string
  /** Client-side identity, minted at startTicket. The sync queue reconciles the
   *  server row id onto this key after an offline send (echo reconciliation). */
  localKey?: string
  /** True while the ticket is captured locally but not yet in vox_tickets --
   *  rendered as "saved on phone, waiting for network", never as a failure. */
  pendingSync?: boolean
}

// --- KDS (Kitchen Display System) types ---

export type KDSStatus = 'sent' | 'cooking' | 'ready' | 'served'

export interface KDSTicket {
  id: string
  tableNumber: string
  serverName: string
  guestCount: number
  orderType: OrderType
  items: TicketItem[]
  status: KDSStatus
  createdAt: string
  statusChangedAt: string
}
