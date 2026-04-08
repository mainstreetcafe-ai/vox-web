import { useMemo } from 'react'
import { TableCard } from '@/components/TableCard'
import { shiftContextLine } from '@/lib/time'
import { useSalesData } from '@/hooks/useSalesData'
import { useTableSessions } from '@/hooks/useTableSessions'
import { useEightySix } from '@/hooks/useEightySix'
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
  const { staff } = useAuth()
  const { latest } = useSalesData()
  const { tables, isLoading } = useTableSessions()
  const { items: eightySixed } = useEightySix()

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
          <h1 className="text-white text-2xl font-bold leading-tight">Your Tables</h1>
          <p className="text-gray text-[13px] mt-1">
            {staff ? `${staff.name} -- ${shiftContextLine(shiftStart)}` : shiftContextLine(shiftStart)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-white text-lg font-semibold">${shiftTotal.toFixed(2)}</p>
          <p className="text-gray-dim text-[11px]">shift total</p>
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

      {/* Table cards grouped by section */}
      {isLoading ? (
        <p className="text-gray-dim text-[13px] text-center pt-10">Loading tables...</p>
      ) : (
        <div className="px-4 pb-4">
          {sections.map(({ section, label, tables: sectionTables }) => (
            <div key={section} className="mb-4">
              <p className="text-gray-dim text-[11px] font-semibold uppercase tracking-wider mb-2 px-1">
                {label}
              </p>
              <div className="flex flex-col gap-2">
                {sectionTables.map(table => (
                  <TableCard key={table.tableNumber} table={table} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer hint */}
      <p className="text-gray-dim/60 text-xs text-center pt-5 pb-10">
        Swipe left for voice commands
      </p>
    </div>
  )
}
