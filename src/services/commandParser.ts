export type CommandIntent =
  | 'menu_lookup' | 'order_submit' | 'table_status' | 'seat_table'
  | 'clear_table' | 'close_out' | 'my_tables' | 'staff_check'
  | 'message_kitchen' | 'message_manager' | 'sales_query'
  | 'eighty_six' | 'un_eighty_six' | 'cancel_order'
  | 'clock_in' | 'clock_out' | 'unknown'

export interface ParsedCommand {
  intent: CommandIntent
  entities: Record<string, string>
  confidence: number
  rawTranscript: string
}

// Spoken number words to digits
const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15',
  sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20',
}

// Section letter sounds as spoken by staff ("bee one" → "b1", "are five" → "r5")
const SECTION_SOUNDS: Record<string, string> = {
  'bee': 'b', 'be': 'b',
  'double u': 'w', 'dub': 'w',
  'ee': 'e',
  'el': 'l', 'elle': 'l',
  'pee': 'p', 'pe': 'p',
  'are': 'r', 'ar': 'r',
}

const VALID_TABLES = new Set([
  'B1','B2','B3','B4','B5','B6','B7','B8','B9','B10',
  'W1','W2','W3','W4','W5','W6',
  'E1','E2','E3','E4','E5','E6',
  'L1','L2','L3','L4','L5','L6','L7','L8','L9','L10',
  'P1','P2','P3','P4','P5','P6','P7','P8','P9',
  'R1','R2','R3','R4','R5','R6','R7','R8','R9','R10','R11','R12','R13',
])

const FILLER_WORDS = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'literally']

function normalize(text: string): string {
  let result = text.toLowerCase()

  // Convert number words first
  for (const [word, digit] of Object.entries(NUMBER_WORDS)) {
    result = result.replace(new RegExp(`\\b${word}\\b`, 'g'), digit)
  }

  // Convert section letter sounds ("bee 1" → "b 1", "are 5" → "r 5")
  for (const [sound, letter] of Object.entries(SECTION_SOUNDS)) {
    result = result.replace(new RegExp(`\\b${sound}\\s+(\\d+)`, 'g'), `${letter}$1`)
  }

  // Collapse "b 1" → "b1" (letter followed by space then digits)
  result = result.replace(/\b([bwelpr])\s+(\d+)\b/g, '$1$2')

  // Remove filler words
  for (const filler of FILLER_WORDS) {
    result = result.replace(new RegExp(` ${filler} `, 'g'), ' ')
  }

  return result.replace(/\s+/g, ' ').trim()
}

// Extract a valid table name from a string
function extractTable(text: string): string | null {
  const m = text.match(/\b([bwelpr]\d{1,2})\b/i)
  if (m) {
    const candidate = m[1].toUpperCase()
    if (VALID_TABLES.has(candidate)) return candidate
  }
  return null
}

function match(pattern: string, text: string): RegExpMatchArray | null {
  return text.match(new RegExp(pattern, 'i'))
}

// Table ID pattern for regex: captures section letter + number
const TBL = '([bwelpr]\\d{1,2})'

type PatternRule = {
  patterns: string[]
  intent: CommandIntent
  extract: (m: RegExpMatchArray, normalized: string) => Record<string, string>
  confidence: number
}

const RULES: PatternRule[] = [
  // Exact phrases first
  {
    patterns: ['\\bmy tables\\b', '\\bshow my tables\\b'],
    intent: 'my_tables',
    extract: () => ({}),
    confidence: 1.0,
  },
  {
    patterns: ['\\bcancel order\\b', '\\bcancel that\\b', '\\bnever mind\\b'],
    intent: 'cancel_order',
    extract: () => ({}),
    confidence: 1.0,
  },
  {
    patterns: ['\\bclock in\\b', '\\bclocking in\\b'],
    intent: 'clock_in',
    extract: () => ({}),
    confidence: 1.0,
  },
  {
    patterns: ['\\bclock out\\b', '\\bclocking out\\b'],
    intent: 'clock_out',
    extract: () => ({}),
    confidence: 1.0,
  },
  {
    patterns: ['\\bhow are sales\\b', '\\bwhat are my sales\\b', '\\bsales today\\b', '\\bsales so far\\b'],
    intent: 'sales_query',
    extract: () => ({}),
    confidence: 0.9,
  },
  // Order with table (items first or table first)
  {
    patterns: [
      `order (.+) for (?:table )?${TBL}`,
      `can i get (.+) for (?:table )?${TBL}`,
      `i need (.+) for (?:table )?${TBL}`,
      `send (.+) to (?:table )?${TBL}`,
      `(?:table )?${TBL} (?:wants|needs|ordered|gets) (.+)`,
    ],
    intent: 'order_submit',
    extract: (m) => {
      // "B1 wants three coffees" → m[1]=b1, m[2]=three coffees
      // "order chicken for B1" → m[1]=chicken, m[2]=b1
      const tbl = extractTable(m[1]) || extractTable(m[2])
      if (tbl && extractTable(m[1])) {
        return { table_number: tbl, items: m[2] }
      }
      return { items: m[1], table_number: (m[2] || '').toUpperCase() }
    },
    confidence: 0.9,
  },
  // Table status
  {
    patterns: [
      `check on (?:table )?${TBL}`,
      `check (?:table )?${TBL}`,
      `how'?s (?:table )?${TBL}`,
      `status (?:of )?(?:table )?${TBL}`,
      `(?:table )?${TBL} status`,
      `how long (?:has )?(?:table )?${TBL}`,
    ],
    intent: 'table_status',
    extract: (m) => ({ table_number: m[1].toUpperCase() }),
    confidence: 0.95,
  },
  // Seat table
  {
    patterns: [
      `seat (?:table )?${TBL} (?:party of )?(\\d+)`,
      `seat (\\d+) (?:at )?(?:table )?${TBL}`,
    ],
    intent: 'seat_table',
    extract: (m, normalized) => {
      // "seat B5 party of 4" → m[1]=b5, m[2]=4
      // "seat 4 at B5" → m[1]=4, m[2]=b5
      const tbl = extractTable(normalized)
      if (tbl) {
        const num = m[1].match(/^\d+$/) ? m[1] : m[2]
        return { table_number: tbl, party_size: num }
      }
      return { table_number: m[1].toUpperCase(), party_size: m[2] || '2' }
    },
    confidence: 0.9,
  },
  // Clear table
  {
    patterns: [
      `clear (?:table )?${TBL}`,
      `(?:table )?${TBL} is leaving`,
      `bus (?:table )?${TBL}`,
    ],
    intent: 'clear_table',
    extract: (m) => ({ table_number: m[1].toUpperCase() }),
    confidence: 0.9,
  },
  // Close out
  {
    patterns: [
      `close out (?:table )?${TBL}`,
      `close (?:table )?${TBL}`,
      `check for (?:table )?${TBL}`,
      `tab for (?:table )?${TBL}`,
    ],
    intent: 'close_out',
    extract: (m) => ({ table_number: m[1].toUpperCase() }),
    confidence: 0.9,
  },
  // Menu lookup (patterns from 1,013 real call transcripts)
  {
    patterns: [
      "what'?s (?:on |in )?the (.+)",
      'what is (?:on |in )?the (.+)',
      'tell me about (?:the )?(.+)',
      'describe (?:the )?(.+)',
      'how much is (?:the )?(.+)',
      'what comes with (?:the )?(.+)',
      'what does the (.+) come with',
      'do we have (.+)',
      'do we still have (.+)',
      'do you guys have (.+)',
      'is the (.+) available',
      'is there (.+) today',
      'what kind of (.+) do we have',
      'how many sides (?:does |do )(?:the )?(.+) (?:come with|get)',
    ],
    intent: 'menu_lookup',
    extract: (m) => ({ item_name: m[1] }),
    confidence: 0.85,
  },
  // 86 / un-86
  {
    patterns: ['86 the (.+)', '86 (.+)', "we'?re out of (.+)", 'no more (.+)'],
    intent: 'eighty_six',
    extract: (m) => ({ item_name: m[1] }),
    confidence: 0.9,
  },
  {
    patterns: ['un.?86 (.+)', '(.+) is back', 'we have (.+) again'],
    intent: 'un_eighty_six',
    extract: (m) => ({ item_name: m[1] }),
    confidence: 0.9,
  },
  // Kitchen message
  {
    patterns: [
      'message kitchen (.+)',
      'tell (?:the )?kitchen (.+)',
    ],
    intent: 'message_kitchen',
    extract: (m) => ({ message: m[1] }),
    confidence: 0.9,
  },
  // Manager message
  {
    patterns: [
      'tell (\\w+) (.+)',
      'message (\\w+) (.+)',
    ],
    intent: 'message_manager',
    extract: (m) => ({ recipient: m[1], message: m[2] }),
    confidence: 0.8,
  },
  // Staff check
  {
    patterns: [
      'when did (\\w+) clock in',
      "who'?s clocked in",
      "who'?s working",
    ],
    intent: 'staff_check',
    extract: (m) => {
      const result: Record<string, string> = {}
      if (m[1]) result.staff_name = m[1]
      return result
    },
    confidence: 0.85,
  },
]

export function parseCommand(rawTranscript: string): ParsedCommand {
  const normalized = normalize(rawTranscript)

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const m = match(pattern, normalized)
      if (m) {
        return {
          intent: rule.intent,
          entities: rule.extract(m, normalized),
          confidence: rule.confidence,
          rawTranscript,
        }
      }
    }
  }

  return {
    intent: 'unknown',
    entities: {},
    confidence: 0,
    rawTranscript,
  }
}

export function intentDisplayName(intent: CommandIntent): string {
  const names: Record<CommandIntent, string> = {
    menu_lookup: 'Menu Lookup',
    order_submit: 'Submit Order',
    table_status: 'Table Status',
    seat_table: 'Seat Table',
    clear_table: 'Clear Table',
    close_out: 'Close Out',
    my_tables: 'My Tables',
    staff_check: 'Staff Check',
    message_kitchen: 'Message Kitchen',
    message_manager: 'Message Manager',
    sales_query: 'Sales Query',
    eighty_six: '86 Item',
    un_eighty_six: 'Un-86 Item',
    cancel_order: 'Cancel Order',
    clock_in: 'Clock In',
    clock_out: 'Clock Out',
    unknown: 'Unknown',
  }
  return names[intent]
}
