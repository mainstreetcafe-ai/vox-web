// Cross-view table actions.
//
// The Dashboard (floor) and the Command view (ticket) are sibling panes; the ticket
// state lives in useTicket inside CommandView. Rather than hoist that state or add a
// store for one interaction, the floor DISPATCHES an intent and CommandView -- which
// is always mounted as one of the three panes -- acts on it. One event, one listener.

export const OPEN_TABLE_EVENT = 'vox:open-table'

export interface OpenTableDetail { table: string; party: number }

export function openTableRequest(table: string, party: number) {
  window.dispatchEvent(
    new CustomEvent<OpenTableDetail>(OPEN_TABLE_EVENT, { detail: { table, party } }),
  )
}
