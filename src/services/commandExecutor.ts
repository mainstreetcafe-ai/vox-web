import { supabase } from '@/lib/supabase'
import { API_CONFIG } from '@/lib/constants'
import type { CommandResponse, TableSession } from '@/types'
import type { StaffMember } from '@/contexts/AuthContext'
import type { ParsedCommand } from './commandParser'
import { searchMenu, formatCategory } from './menuSearch'
import type { EightySixItem } from '@/hooks/useEightySix'

export interface ExecutorContext {
  staff: StaffMember
  tables: TableSession[]
  eightySixItems: EightySixItem[]
  // Callbacks to mutate state
  onSeatTable: (tableNumber: string, guestCount: number, serverId: string) => Promise<void>
  onClearTable: (tableNumber: string) => Promise<void>
  onCloseTable: (tableNumber: string) => Promise<void>
  onEightySix: (itemName: string, staffName: string) => Promise<void>
  onUnEightySix: (itemName: string) => Promise<void>
  onSendMessage: (senderName: string, text: string, type: 'alert' | 'manager' | 'info') => Promise<void>
}

export async function executeCommand(
  parsed: ParsedCommand,
  ctx: ExecutorContext,
): Promise<CommandResponse> {
  const { intent, entities, confidence } = parsed

  if (intent === 'unknown' || confidence < 0.5) {
    // Post unrecognized speech to feed so nothing gets lost
    await ctx.onSendMessage(ctx.staff.name, parsed.rawTranscript, 'info')
    postToWebhook('unrecognized', { message: parsed.rawTranscript }, ctx).catch(() => {})

    return {
      text: `Posted to feed: "${parsed.rawTranscript}"`,
      type: 'info',
      requiresConfirmation: false,
    }
  }

  switch (intent) {
    case 'sales_query': return querySales()
    case 'staff_check': return queryStaff(entities)
    case 'menu_lookup': return menuLookup(entities, ctx.eightySixItems)
    case 'table_status': return tableStatus(entities, ctx.tables)
    case 'my_tables': return myTables(ctx)
    case 'seat_table': return seatTable(entities, ctx)
    case 'clear_table': return clearTable(entities, ctx)
    case 'close_out': return closeOut(entities, ctx)
    case 'eighty_six': return eightySix(entities, ctx)
    case 'un_eighty_six': return unEightySix(entities, ctx)
    case 'message_kitchen': return messageKitchen(entities, ctx)
    case 'message_manager': return messageManager(entities, ctx)
    case 'order_submit': return orderSubmit(parsed, ctx)
    case 'cancel_order': return { text: 'Order cancelled', type: 'success', requiresConfirmation: false }
    case 'clock_in': return { text: `Clocked in. Have a great shift, ${ctx.staff.name}!`, type: 'success', requiresConfirmation: false }
    case 'clock_out': return { text: 'Clocked out. Good work today!', type: 'success', requiresConfirmation: false }
    default:
      return { text: `${intent}: ${JSON.stringify(entities)}`, type: 'info', requiresConfirmation: false }
  }
}

// --- Read intents ---

async function querySales(): Promise<CommandResponse> {
  const { data, error } = await supabase
    .from('shift4_daily_summary')
    .select('report_date, gross_sales, headcount')
    .eq('restaurant_id', API_CONFIG.restaurantId)
    .gt('gross_sales', 0)
    .order('report_date', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    return { text: 'Sales data unavailable right now.', type: 'error', requiresConfirmation: false }
  }

  const gross = Number(data.gross_sales).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const date = new Date(data.report_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const guests = data.headcount > 0 ? `, ${data.headcount} guests` : ''

  return { text: `${date}: ${gross} gross${guests}`, type: 'info', requiresConfirmation: false }
}

async function queryStaff(entities: Record<string, string>): Promise<CommandResponse> {
  if (entities.staff_name) {
    const { data } = await supabase
      .from('vox_staff')
      .select('name, role')
      .eq('restaurant_id', API_CONFIG.restaurantId)
      .eq('is_active', true)
      .ilike('name', `%${entities.staff_name}%`)
      .limit(1)
      .single()

    if (data) {
      return { text: `${data.name} (${data.role}) is on the roster.`, type: 'info', requiresConfirmation: false }
    }
    return { text: `No staff member matching "${entities.staff_name}" found.`, type: 'info', requiresConfirmation: false }
  }

  const { data } = await supabase
    .from('vox_staff')
    .select('name')
    .eq('restaurant_id', API_CONFIG.restaurantId)
    .eq('is_active', true)

  if (data?.length) {
    const names = data.map(s => s.name.split(' ')[0]).join(', ')
    return { text: `${data.length} staff on roster: ${names}`, type: 'info', requiresConfirmation: false }
  }
  return { text: 'No staff data available.', type: 'error', requiresConfirmation: false }
}

function menuLookup(entities: Record<string, string>, eightySixed: EightySixItem[]): CommandResponse {
  const result = searchMenu(entities.item_name || '')
  if (!result) {
    return { text: `No menu item matching "${entities.item_name}" found.`, type: 'info', requiresConfirmation: false }
  }

  const is86 = eightySixed.some(i => i.itemName.toLowerCase() === result.name.toLowerCase())
  const price = `$${result.price.toFixed(2)}`
  const cat = formatCategory(result.category)
  const line86 = is86 ? '\n86\'D -- currently unavailable' : ''

  return {
    text: `${result.name} -- ${price} (${cat})\n${result.description}${line86}`,
    type: is86 ? 'error' : 'info',
    requiresConfirmation: false,
  }
}

function tableStatus(entities: Record<string, string>, tables: TableSession[]): CommandResponse {
  const id = entities.table_number
  const table = tables.find(t => t.tableNumber === id)

  if (!table) {
    return { text: `Table ${id} not found.`, type: 'error', requiresConfirmation: false }
  }

  if (table.status === 'open') {
    return { text: `${id}: Open / unseated`, type: 'info', requiresConfirmation: false }
  }

  if (table.status === 'closed') {
    return { text: `${id}: Closed -- $${table.checkTotal.toFixed(2)}`, type: 'info', requiresConfirmation: false }
  }

  const elapsed = table.openedAt
    ? Math.round((Date.now() - new Date(table.openedAt).getTime()) / 60000)
    : 0

  const attn = table.status === 'attention' ? ' -- NEEDS ATTENTION' : ''

  return {
    text: `${id}: ${table.guestCount} guests, ${elapsed} min, $${table.checkTotal.toFixed(2)} -- ${table.itemCount} items${attn}`,
    type: table.status === 'attention' ? 'error' : 'info',
    requiresConfirmation: false,
  }
}

function myTables(ctx: ExecutorContext): CommandResponse {
  const mine = ctx.tables.filter(t => t.serverId === ctx.staff.id && t.status !== 'open')

  if (mine.length === 0) {
    return { text: 'No tables assigned to you right now.', type: 'info', requiresConfirmation: false }
  }

  const total = mine.reduce((sum, t) => sum + t.checkTotal, 0)
  const nums = mine.map(t => t.tableNumber).join(', ')

  return {
    text: `${mine.length} tables: ${nums} -- $${total.toFixed(2)} total`,
    type: 'info',
    requiresConfirmation: false,
  }
}

// --- Write intents ---

async function seatTable(entities: Record<string, string>, ctx: ExecutorContext): Promise<CommandResponse> {
  const id = entities.table_number
  const guests = parseInt(entities.party_size) || 2

  await ctx.onSeatTable(id, guests, ctx.staff.id)
  return { text: `Seated ${guests} at ${id}`, type: 'success', requiresConfirmation: false }
}

async function clearTable(entities: Record<string, string>, ctx: ExecutorContext): Promise<CommandResponse> {
  const id = entities.table_number
  await ctx.onClearTable(id)
  return { text: `${id} cleared`, type: 'success', requiresConfirmation: false }
}

async function closeOut(entities: Record<string, string>, ctx: ExecutorContext): Promise<CommandResponse> {
  const id = entities.table_number
  const table = ctx.tables.find(t => t.tableNumber === id)
  const total = table ? `$${table.checkTotal.toFixed(2)}` : ''

  await ctx.onCloseTable(id)
  return { text: `${id} closed out${total ? '. ' + total : ''}`, type: 'success', requiresConfirmation: false }
}

async function eightySix(entities: Record<string, string>, ctx: ExecutorContext): Promise<CommandResponse> {
  const item = entities.item_name
  if (!item) {
    // List current 86'd items
    if (ctx.eightySixItems.length === 0) {
      return { text: 'Nothing is 86\'d right now.', type: 'info', requiresConfirmation: false }
    }
    const list = ctx.eightySixItems.map(i => i.itemName).join(', ')
    return { text: `86'd: ${list}`, type: 'info', requiresConfirmation: false }
  }

  await ctx.onEightySix(item, ctx.staff.name)
  await ctx.onSendMessage('System', `86'd: ${item} (by ${ctx.staff.name})`, 'alert')
  return { text: `86'd: ${item}`, type: 'success', requiresConfirmation: false }
}

async function unEightySix(entities: Record<string, string>, ctx: ExecutorContext): Promise<CommandResponse> {
  const item = entities.item_name
  await ctx.onUnEightySix(item)
  await ctx.onSendMessage('System', `${item} is back on the menu`, 'info')
  return { text: `${item} is back on the menu`, type: 'success', requiresConfirmation: false }
}

async function messageKitchen(entities: Record<string, string>, ctx: ExecutorContext): Promise<CommandResponse> {
  const msg = entities.message
  await ctx.onSendMessage(ctx.staff.name, `Kitchen: ${msg}`, 'alert')

  // Also try n8n webhook for Telegram relay
  postToWebhook('message_kitchen', { message: msg }, ctx).catch(() => {})

  return { text: `Sent to kitchen: "${msg}"`, type: 'success', requiresConfirmation: false }
}

async function messageManager(entities: Record<string, string>, ctx: ExecutorContext): Promise<CommandResponse> {
  const recipient = entities.recipient
  const msg = entities.message
  await ctx.onSendMessage(ctx.staff.name, `To ${recipient}: ${msg}`, 'manager')

  postToWebhook('message_manager', { recipient, message: msg }, ctx).catch(() => {})

  return { text: `Message to ${recipient}: "${msg}"`, type: 'success', requiresConfirmation: false }
}

async function orderSubmit(parsed: ParsedCommand, ctx: ExecutorContext): Promise<CommandResponse> {
  const { entities } = parsed
  const items = entities.items
  const tableId = entities.table_number

  // Post to feed
  await ctx.onSendMessage(ctx.staff.name, `Order for ${tableId}: ${items}`, 'alert')

  // Try n8n webhook for Telegram relay
  postToWebhook('order_submit', entities, ctx).catch(() => {})

  return { text: `Order sent: ${items} for ${tableId}`, type: 'success', requiresConfirmation: false }
}

// --- Webhook helper ---

async function postToWebhook(
  intent: string,
  entities: Record<string, string>,
  ctx: ExecutorContext,
): Promise<void> {
  if (!API_CONFIG.n8nBaseUrl) return

  const url = `${API_CONFIG.n8nBaseUrl}${API_CONFIG.webhookCommand}`

  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_CONFIG.voxAuthToken ? { 'X-Vox-Auth': API_CONFIG.voxAuthToken } : {}),
    },
    body: JSON.stringify({
      intent,
      entities,
      staff_id: ctx.staff.id,
      staff_name: ctx.staff.name,
      role: ctx.staff.role,
      restaurant_id: API_CONFIG.restaurantId,
      timestamp: new Date().toISOString(),
    }),
  })
}
