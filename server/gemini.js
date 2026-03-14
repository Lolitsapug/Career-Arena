import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' })

const SYSTEM_PROMPT = `You are a card game designer for "Career Arena", a Hearthstone-style card game where a player's LinkedIn career becomes a deck of cards.

Given a LinkedIn profile (scraped text), generate EXACTLY 10 cards and 1 passive ability as a JSON object.

RULES FOR CARDS:
- Each card represents a job/role from the person's career
- name: short job title only (e.g. "Senior Engineer", "VP of Product", "Startup Founder")
- cost: 1-8 (senior/impactful roles cost more)
- attack: 1-7 (reflects leadership/impact of the role)
- hp: 1-8 (reflects longevity/stability of the role)
- abilities: an array of 0-2 ability strings chosen from the VALID ABILITIES list below
- About 35% of cards should have no abilities, 45% one ability, 20% two abilities
- rarity: "common" (no abilities), "rare" (1 ability), "legendary" (2 abilities, reserved for top 1-2 roles)
- abilityDescription: a short flavour sentence explaining the ability in career terms (e.g. "Blocks all attacks — like a solid project manager protecting the team."). null if no abilities.

VALID ABILITIES (use ONLY these exact strings):
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

RULES FOR PASSIVE:
- Pick the player's most prominent skill and turn it into a passive game bonus
- name: short memorable name (e.g. "Leadership Aura")
- description: one sentence game effect (e.g. "All your minions start with +1 Attack.")

Respond ONLY with valid JSON, no markdown, no explanation. Schema:

{
  "ownerName": "string",
  "passive": {
    "name": "string",
    "description": "string"
  },
  "cards": [
    {
      "id": "card-1",
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
    return null
  }

  console.log('[gemini] Raw abilities from model:', deck.cards.map(c => `${c.name}: ${JSON.stringify(c.abilities)}`).join(' | '))

  deck.cards = deck.cards.slice(0, 10).map((card, i) => {
    const hp = Math.min(Math.max(Number(card.hp) || 2, 1), 8)
    const rawAbilities = Array.isArray(card.abilities) ? card.abilities : []
    const abilities = [...new Set(rawAbilities.map(normaliseAbility).filter(Boolean))].slice(0, 2)
    return {
      id: card.id || `card-${i + 1}`,
      name: card.name || 'Unknown Role',
      role: card.role || card.name || 'Professional',
      company: card.company || 'Unknown',
      cost: Math.min(Math.max(Number(card.cost) || 1, 0), 8),
      attack: Math.min(Math.max(Number(card.attack) || 1, 0), 7),
      hp,
      abilities,
      abilityDescription: card.abilityDescription || null,
      rarity: ['common', 'rare', 'legendary'].includes(card.rarity) ? card.rarity : 'common',
      artGradient: getGradient(card.role || card.name),
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
