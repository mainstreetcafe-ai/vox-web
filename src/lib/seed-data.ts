import type { TableSession, FeedMessage } from '@/types'

export function seedTables(): TableSession[] {
  return [
    {
      tableNumber: 'B3', section: 'B', status: 'active', guestCount: 2,
      checkTotal: 22.00, itemCount: 3,
      openedAt: new Date(Date.now() - 45 * 60000).toISOString(),
      closedAt: null, serverId: 'maria',
    },
    {
      tableNumber: 'W2', section: 'W', status: 'active', guestCount: 4,
      checkTotal: 47.50, itemCount: 5,
      openedAt: new Date(Date.now() - 28 * 60000).toISOString(),
      closedAt: null, serverId: 'maria',
    },
    {
      tableNumber: 'L5', section: 'L', status: 'attention', guestCount: 6,
      checkTotal: 89.25, itemCount: 8,
      openedAt: new Date(Date.now() - 52 * 60000).toISOString(),
      closedAt: null, serverId: 'maria',
    },
    {
      tableNumber: 'P2', section: 'P', status: 'closed', guestCount: 0,
      checkTotal: 34.75, itemCount: 0,
      openedAt: null,
      closedAt: new Date(Date.now() - 10 * 60000).toISOString(),
      serverId: 'maria',
    },
    { tableNumber: 'E1', section: 'E', status: 'open', guestCount: 0, checkTotal: 0, itemCount: 0, openedAt: null, closedAt: null, serverId: null },
    { tableNumber: 'R5', section: 'R', status: 'open', guestCount: 0, checkTotal: 0, itemCount: 0, openedAt: null, closedAt: null, serverId: null },
  ]
}

export function seedMessages(): FeedMessage[] {
  return [
    {
      id: '1', senderName: 'Kitchen',
      messageText: 'W2 entrees are up. Chicken & Waffles running 5 min behind.',
      messageType: 'alert', timestamp: new Date(Date.now() - 2 * 60000).toISOString(), isRead: false,
    },
    {
      id: '2', senderName: 'Megan',
      messageText: 'VIP at B3, regular customer. Comp the dessert if they ask.',
      messageType: 'manager', timestamp: new Date(Date.now() - 8 * 60000).toISOString(), isRead: false,
    },
    {
      id: '3', senderName: 'Kitchen',
      messageText: '86 the catfish for the rest of the night.',
      messageType: 'alert', timestamp: new Date(Date.now() - 15 * 60000).toISOString(), isRead: true,
    },
    {
      id: '4', senderName: 'Jake',
      messageText: 'Health inspector may come by this week. Keep stations clean.',
      messageType: 'manager', timestamp: new Date(Date.now() - 45 * 60000).toISOString(), isRead: true,
    },
    {
      id: '5', senderName: 'System',
      messageText: 'SHIFT4 daily report ingested. Yesterday gross: $4,218.',
      messageType: 'info', timestamp: new Date(Date.now() - 2 * 3600000).toISOString(), isRead: true,
    },
  ]
}
