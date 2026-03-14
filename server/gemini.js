import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' })

const SYSTEM_PROMPT = `You are a card game designer for "Career Arena", a Hearthstone-style card game where a player's LinkedIn career becomes a deck of cards.

Given a LinkedIn profile (scraped text), generate EXACTLY 12 cards and 1 passive ability as a JSON object.
About 9 cards should be MINION type and 3 should be SPELL type.

RULES FOR MINION CARDS (type: "MINION"):
- Each card represents a job/role from the person's career
- name: short job title only (e.g. "Senior Engineer", "VP of Product", "Startup Founder")
- cost: 1-8 (senior/impactful roles cost more)
- attack: 1-7 (reflects leadership/impact of the role)
- hp: 1-8 (reflects longevity/stability of the role)
- abilities: an array of 0-2 ability strings chosen from the MINION VALID ABILITIES list below
- About 35% of minions should have no abilities, 45% one ability, 20% two abilities
- rarity: "common" (no abilities), "rare" (1 ability), "legendary" (2 abilities, reserved for top 1-2 roles)
- abilityDescription: a short flavour sentence explaining the ability in career terms. null if no abilities.

RULES FOR SPELL CARDS (type: "SPELL"):
- Each spell represents a career action, skill, or pivotal moment
- name: evocative short name (e.g. "Executive Burnout", "Thought Leadership", "Budget Cut", "Team Reorg")
- cost: 1-6
- attack: 0, hp: 0 (spells have no stats)
- abilities: exactly 1 ability string from the SPELL VALID ABILITIES list below
- rarity: "rare" or "legendary"
- abilityDescription: a flavour sentence describing the spell effect in career terms.

MINION VALID ABILITIES (use ONLY these exact strings):
- "taunt"                    — Must be attacked first. Use for defensive/management roles.
- "divine_shield"            — Absorbs the first hit. Use for stable long-tenure roles.
- "rush"                     — Can attack enemy minions immediately when played. Use for go-getter/sales roles.
- "stealth"                  — Cannot be targeted until it attacks. Use for behind-the-scenes/strategic roles.
- "battlecry_draw_1"         — Battlecry: Draw 1 card. Use for research/learning roles.
- "battlecry_draw_2"         — Battlecry: Draw 2 cards. Use for senior learning/mentoring roles.
- "battlecry_aoe_1"          — Battlecry: Deal 1 damage to ALL enemies. Use for disruptive/founder roles.
- "battlecry_aoe_2"          — Battlecry: Deal 2 damage to ALL enemies. Use for high-impact executive roles.
- "battlecry_buff_friendly"  — Battlecry: Give all friendly minions +1/+1. Use for team-lead roles.
- "battlecry_buff_self"      — Battlecry: Gain +2/+2. Use for individual high-achiever roles.
- "battlecry_silence"        — Battlecry: Silence an enemy minion. Use for influential/disruptive roles.
- "deathrattle_draw_1"       — Deathrattle: Draw 1 card when destroyed. Use for legacy/documentation roles.
- "deathrattle_summon_intern"— Deathrattle: Summon a 1/1 Intern when destroyed. Use for mentor roles.
- "deathrattle_damage_all"   — Deathrattle: Deal 1 damage to ALL minions when destroyed. Use for high-drama exits.
- "deathrattle_heal_hero"    — Deathrattle: Restore 4 HP to your hero when destroyed. Use for loyal/support roles.

SPELL VALID ABILITIES (use ONLY these exact strings):
- "spell_heal_hero"          — Restore 6 HP to your hero. Use for recovery/wellness moments.
- "spell_damage_hero"        — Deal 3 damage to the enemy hero directly. Use for aggressive career moves.
- "spell_damage_hero_5"      — Deal 5 damage to the enemy hero. Use for major disruptions.
- "spell_damage_3"           — Deal 3 damage to a target enemy minion. Use for targeted elimination.
- "spell_aoe_2"              — Deal 2 damage to ALL enemy minions. Use for company-wide restructuring.
- "spell_freeze"             — Freeze an enemy minion (can't attack next turn). Use for bureaucracy/blocking roles.
- "spell_buff_all_1"         — Give all friendly minions +1/+1. Use for team morale boosts.
- "spell_buff_target"        — Give a friendly minion +2/+2. Use for performance reviews/promotions.
- "spell_draw_2"             — Draw 2 cards. Use for research sprints or learning sabbaticals.

RULES FOR PASSIVE:
- Pick the passive that best matches the player's most prominent skill/career theme.
- You MUST choose EXACTLY ONE key from this list — no other values are allowed:
  - "leadership"    → Leadership Aura      — All your cards gain +1 ATK at game start.
  - "communication" → Network Effect       — Draw an extra card each turn.
  - "management"    → Resource Allocation  — Start with 2 extra mana crystals.
  - "engineering"   → Optimization         — Your cards cost 1 less mana (min 1).
  - "design"        → Creative Vision      — Your first card each turn costs 0.
  - "sales"         → Persuasion           — Enemy field cards have -1 ATK.
  - "default"       → Veteran Presence     — Start the game with +5 Hero HP.
- Return ONLY the key string in the "key" field (e.g. "engineering").

Respond ONLY with valid JSON, no markdown, no explanation. Schema:

{
  "ownerName": "string",
  "passive": {
    "key": "leadership" | "communication" | "management" | "engineering" | "design" | "sales" | "default"
  },
  "cards": [
    {
      "id": "card-1",
      "type": "MINION" | "SPELL",
      "name": "string",
      "role": "string",
      "company": "string",
      "cost": number,
      "attack": number,
      "hp": number,
      "abilities": [],
      "abilityDescription": "string | null",
      "rarity": "common" | "rare" | "legendary"
    }
  ]
}`

const ROLE_GRADIENTS = {
  engineer:  'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
  manager:   'linear-gradient(135deg, #3b1f5e 0%, #7c3aed 100%)',
  designer:  'linear-gradient(135deg, #5e1f3b 0%, #db2777 100%)',
  analyst:   'linear-gradient(135deg, #1f4e3b 0%, #059669 100%)',
  executive: 'linear-gradient(135deg, #5e3a1f 0%, #d97706 100%)',
  sales:     'linear-gradient(135deg, #5e1f1f 0%, #dc2626 100%)',
  default:   'linear-gradient(135deg, #1f2e4e 0%, #475569 100%)',
}

function getGradient(role = '') {
  const r = role.toLowerCase()
  if (r.includes('engineer') || r.includes('developer') || r.includes('dev')) return ROLE_GRADIENTS.engineer
  if (r.includes('manager') || r.includes('director')) return ROLE_GRADIENTS.manager
  if (r.includes('design')) return ROLE_GRADIENTS.designer
  if (r.includes('analyst') || r.includes('data') || r.includes('scientist')) return ROLE_GRADIENTS.analyst
  if (r.includes('ceo') || r.includes('chief') || r.includes('vp') || r.includes('president')) return ROLE_GRADIENTS.executive
  if (r.includes('sales') || r.includes('account')) return ROLE_GRADIENTS.sales
  return ROLE_GRADIENTS.default
}

export async function generateDeckFromProfile(profileText, profileUrl) {
  // Parse the scraped name directly — don't trust Gemini to get it right
  let scrapedName = null
  try {
    const parsed = JSON.parse(profileText)
    if (parsed.name && parsed.name.trim()) scrapedName = parsed.name.trim()
  } catch {}

  const prompt = `${SYSTEM_PROMPT}\n\nLinkedIn profile data:\n${profileText}\n\nProfile URL: ${profileUrl}`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()

  const jsonStr = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  let deck
  try {
    deck = JSON.parse(jsonStr)
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${jsonStr.slice(0, 200)}`)
  }

  if (!deck.cards || !Array.isArray(deck.cards)) throw new Error('Gemini response missing cards array')

  // Normalize passive: map the key Gemini returned to the predefined name/description
  const PASSIVE_MAP = {
    leadership:    { name: 'Leadership Aura',    description: 'All your cards gain +1 ATK at game start.' },
    communication: { name: 'Network Effect',     description: 'Draw an extra card each turn.' },
    management:    { name: 'Resource Allocation',description: 'Start with 2 extra mana crystals.' },
    engineering:   { name: 'Optimization',       description: 'Your cards cost 1 less mana (min 1).' },
    design:        { name: 'Creative Vision',    description: 'Your first card each turn costs 0.' },
    sales:         { name: 'Persuasion',         description: 'Enemy field cards have -1 ATK.' },
    default:       { name: 'Veteran Presence',   description: 'Start the game with +5 Hero HP.' },
  }
  const rawPassiveKey = (deck.passive?.key || deck.passive?.name || '').toLowerCase().trim()
  const resolvedKey = Object.keys(PASSIVE_MAP).find(k => rawPassiveKey.includes(k)) ?? 'default'
  deck.passive = { key: resolvedKey, ...PASSIVE_MAP[resolvedKey] }

  // Always use the name scraped directly from the page — Gemini sometimes makes one up
  if (scrapedName) deck.ownerName = scrapedName

  // Include profile metadata for the game engine
  try {
    const parsed = JSON.parse(profileText)
    // Extract company from first experience entry (e.g. "Senior Engineer\nGoogle\n2019 – Present")
    const firstExp = Array.isArray(parsed.experience) ? parsed.experience[0] : ''
    const companyFromExp = firstExp ? firstExp.split('\n').filter(l => l.trim())[1] || 'Unknown' : 'Unknown'
    deck.profileMeta = {
      name: deck.ownerName || parsed.name || 'Unknown',
      title: parsed.headline || 'Professional',
      company: companyFromExp,
      skills: Array.isArray(parsed.skills) ? parsed.skills.slice(0, 8) : [],
      experience: Array.isArray(parsed.experience) ? parsed.experience.length : 1,
      profilePictureUrl: parsed.profilePictureUrl || null,
    }
  } catch {
    deck.profileMeta = { name: deck.ownerName || 'Unknown', title: 'Professional', company: 'Unknown', skills: [], experience: 1, profilePictureUrl: null }
  }

  const VALID_ABILITIES = new Set([
    'taunt', 'divine_shield', 'rush', 'stealth',
    'battlecry_draw_1', 'battlecry_draw_2',
    'battlecry_aoe_1', 'battlecry_aoe_2',
    'battlecry_buff_friendly', 'battlecry_buff_self', 'battlecry_silence',
    'deathrattle_draw_1', 'deathrattle_summon_intern',
    'deathrattle_damage_all', 'deathrattle_heal_hero',
    'spell_heal_hero', 'spell_damage_hero', 'spell_damage_hero_5',
    'spell_damage_3', 'spell_aoe_2', 'spell_freeze',
    'spell_buff_all_1', 'spell_buff_target', 'spell_draw_2',
  ])

  // Fuzzy-match ability strings in case Gemini returns slightly wrong casing/format
  function normaliseAbility(raw) {
    if (typeof raw !== 'string') return null
    const s = raw.toLowerCase().trim().replace(/[-\s]+/g, '_')
    if (VALID_ABILITIES.has(s)) return s
    // partial matches for common mistakes
    if (s.includes('taunt')) return 'taunt'
    if (s.includes('divine')) return 'divine_shield'
    if (s.includes('rush')) return 'rush'
    if (s.includes('stealth')) return 'stealth'
    if (s.includes('charge')) return null // not in our set
    if (s.includes('silence')) return 'battlecry_silence'
    if (s.includes('draw_2') || s.includes('draw2')) return 'battlecry_draw_2'
    if (s.includes('draw_1') || s.includes('draw1') || s.includes('draw')) return 'battlecry_draw_1'
    if (s.includes('aoe_2') || s.includes('aoe2')) return 'battlecry_aoe_2'
    if (s.includes('aoe_1') || s.includes('aoe1') || s.includes('aoe')) return 'battlecry_aoe_1'
    if (s.includes('buff_self')) return 'battlecry_buff_self'
    if (s.includes('buff_friendly') || s.includes('buff')) return 'battlecry_buff_friendly'
    if (s.includes('deathrattle') && s.includes('intern')) return 'deathrattle_summon_intern'
    if (s.includes('deathrattle') && s.includes('heal')) return 'deathrattle_heal_hero'
    if (s.includes('deathrattle') && s.includes('damage')) return 'deathrattle_damage_all'
    if (s.includes('deathrattle')) return 'deathrattle_draw_1'
    if (s.includes('battlecry')) return 'battlecry_draw_1'
    if (s.includes('spell') && s.includes('heal')) return 'spell_heal_hero'
    if (s.includes('spell') && s.includes('damage_hero_5')) return 'spell_damage_hero_5'
    if (s.includes('spell') && s.includes('damage_hero')) return 'spell_damage_hero'
    if (s.includes('spell') && s.includes('damage_3')) return 'spell_damage_3'
    if (s.includes('spell') && s.includes('aoe')) return 'spell_aoe_2'
    if (s.includes('spell') && s.includes('freeze')) return 'spell_freeze'
    if (s.includes('spell') && s.includes('buff_all')) return 'spell_buff_all_1'
    if (s.includes('spell') && s.includes('buff_target')) return 'spell_buff_target'
    if (s.includes('spell') && s.includes('draw')) return 'spell_draw_2'
    return null
  }

  console.log('[gemini] Raw abilities from model:', deck.cards.map(c => `${c.name}: ${JSON.stringify(c.abilities)}`).join(' | '))

  deck.cards = deck.cards.slice(0, 12).map((card, i) => {
    const isSpell = card.type === 'SPELL'
    const hp = isSpell ? 0 : Math.min(Math.max(Number(card.hp) || 2, 1), 8)
    const attack = isSpell ? 0 : Math.min(Math.max(Number(card.attack) || 1, 0), 7)
    const rawAbilities = Array.isArray(card.abilities) ? card.abilities : []
    const maxAbilities = isSpell ? 1 : 2
    const abilities = [...new Set(rawAbilities.map(normaliseAbility).filter(Boolean))].slice(0, maxAbilities)
    return {
      id: card.id || `card-${i + 1}`,
      type: isSpell ? 'SPELL' : 'MINION',
      name: card.name || (isSpell ? 'Career Event' : 'Unknown Role'),
      role: card.role || card.name || 'Professional',
      company: card.company || 'Unknown',
      cost: Math.min(Math.max(Number(card.cost) || 1, 0), 8),
      attack,
      hp,
      abilities,
      abilityDescription: card.abilityDescription || null,
      rarity: ['common', 'rare', 'legendary'].includes(card.rarity) ? card.rarity : 'common',
      artGradient: isSpell ? 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)' : getGradient(card.role || card.name),
    }
  })

  // Guarantee at least one taunt card
  const hasTaunt = deck.cards.some(c => c.abilities.includes('taunt'))
  console.log(`[gemini] After normalise — ${hasTaunt ? 'already has taunt' : 'ADDING TAUNT'}`)
  console.log('[gemini] Abilities per card:', deck.cards.map(c => `${c.name}: [${c.abilities.join(',')}]`).join(' | '))
  if (!hasTaunt && deck.cards.length > 0) {
    const idx = deck.cards.reduce((best, c, i) =>
      Math.abs(c.cost - 3.5) < Math.abs(deck.cards[best].cost - 3.5) ? i : best
    , 0)
    const card = deck.cards[idx]
    card.abilities = ['taunt', ...card.abilities.filter(a => a !== 'taunt')].slice(0, 2)
    card.rarity = card.rarity === 'common' ? 'rare' : card.rarity
    card.abilityDescription = card.abilityDescription || 'A cornerstone role — stood firm and took every hit so the team could thrive.'
    console.log(`[gemini] Added taunt to: ${card.name} -> [${card.abilities.join(',')}]`)
  }

  return deck
}
