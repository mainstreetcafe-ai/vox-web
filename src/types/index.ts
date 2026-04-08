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
