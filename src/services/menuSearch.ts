import menuData from '@/data/menu.json'

interface MenuItem {
  name: string
  category: string
  price: number
  description: string
}

const menu: MenuItem[] = menuData as MenuItem[]

// Precompute lowercase names for matching
const menuLower = menu.map(item => ({
  ...item,
  nameLower: item.name.toLowerCase(),
}))

export interface MenuResult {
  name: string
  price: number
  category: string
  description: string
}

export function searchMenu(query: string): MenuResult | null {
  const q = query.toLowerCase().trim()
  if (!q) return null

  // 1. Exact match
  const exact = menuLower.find(m => m.nameLower === q)
  if (exact) return exact

  // 2. Starts-with match
  const startsWith = menuLower.find(m => m.nameLower.startsWith(q))
  if (startsWith) return startsWith

  // 3. Substring match (query appears in name)
  const substring = menuLower.find(m => m.nameLower.includes(q))
  if (substring) return substring

  // 4. Reverse substring (name appears in query)
  const reverse = menuLower.find(m => q.includes(m.nameLower))
  if (reverse) return reverse

  // 5. Word overlap score
  const queryWords = q.split(/\s+/)
  let bestMatch: typeof menuLower[0] | null = null
  let bestScore = 0

  for (const item of menuLower) {
    const nameWords = item.nameLower.split(/\s+/)
    const overlap = queryWords.filter(w =>
      nameWords.some(nw => nw.includes(w) || w.includes(nw))
    ).length
    const score = overlap / Math.max(queryWords.length, nameWords.length)

    if (score > bestScore && score >= 0.4) {
      bestScore = score
      bestMatch = item
    }
  }

  if (bestMatch) return bestMatch

  return null
}

export function formatCategory(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
