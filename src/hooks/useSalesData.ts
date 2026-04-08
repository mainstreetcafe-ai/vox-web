import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { API_CONFIG } from '@/lib/constants'

export interface SalesSnapshot {
  reportDate: string
  grossSales: number
  netSales: number
  headcount: number
  avgPerHead: number
  totalTips: number
}

export function useSalesData() {
  const [latest, setLatest] = useState<SalesSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      // Get most recent row with actual gross_sales > 0
      // (known bug: recent dates may have gross_sales=0 due to FO parser issue)
      const { data: salesRows } = await supabase
        .from('shift4_daily_summary')
        .select('report_date, gross_sales, net_sales, headcount, avg_per_head, total_tips')
        .eq('restaurant_id', API_CONFIG.restaurantId)
        .gt('gross_sales', 0)
        .order('report_date', { ascending: false })
        .limit(1)

      // Also get most recent row (may have headcount even if gross=0)
      const { data: recentRows } = await supabase
        .from('shift4_daily_summary')
        .select('report_date, headcount')
        .eq('restaurant_id', API_CONFIG.restaurantId)
        .gt('headcount', 0)
        .order('report_date', { ascending: false })
        .limit(1)

      if (salesRows?.length) {
        const row = salesRows[0]
        const headcount = row.headcount > 0
          ? row.headcount
          : (recentRows?.[0]?.headcount ?? 0)

        setLatest({
          reportDate: row.report_date,
          grossSales: Number(row.gross_sales) || 0,
          netSales: Number(row.net_sales) || 0,
          headcount,
          avgPerHead: Number(row.avg_per_head) || 0,
          totalTips: Number(row.total_tips) || 0,
        })
      }

      setIsLoading(false)
    }

    fetch()
  }, [])

  return { latest, isLoading }
}
