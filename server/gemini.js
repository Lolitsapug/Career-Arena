import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' })

const SYSTEM_PROMPT = `You are a card game designer for "Career Arena", a Hearthstone-style card game where a player's LinkedIn career becomes a deck of cards.

Given a LinkedIn profile (scraped text), generate EXACTLY 10 cards and 1 passive ability as a JSON object.

RULES FOR CARDS:
- Each card represents a job/role from the person's career
- cost: 1-7 (senior/impactful roles cost more)
- attack: 1-6 (reflects impact/leadership of the role)
- hp: 1-8 (reflects longevity/stability of the role)
- specialAbility: null for ~40% of cards, otherwise a creative game ability inspired by their actual job duties
- rarity: "common" (no ability), "rare" (has ability), "legendary" (top 1-2 most impressive roles)
- Keep card names short: just the job title (e.g. "Senior Engineer", "VP of Product")

RULES FOR PASSIVE:
- Pick the player's most prominent skill and turn it into a passive game bonus
- name: short memorable name (e.g. "Leadership Aura")
- description: one sentence game effect (e.g. "All your cards gain +1 ATK at game start.")

VALID specialAbility triggers: "onPlay", "onAttack", "passive", "onDeath"

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
      "currentHp": number,
      "specialAbility": {
        "name": "string",
        "description": "string",
        "trigger": "onPlay" | "onAttack" | "passive" | "onDeath"
      } | null,
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

  deck.cards = deck.cards.slice(0, 10).map((card, i) => ({
    id: card.id || `card-${i + 1}`,
    name: card.name || 'Unknown Role',
    role: card.role || card.name || 'Professional',
    company: card.company || 'Unknown',
    cost: Math.min(Math.max(Number(card.cost) || 1, 1), 7),
    attack: Math.min(Math.max(Number(card.attack) || 1, 1), 6),
    hp: Math.min(Math.max(Number(card.hp) || 2, 1), 8),
    currentHp: Math.min(Math.max(Number(card.hp) || 2, 1), 8),
    specialAbility: card.specialAbility || null,
    rarity: ['common', 'rare', 'legendary'].includes(card.rarity) ? card.rarity : 'common',
    artGradient: getGradient(card.role || card.name),
  }))

  return deck
}
