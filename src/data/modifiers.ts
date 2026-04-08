import type { ModifierCategory, TicketModifier } from '@/types'

interface ModifierDef {
  canonical: string
  category: ModifierCategory
  aliases: string[]
}

// Sorted longest-first within each category for greedy matching
const MODIFIERS: ModifierDef[] = [
  // Cook temps (14)
  { canonical: 'Sunny Side Up', category: 'cook_temp', aliases: ['sunny side up', 'sunny side'] },
  { canonical: 'Soft Scrambled', category: 'cook_temp', aliases: ['soft scrambled', 'soft scramble'] },
  { canonical: 'Over Medium', category: 'cook_temp', aliases: ['over medium', 'over med'] },
  { canonical: 'Over Easy', category: 'cook_temp', aliases: ['over easy'] },
  { canonical: 'Over Hard', category: 'cook_temp', aliases: ['over hard'] },
  { canonical: 'Over Well', category: 'cook_temp', aliases: ['over well'] },
  { canonical: 'Medium Rare', category: 'cook_temp', aliases: ['medium rare', 'med rare'] },
  { canonical: 'Medium Well', category: 'cook_temp', aliases: ['medium well', 'med well'] },
  { canonical: 'Well Done', category: 'cook_temp', aliases: ['well done'] },
  { canonical: 'Scrambled', category: 'cook_temp', aliases: ['scrambled', 'scramble'] },
  { canonical: 'Poached', category: 'cook_temp', aliases: ['poached'] },
  { canonical: 'Basted', category: 'cook_temp', aliases: ['basted'] },
  { canonical: 'Medium', category: 'cook_temp', aliases: ['medium'] },
  { canonical: 'Rare', category: 'cook_temp', aliases: ['rare'] },

  // Meats (5)
  { canonical: 'Turkey Sausage', category: 'meat', aliases: ['turkey sausage'] },
  { canonical: 'Turkey Bacon', category: 'meat', aliases: ['turkey bacon'] },
  { canonical: 'Sausage', category: 'meat', aliases: ['sausage'] },
  { canonical: 'Bacon', category: 'meat', aliases: ['bacon'] },
  { canonical: 'Ham', category: 'meat', aliases: ['ham'] },

  // Sides (17)
  { canonical: 'Sweet Potato Fries', category: 'side', aliases: ['sweet potato fries'] },
  { canonical: 'Mashed Potatoes', category: 'side', aliases: ['mashed potatoes', 'mashed potato'] },
  { canonical: 'Mac and Cheese', category: 'side', aliases: ['mac and cheese', 'mac & cheese', 'mac n cheese'] },
  { canonical: 'Potato Salad', category: 'side', aliases: ['potato salad'] },
  { canonical: 'Hash Browns', category: 'side', aliases: ['hash browns', 'hashbrowns', 'hash brown'] },
  { canonical: 'Waffle Fries', category: 'side', aliases: ['waffle fries'] },
  { canonical: 'French Fries', category: 'side', aliases: ['french fries'] },
  { canonical: 'Onion Rings', category: 'side', aliases: ['onion rings'] },
  { canonical: 'Fried Pickles', category: 'side', aliases: ['fried pickles'] },
  { canonical: 'Fried Okra', category: 'side', aliases: ['fried okra'] },
  { canonical: 'Baked Potato', category: 'side', aliases: ['baked potato'] },
  { canonical: 'Side Salad', category: 'side', aliases: ['side salad'] },
  { canonical: 'Tater Tots', category: 'side', aliases: ['tater tots', 'tots'] },
  { canonical: 'Dirty Rice', category: 'side', aliases: ['dirty rice'] },
  { canonical: 'Coleslaw', category: 'side', aliases: ['coleslaw', 'cole slaw'] },
  { canonical: 'Grits', category: 'side', aliases: ['grits'] },
  { canonical: 'Fruit', category: 'side', aliases: ['fruit cup', 'fruit'] },

  // Breads (9)
  { canonical: 'English Muffin', category: 'bread', aliases: ['english muffin'] },
  { canonical: 'Texas Toast', category: 'bread', aliases: ['texas toast'] },
  { canonical: 'Sourdough', category: 'bread', aliases: ['sourdough'] },
  { canonical: 'Croissant', category: 'bread', aliases: ['croissant'] },
  { canonical: 'Tortilla', category: 'bread', aliases: ['tortilla'] },
  { canonical: 'Biscuit', category: 'bread', aliases: ['biscuit'] },
  { canonical: 'White', category: 'bread', aliases: ['white toast', 'white bread', 'white'] },
  { canonical: 'Wheat', category: 'bread', aliases: ['wheat toast', 'wheat bread', 'wheat'] },
  { canonical: 'Rye', category: 'bread', aliases: ['rye toast', 'rye bread', 'rye'] },
]

// Flatten and sort all aliases longest-first for greedy matching
const SORTED_ALIASES: { alias: string; def: ModifierDef }[] = []
for (const def of MODIFIERS) {
  for (const alias of def.aliases) {
    SORTED_ALIASES.push({ alias, def })
  }
}
SORTED_ALIASES.sort((a, b) => b.alias.length - a.alias.length)

export function extractModifiers(text: string): { modifiers: TicketModifier[]; remaining: string } {
  let remaining = text.toLowerCase()
  const modifiers: TicketModifier[] = []
  const used = new Set<string>()

  for (const { alias, def } of SORTED_ALIASES) {
    // Skip if we already matched this canonical modifier
    if (used.has(def.canonical)) continue

    const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    const m = remaining.match(regex)
    if (m && m.index !== undefined) {
      modifiers.push({ text: def.canonical, category: def.category })
      used.add(def.canonical)
      remaining = remaining.slice(0, m.index) + remaining.slice(m.index + alias.length)
    }
  }

  remaining = remaining.replace(/\s+/g, ' ').trim()
  return { modifiers, remaining }
}
