import { useMemo, useState } from 'react'
import { TableCard } from '@/components/TableCard'
import { TableActionSheet } from '@/components/QuickActions'
import { openTableRequest } from '@/services/tableActions'
import { RecentTicketsList } from '@/components/RecentTicketsList'
import { shiftContextLine } from '@/lib/time'
import { useSalesData } from '@/hooks/useSalesData'
import { useTableSessions } from '@/hooks/useTableSessions'
import { useEightySix } from '@/hooks/useEightySix'
import { useMyTickets } from '@/hooks/useMyTickets'
import { useAuth } from '@/contexts/AuthContext'

const SECTION_LABELS: Record<string, string> = {
  B: 'Bar Section',
  W: 'West Room',
  E: 'East Room',
  L: 'Library Room',
  P: 'Patio',
  R: 'Rail At Bar',
}

export function DashboardView() {
  const { staff, logout } = useAuth()
  const [sheetTable, setSheetTable] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string>('ALL')
  const { latest } = useSalesData()
  const { tables, isLoading } = useTableSessions()
  const { items: eightySixed } = useEightySix()
  const { tickets: myTickets, markDone } = useMyTickets(staff?.id)

  const shiftStart = useMemo(() => {
    const d = new Date()
    d.setHours(16, 0, 0, 0)
    return d
  }, [])

  const myTables = tables.filter(t => t.serverId === staff?.id && t.status !== 'open')
  const shiftTotal = myTables.reduce((sum, t) => sum + t.checkTotal, 0)

  // Group tables by section, active/attention sections float to top
  const sections = useMemo(() => {
    const grouped: Record<string, typeof tables> = {}
    for (const t of tables) {
      const sec = t.section || '?'
      if (!grouped[sec]) grouped[sec] = []
      grouped[sec].push(t)
    }

    return Object.entries(grouped).map(([section, sectionTables]) => ({
      section,
      label: SECTION_LABELS[section] || section,
      tables: sectionTables,
      hasActive: sectionTables.some(t => t.status === 'active' || t.status === 'attention'),
    })).sort((a, b) => {
      if (a.hasActive && !b.hasActive) return -1
      if (!a.hasActive && b.hasActive) return 1
      return 0
    })
  }, [tables])

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-start px-6 pt-6 pb-2">
        <div>
          <h1 className="text-white text-2xl font-bold leading-tight">The Floor</h1>
          <p className="text-gray text-[13px] mt-1">
            {staff ? `${staff.name} -- ${shiftContextLine(shiftStart)}` : shiftContextLine(shiftStart)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-white text-lg font-semibold">${shiftTotal.toFixed(2)}</p>
          <p className="text-gray-dim text-[11px]">shift total</p>
          <button
            onClick={logout}
            className="text-gray-dim text-[11px] mt-2 uppercase tracking-wider active:text-error"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Sales banner */}
      {latest && (
        <div className="mx-4 mb-3 px-4 py-2.5 bg-surface rounded-lg">
          <div className="flex justify-between items-center">
            <p className="text-gray text-[13px]">Last close ({latest.reportDate})</p>
            <p className="text-white text-sm font-semibold">
              ${latest.grossSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="flex gap-4 mt-1">
            {latest.headcount > 0 && <p className="text-gray-dim text-[11px]">{latest.headcount} guests</p>}
            {latest.avgPerHead > 0 && <p className="text-gray-dim text-[11px]">${latest.avgPerHead.toFixed(2)} avg</p>}
          </div>
        </div>
      )}

      {/* 86 banner */}
      {eightySixed.length > 0 && (
        <div className="mx-4 mb-3 px-4 py-2.5 bg-surface rounded-lg border border-error/30">
          <p className="text-error text-[11px] font-semibold uppercase tracking-wider mb-1">86'd Items</p>
          <p className="text-gray text-[13px]">{eightySixed.map(i => i.itemName).join(', ')}</p>
        </div>
      )}

      {/* Today's tickets -- pending entries the server still needs to log in SHIFT4 */}
      <RecentTicketsList tickets={myTickets} onMarkDone={markDone} />

      {/* Table cards grouped by section */}
      {isLoading ? (
        <p className="text-gray-dim text-[13px] text-center pt-10">Loading tables...</p>
      ) : (
        <div className="px-4 pb-4">
          {/* Section tabs -- 54 tables is too many to scroll on a busy floor */}
          {sections.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
              {['ALL', ...sections.map(s => s.section)].map(sec => (
                <button
                  key={sec}
                  onClick={() => setActiveSection(sec)}
                  className={`shrink-0 h-[36px] px-4 rounded-full text-[13px] font-medium border transition-colors ${
                    activeSection === sec
                      ? 'bg-maroon border-maroon text-white'
                      : 'bg-surface border-white/5 text-gray active:bg-surface-hover'
                  }`}
                >
                  {sec === 'ALL' ? 'All' : sec}
                </button>
              ))}
            </div>
          )}
          {sections
            .filter(s => activeSection === 'ALL' || s.section === activeSection)
            .map(({ section, label, tables: sectionTables }) => (
            <div key={section} className="mb-4">
              <p className="text-gray-dim text-[11px] font-semibold uppercase tracking-wider mb-2 px-1">
                {label}
              </p>
              <div className="flex flex-col gap-2">
                {sectionTables.map(table => (
                  <TableCard
                    key={table.tableNumber}
                    table={table}
                    onTap={t => setSheetTable(t.tableNumber)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {sheetTable && (
        <TableActionSheet
          table={sheetTable}
          onClose={() => setSheetTable(null)}
          onOpenTable={(tbl, party) => { openTableRequest(tbl, party); setSheetTable(null) }}
        />
      )}

      {/* Footer hint */}
      <p className="text-gray-dim/60 text-xs text-center pt-5 pb-10">
        Swipe left for voice commands
      </p>
    </div>
  )
}
