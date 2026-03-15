let idCounter = 0
const uid = () => `card-${++idCounter}-${Math.random().toString(36).slice(2, 7)}`

const ROLE_GRADIENTS = {
  engineer:   'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
  manager:    'linear-gradient(135deg, #3b1f5e 0%, #7c3aed 100%)',
  designer:   'linear-gradient(135deg, #5e1f3b 0%, #db2777 100%)',
  analyst:    'linear-gradient(135deg, #1f4e3b 0%, #059669 100%)',
  executive:  'linear-gradient(135deg, #5e3a1f 0%, #d97706 100%)',
  sales:      'linear-gradient(135deg, #5e1f1f 0%, #dc2626 100%)',
  default:    'linear-gradient(135deg, #1f2e4e 0%, #475569 100%)',
}

const ABILITIES = [
  { name: 'Battlecry', description: 'Draw 1 card when played.', trigger: 'onPlay' },
  { name: 'Synergy', description: '+1 ATK to all allied cards when played.', trigger: 'onPlay' },
  { name: 'Resilience', description: 'Survive lethal damage once.', trigger: 'passive' },
  { name: 'Mentor', description: 'The next card you play costs 1 less.', trigger: 'onPlay' },
  { name: 'Disruption', description: 'Silence a target card, removing its ability.', trigger: 'onPlay' },
  { name: 'Last Stand', description: 'Deal 2 damage to all enemies on death.', trigger: 'onDeath' },
  null,
  null,
  null, // null = no special ability (common cards)
]

const PASSIVE_MAP = {
  leadership:   { name: 'Leadership Aura', description: 'All your cards gain +1 ATK at game start.' },
  communication: { name: 'Network Effect', description: 'Draw an extra card each turn.' },
  management:   { name: 'Resource Allocation', description: 'Start with 2 extra mana crystals.' },
  engineering:  { name: 'Optimization', description: 'Your cards cost 1 less mana (min 1).' },
  design:       { name: 'Creative Vision', description: 'Your first card each turn costs 0.' },
  sales:        { name: 'Persuasion', description: 'Enemy field cards have -1 ATK.' },
  default:      { name: 'Veteran Presence', description: 'Start the game with +5 Hero HP.' },
}

function getRoleType(title = '') {
  const t = title.toLowerCase()
  if (t.includes('engineer') || t.includes('developer') || t.includes('dev')) return 'engineer'
  if (t.includes('manager') || t.includes('director')) return 'manager'
  if (t.includes('design')) return 'designer'
  if (t.includes('analyst') || t.includes('data') || t.includes('scientist')) return 'analyst'
  if (t.includes('ceo') || t.includes('cto') || t.includes('vp') || t.includes('chief')) return 'executive'
  if (t.includes('sales') || t.includes('account')) return 'sales'
  return 'default'
}

function pickPassive(skills = []) {
  const skillStr = skills.join(' ').toLowerCase()
  for (const key of Object.keys(PASSIVE_MAP)) {
    if (skillStr.includes(key)) return { key, ...PASSIVE_MAP[key] }
  }
  return { key: 'default', ...PASSIVE_MAP.default }
}

const NEW_ABILITIES = [
  ['battlecry_draw_1'],
  ['rush'],
  ['divine_shield'],
  ['deathrattle_draw_1'],
  ['battlecry_buff_friendly'],
  ['deathrattle_summon_intern'],
  [],
  [],
  [],
]

export function generateMockDeck(profile) {
  const { name = 'Unknown', title = '', company = '', skills = [], experiences = [] } = profile

  const jobs = experiences.length > 0
    ? experiences
    : [{ title: title || 'Professional', company: company || 'Tech Co.' }]

  const cards = []
  for (let i = 0; i < 10; i++) {
    const job = jobs[i % jobs.length]
    const roleType = getRoleType(job.title)
    const seniorityBonus = job.title?.toLowerCase().includes('senior') ? 1 : 0
    const cost = Math.min(Math.max(1 + Math.floor(i / 3), 1), 7)
    const attack = 1 + Math.floor(Math.random() * 3) + seniorityBonus
    const hp = 2 + Math.floor(Math.random() * 4) + seniorityBonus
    const abilities = NEW_ABILITIES[Math.floor(Math.random() * NEW_ABILITIES.length)]
    const rarity = abilities.length === 0 ? 'common' : (abilities.length === 2 ? 'legendary' : 'rare')

    cards.push({
      id: uid(),
      name: job.title || 'Professional',
      role: job.title || 'Team Member',
      company: job.company || company || 'Company',
      cost,
      attack,
      hp,
      abilities,
      abilityDescription: null,
      artGradient: ROLE_GRADIENTS[roleType] || ROLE_GRADIENTS.default,
      rarity,
    })
  }

  // Guarantee at least one taunt card
  if (!cards.some(c => c.abilities.includes('taunt'))) {
    const idx = cards.reduce((best, c, i) =>
      Math.abs(c.cost - 3.5) < Math.abs(cards[best].cost - 3.5) ? i : best
    , 0)
    cards[idx].abilities = ['taunt', ...cards[idx].abilities.filter(a => a !== 'taunt')].slice(0, 2)
    cards[idx].rarity = 'rare'
    cards[idx].abilityDescription = 'A cornerstone role — stood firm and took every hit so the team could thrive.'
  }

  return { cards, passive: pickPassive(skills), ownerName: name }
}

export const SAMPLE_PROFILE = {
  name: 'Jane Smith',
  title: 'Senior Software Engineer',
  company: 'Google',
  skills: ['engineering', 'leadership', 'communication'],
  experiences: [
    { title: 'Senior Software Engineer', company: 'Google' },
    { title: 'Software Engineer', company: 'Meta' },
    { title: 'Junior Developer', company: 'StartupCo' },
    { title: 'Engineering Manager', company: 'Google' },
    { title: 'Lead Engineer', company: 'Meta' },
    { title: 'Backend Developer', company: 'Stripe' },
    { title: 'Data Engineer', company: 'Netflix' },
    { title: 'Senior Developer', company: 'Amazon' },
    { title: 'Staff Engineer', company: 'Google' },
    { title: 'Tech Lead', company: 'Airbnb' },
  ],
}

export const SAMPLE_PROFILE_2 = {
  name: 'Mark Rivera',
  title: 'Product Manager',
  company: 'Meta',
  skills: ['management', 'communication', 'sales'],
  experiences: [
    { title: 'Senior Product Manager', company: 'Meta' },
    { title: 'Product Manager', company: 'Uber' },
    { title: 'Associate PM', company: 'Google' },
    { title: 'Director of Product', company: 'Meta' },
    { title: 'Growth Manager', company: 'Airbnb' },
    { title: 'Sales Director', company: 'Salesforce' },
    { title: 'Account Executive', company: 'Oracle' },
    { title: 'Product Lead', company: 'Stripe' },
    { title: 'VP of Product', company: 'Meta' },
    { title: 'Chief Product Officer', company: 'StartupXYZ' },
  ],
}
