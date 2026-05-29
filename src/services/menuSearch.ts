import { supabase } from '@/lib/supabase'
import { API_CONFIG } from '@/lib/constants'

interface MenuItem {
  name: string
  category: string
  price: number
  description: string
}

const CACHE_KEY = 'vox-menu-cache-v1'

// Mutable module-level state. searchMenu reads these on every call.
let menu: MenuItem[] = []
let menuLower: (MenuItem & { nameLower: string })[] = []

function setMenu(items: MenuItem[]) {
  menu = items
  menuLower = items.map(item => ({ ...item, nameLower: item.name.toLowerCase() }))
}

// Loads the menu from Supabase. Falls back to a localStorage cache if the
// network is down. The `menu` table is the same source the landing site and
// dashboard use, so prices stay in sync through repricing.
export async function loadMenu(): Promise<{ source: 'supabase' | 'cache' | 'none'; count: number }> {
  try {
    const { data, error } = await supabase
      .from('menu')
      .select('name, category, price, description')
      .eq('restaurant_id', API_CONFIG.restaurantId)
      .eq('is_active', true)
      .order('display_order', { ascending: true, nullsFirst: false })

    if (!error && data && data.length > 0) {
      const items: MenuItem[] = data.map(r => ({
        name: r.name as string,
        category: r.category as string,
        price: Number(r.price) || 0,
        description: (r.description as string) ?? '',
      }))
      setMenu(items)
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items }))
      } catch {
        // localStorage may be unavailable (private mode); ignore.
      }
      return { source: 'supabase', count: items.length }
    }
  } catch {
    // Fall through to cache.
  }

  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { savedAt: number; items: MenuItem[] }
      if (Array.isArray(parsed.items) && parsed.items.length > 0) {
        setMenu(parsed.items)
        return { source: 'cache', count: parsed.items.length }
      }
    }
  } catch {
    // Cache unreadable; surface as empty menu.
  }

  return { source: 'none', count: 0 }
}

export function isMenuLoaded(): boolean {
  return menu.length > 0
}

// Aliases mined from 1,013 real call transcripts (order_placement + menu_question)
// Maps spoken variants -> official menu name (lowercase)
const ALIASES: Record<string, string> = {
  // Breakfast
  'breakfast special': 'egg special',
  'the special': 'egg special',
  'five eggs': 'egg special',
  'waffle special': 'waffle special',
  'pancake special': 'pancake special',
  'breakfast sandwich': 'egg sandwich',
  'bacon egg and cheese sandwich': 'egg sandwich',
  'breakfast burrito': 'breakfast burrito',
  'the scrambler': 'mexican scrambler',
  'scrambler': 'mexican scrambler',
  'french toast': 'french toast',
  'waffles': 'belgian waffle',
  'the waffle': 'belgian waffle',
  'steak and eggs': 'sirloin steak & eggs',
  'chicken and waffles': 'chicken & waffles',
  'chicken waffles': 'chicken & waffles',
  'c and w': 'chicken & waffles',
  'corned beef and eggs': 'corned beef hash & eggs',
  'biscuits and gravy': 'biscuits & gravy',
  'veggie omelette': 'veggie egg white omelet',
  'veggie omelet': 'veggie egg white omelet',
  'western omelet': 'western omelet',
  "farmer's omelette": "farmers omelet",
  'farmers omelet': 'farmers omelet',
  'spanish omelette': 'spanish omelet',

  // Lunch/Dinner
  'chicken fried chicken': 'chicken fried chicken',
  'the chicken fried': 'chicken fried chicken',
  'cfc': 'chicken fried chicken',
  'country fried steak': 'chicken fried steak',
  'country fried chicken': 'chicken fried chicken',
  'potato chip': 'potato chip chicken',
  'pcc': 'potato chip chicken',
  'the sinful chicken': 'sinful chicken sandwich',
  'sinful chicken': 'sinful chicken sandwich',
  'simple chicken': 'simple chicken sandwich',
  'buffalo chicken': 'buffalo chicken sandwich',
  'avocado salad': 'avocado chicken salad',
  'the avocado salad': 'avocado chicken salad',
  'catfish': 'fried catfish',
  'the catfish': 'fried catfish',
  'catfish plate': 'fried catfish',
  'catfish special': 'fried catfish',
  'jalapeno catfish': 'jalapeno catfish',
  'blackened redfish': 'blackened redfish',
  'black and red fish': 'blackened redfish',
  'tilapia': 'veracruz tilapia',
  'tilapia veracruz': 'veracruz tilapia',
  'hamburger steak': 'hamburger steak',
  'patty melt': 'patty melt',
  'club sandwich': 'club sandwich',
  'cowboy sandwich': 'cowboy sandwich',
  'country sandwich': 'cowboy sandwich',
  'pork chops': 'pork chops',
  'pork chop meal': 'pork chops',
  'ribeye': 'ribeye steak dinner',
  'ribeye steak': 'ribeye steak dinner',
  'meatloaf': 'meatloaf',
  'beef enchiladas': 'beef enchiladas',
  'chili relleno': 'chicken chili relleno',
  'shrimp tacos': 'shrimp tacos',
  'shrimp alfredo': 'shrimp alfredo pasta',
  'chicken cordon bleu': 'chicken cordon bleu',
  'chicken and dumplings': 'chicken and dumplings',
  'turkey and dressing': 'turkey and dressing',
  'tuna cake': 'tuna cake',
  'southwest chicken': 'southwest chicken breast',
  'jalapeno chicken': 'jalapeno chicken',
  'seafood platter': 'seafood platter',
  'tropical salmon': 'tropical salmon',
  'cheeseburger': 'cheeseburger',
  'blt': 'blt sandwich',

  // Sides
  'fries': 'french fries',
  'regular fries': 'french fries',
  'sweet potato fries': 'sweet potato fries',
  'waffle fries': 'waffle fries',
  'tater tots': 'tater tots',
  'onion rings': 'onion rings',
  'mashed potatoes': 'mashed potatoes & gravy',
  'mac and cheese': 'mac and cheese',
  'fried okra': 'fried okra',
  'fried pickles': 'fried pickles',
  'fried mushrooms': 'fried mushrooms',
  'fried squash': 'fried squash',
  'coleslaw': 'coleslaw',
  'cole slaw': 'coleslaw',
  'dirty rice': 'dirty rice',
  'potato salad': 'potato salad',

  // Desserts
  'chocolate pie': 'chocolate pie',
  'coconut pie': 'coconut pie',
  'lemon pie': 'lemon pie',
  'apple pie': 'apple pie',
  'pecan pie': 'pecan pie',
  'cheesecake': 'cheesecake',
  'brownie': 'hot fudge brownie',

  // Soups
  'veggie beef soup': 'vegetable beef soup',
  'vegetable soup': 'vegetable beef soup',
  'the soup': 'vegetable beef soup',

  // Drinks
  'coffee': 'coffee',
  'iced tea': 'iced tea',
  'sweet tea': 'sweet tea',
  'grand mimosa': 'grand mimosa',
  'arnold palmer': 'arnold palmer',
}

export interface MenuResult {
  name: string
  price: number
  category: string
  description: string
}

export function searchMenu(query: string): MenuResult | null {
  const q = query.toLowerCase().trim()
  if (!q || menuLower.length === 0) return null

  // 0. Check aliases first
  const aliasTarget = ALIASES[q]
  if (aliasTarget) {
    const aliasMatch = menuLower.find(m => m.nameLower.includes(aliasTarget))
    if (aliasMatch) return aliasMatch
  }

  // 0b. Partial alias match (query contains an alias key)
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (q.includes(alias)) {
      const match = menuLower.find(m => m.nameLower.includes(target))
      if (match) return match
    }
  }

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
  return slug.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
