let cardIdCounter = 0;
function uid() {
  return `c${++cardIdCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

function make(template) {
  const abs = template.abilities || [];
  return {
    ...template,
    id: uid(),
    maxHealth: template.health ?? 0,
    abilities: [...abs],
    hasDivineShield: abs.includes('divine_shield'),
    canAttack: false,
    attacksAvailable: 0,
    damaged: false,
  };
}

// Skills → card templates
const SKILL_MAP = {
  python:            { name: 'Script Wizard',         attack: 2, health: 3, cost: 2, type: 'MINION', description: 'Battlecry: Deal 1 damage to ALL enemies', abilities: ['battlecry_aoe_1'] },
  javascript:        { name: 'Frontend Ninja',         attack: 3, health: 2, cost: 2, type: 'MINION', description: 'Charge',                                   abilities: ['charge'] },
  typescript:        { name: 'Type-Safe Dev',          attack: 2, health: 4, cost: 3, type: 'MINION', description: 'Taunt',                                    abilities: ['taunt'] },
  java:              { name: 'Enterprise Architect',   attack: 2, health: 5, cost: 3, type: 'MINION', description: 'Taunt',                                    abilities: ['taunt'] },
  react:             { name: 'Component Builder',      attack: 1, health: 3, cost: 2, type: 'MINION', description: 'Battlecry: Draw 2 cards',                  abilities: ['battlecry_draw_2'] },
  'machine learning':{ name: 'Neural Network',         attack: 4, health: 4, cost: 5, type: 'MINION', description: 'Divine Shield',                            abilities: ['divine_shield'] },
  ai:                { name: 'AI Engineer',            attack: 3, health: 5, cost: 5, type: 'MINION', description: 'Divine Shield. Taunt',                     abilities: ['divine_shield', 'taunt'] },
  'data science':    { name: 'Data Analyst',           attack: 1, health: 4, cost: 3, type: 'MINION', description: 'Battlecry: Draw a card',                   abilities: ['battlecry_draw_1'] },
  sql:               { name: 'Query Master',           attack: 2, health: 2, cost: 1, type: 'MINION', description: '',                                         abilities: [] },
  aws:               { name: 'Cloud Architect',        attack: 3, health: 3, cost: 3, type: 'MINION', description: 'Taunt. Divine Shield',                     abilities: ['taunt', 'divine_shield'] },
  kubernetes:        { name: 'K8s Wrangler',           attack: 2, health: 5, cost: 4, type: 'MINION', description: 'Taunt',                                    abilities: ['taunt'] },
  docker:            { name: 'Container Wizard',       attack: 3, health: 3, cost: 3, type: 'MINION', description: '',                                         abilities: [] },
  leadership:        { name: 'Team Lead',              attack: 2, health: 4, cost: 3, type: 'MINION', description: 'Battlecry: Give all friendly minions +1/+1', abilities: ['battlecry_buff_all_1'] },
  management:        { name: 'VP of Engineering',      attack: 3, health: 6, cost: 5, type: 'MINION', description: 'Taunt',                                    abilities: ['taunt'] },
  product:           { name: 'Product Manager',        attack: 1, health: 5, cost: 3, type: 'MINION', description: 'Taunt. Battlecry: Draw a card',             abilities: ['taunt', 'battlecry_draw_1'] },
  design:            { name: 'UX Wizard',              attack: 0, health: 0, cost: 2, type: 'SPELL',  description: 'Deal 3 damage to a minion',                abilities: ['spell_damage_3'] },
  marketing:         { name: 'Growth Hacker',          attack: 2, health: 2, cost: 2, type: 'MINION', description: 'Charge',                                   abilities: ['charge'] },
  sales:             { name: 'Deal Closer',            attack: 4, health: 2, cost: 3, type: 'MINION', description: 'Charge',                                   abilities: ['charge'] },
  finance:           { name: 'CFO',                    attack: 3, health: 5, cost: 5, type: 'MINION', description: 'Taunt',                                    abilities: ['taunt'] },
  blockchain:        { name: 'Web3 Dev',               attack: 4, health: 3, cost: 4, type: 'MINION', description: 'Divine Shield',                            abilities: ['divine_shield'] },
  devops:            { name: 'DevOps Engineer',        attack: 2, health: 4, cost: 3, type: 'MINION', description: 'Taunt',                                    abilities: ['taunt'] },
  security:          { name: 'Security Expert',        attack: 3, health: 4, cost: 4, type: 'MINION', description: 'Divine Shield',                            abilities: ['divine_shield'] },
  mobile:            { name: 'App Developer',          attack: 2, health: 2, cost: 1, type: 'MINION', description: 'Charge',                                   abilities: ['charge'] },
  go:                { name: 'Gopher Dev',             attack: 3, health: 3, cost: 3, type: 'MINION', description: '',                                         abilities: [] },
  rust:              { name: 'Systems Hacker',         attack: 4, health: 2, cost: 3, type: 'MINION', description: 'Charge. Divine Shield',                    abilities: ['charge', 'divine_shield'] },
  c:                 { name: 'Low-Level Guru',         attack: 4, health: 3, cost: 4, type: 'MINION', description: 'Divine Shield',                            abilities: ['divine_shield'] },
  agile:             { name: 'Scrum Master',           attack: 1, health: 4, cost: 2, type: 'MINION', description: 'Battlecry: Draw a card',                   abilities: ['battlecry_draw_1'] },
  communication:     { name: 'Public Speaker',         attack: 2, health: 3, cost: 2, type: 'MINION', description: '',                                         abilities: [] },
  analytics:         { name: 'Metrics Guru',           attack: 1, health: 3, cost: 2, type: 'MINION', description: 'Battlecry: Draw a card',                   abilities: ['battlecry_draw_1'] },
};

const TITLE_CARDS = {
  ceo:      { name: 'Chief Executive Officer',   attack: 6, health: 8, cost: 8, type: 'MINION', description: 'Taunt. Battlecry: Give all friendly minions +2/+2', abilities: ['taunt', 'battlecry_buff_all_2'] },
  cto:      { name: 'Chief Technology Officer',  attack: 5, health: 7, cost: 7, type: 'MINION', description: 'Divine Shield. Taunt',                              abilities: ['divine_shield', 'taunt'] },
  cfo:      { name: 'Chief Financial Officer',   attack: 3, health: 8, cost: 7, type: 'MINION', description: 'Taunt. Battlecry: Draw 2 cards',                    abilities: ['taunt', 'battlecry_draw_2'] },
  vp:       { name: 'Vice President',            attack: 4, health: 6, cost: 6, type: 'MINION', description: 'Taunt. Battlecry: Draw 2 cards',                    abilities: ['taunt', 'battlecry_draw_2'] },
  director: { name: 'Director',                  attack: 4, health: 5, cost: 5, type: 'MINION', description: 'Battlecry: Deal 2 damage to ALL enemies',           abilities: ['battlecry_aoe_2'] },
  senior:   { name: 'Senior Engineer',           attack: 3, health: 4, cost: 4, type: 'MINION', description: 'Divine Shield',                                     abilities: ['divine_shield'] },
  lead:     { name: 'Tech Lead',                 attack: 3, health: 5, cost: 5, type: 'MINION', description: 'Taunt. Battlecry: Give all friendly minions +1/+1', abilities: ['taunt', 'battlecry_buff_all_1'] },
  principal:{ name: 'Principal Engineer',        attack: 4, health: 6, cost: 6, type: 'MINION', description: 'Divine Shield. Taunt',                              abilities: ['divine_shield', 'taunt'] },
  founder:  { name: 'Startup Founder',           attack: 5, health: 5, cost: 6, type: 'MINION', description: 'Charge. Battlecry: Draw 2 cards',                   abilities: ['charge', 'battlecry_draw_2'] },
  intern:   { name: 'Eager Intern',              attack: 1, health: 1, cost: 1, type: 'MINION', description: 'Charge',                                            abilities: ['charge'] },
  manager:  { name: 'Engineering Manager',       attack: 2, health: 5, cost: 4, type: 'MINION', description: 'Taunt. Battlecry: Give all friendly minions +1/+1', abilities: ['taunt', 'battlecry_buff_all_1'] },
  staff:    { name: 'Staff Engineer',            attack: 4, health: 5, cost: 5, type: 'MINION', description: 'Divine Shield',                                     abilities: ['divine_shield'] },
};

const COMPANY_CARDS = {
  google:    { name: 'Googler',          attack: 3, health: 5, cost: 4, type: 'MINION', description: 'Battlecry: Draw 2 cards',       abilities: ['battlecry_draw_2'] },
  meta:      { name: 'Meta Engineer',   attack: 4, health: 4, cost: 4, type: 'MINION', description: 'Charge',                        abilities: ['charge'] },
  apple:     { name: 'Apple Developer', attack: 3, health: 6, cost: 5, type: 'MINION', description: 'Divine Shield',                 abilities: ['divine_shield'] },
  amazon:    { name: 'AWS Architect',   attack: 4, health: 5, cost: 5, type: 'MINION', description: 'Taunt',                         abilities: ['taunt'] },
  microsoft: { name: 'MS Engineer',     attack: 3, health: 5, cost: 4, type: 'MINION', description: 'Taunt',                         abilities: ['taunt'] },
  netflix:   { name: 'NFLX Engineer',   attack: 5, health: 4, cost: 5, type: 'MINION', description: 'Charge. Divine Shield',         abilities: ['charge', 'divine_shield'] },
  openai:    { name: 'OpenAI Engineer', attack: 5, health: 5, cost: 6, type: 'MINION', description: 'Battlecry: Draw 2 cards',       abilities: ['battlecry_draw_2'] },
  anthropic: { name: 'Anthropic Dev',   attack: 4, health: 6, cost: 6, type: 'MINION', description: 'Divine Shield. Taunt',          abilities: ['divine_shield', 'taunt'] },
  uber:      { name: 'Uber Engineer',   attack: 3, health: 4, cost: 4, type: 'MINION', description: 'Charge',                        abilities: ['charge'] },
  airbnb:    { name: 'Airbnb Dev',      attack: 3, health: 4, cost: 4, type: 'MINION', description: 'Battlecry: Draw a card',        abilities: ['battlecry_draw_1'] },
  stripe:    { name: 'Stripe Dev',      attack: 4, health: 4, cost: 5, type: 'MINION', description: 'Divine Shield',                 abilities: ['divine_shield'] },
  salesforce:{ name: 'SF Admin',        attack: 2, health: 5, cost: 4, type: 'MINION', description: 'Taunt',                         abilities: ['taunt'] },
  twitter:   { name: 'X Dev',           attack: 3, health: 3, cost: 3, type: 'MINION', description: '',                              abilities: [] },
  linkedin:  { name: 'LinkedIn Dev',    attack: 3, health: 5, cost: 4, type: 'MINION', description: 'Battlecry: Draw a card',        abilities: ['battlecry_draw_1'] },
  spotify:   { name: 'Spotify Dev',     attack: 2, health: 4, cost: 3, type: 'MINION', description: '',                              abilities: [] },
};

const DEFAULT_POOL = [
  { name: 'Junior Developer',    attack: 1, health: 2, cost: 1, type: 'MINION', description: 'Charge',                                         abilities: ['charge'] },
  { name: 'Coffee Break',        attack: 0, health: 0, cost: 1, type: 'SPELL',  description: 'Draw 2 cards',                                    abilities: ['spell_draw_2'] },
  { name: 'The Pivot',           attack: 2, health: 3, cost: 2, type: 'MINION', description: '',                                                abilities: [] },
  { name: 'Networking Event',    attack: 0, health: 0, cost: 2, type: 'SPELL',  description: 'Give all friendly minions +1/+1',                 abilities: ['spell_buff_all_1'] },
  { name: 'Resume Boost',        attack: 0, health: 0, cost: 1, type: 'SPELL',  description: 'Give a minion +2/+2',                             abilities: ['spell_buff_target'] },
  { name: 'Collaboration',       attack: 2, health: 4, cost: 3, type: 'MINION', description: 'Taunt',                                           abilities: ['taunt'] },
  { name: 'Agile Sprint',        attack: 3, health: 2, cost: 3, type: 'MINION', description: 'Charge',                                          abilities: ['charge'] },
  { name: 'Innovation Lab',      attack: 4, health: 4, cost: 5, type: 'MINION', description: 'Divine Shield',                                   abilities: ['divine_shield'] },
  { name: 'Cold Email',          attack: 0, health: 0, cost: 2, type: 'SPELL',  description: 'Deal 3 damage to a minion',                       abilities: ['spell_damage_3'] },
  { name: 'Performance Review',  attack: 5, health: 5, cost: 7, type: 'MINION', description: 'Taunt. Divine Shield',                            abilities: ['taunt', 'divine_shield'] },
  { name: 'Whiteboard Session',  attack: 2, health: 3, cost: 2, type: 'MINION', description: 'Battlecry: Draw a card',                          abilities: ['battlecry_draw_1'] },
  { name: 'Team Building',       attack: 1, health: 1, cost: 1, type: 'MINION', description: 'Battlecry: Summon two 1/1 Interns',               abilities: ['battlecry_spawn_2'] },
  { name: 'Burnout',             attack: 0, health: 0, cost: 3, type: 'SPELL',  description: 'Deal 4 damage to all enemy minions',              abilities: ['spell_aoe_4'] },
  { name: 'Stock Options',       attack: 4, health: 3, cost: 4, type: 'MINION', description: 'Divine Shield',                                   abilities: ['divine_shield'] },
  { name: 'Layoff Notice',       attack: 0, health: 0, cost: 3, type: 'SPELL',  description: 'Destroy a minion with 2 or less Health',          abilities: ['spell_destroy_weak'] },
  { name: 'Tech Debt',           attack: 3, health: 7, cost: 6, type: 'MINION', description: 'Taunt',                                           abilities: ['taunt'] },
  { name: 'Standup Meeting',     attack: 1, health: 3, cost: 2, type: 'MINION', description: '',                                                abilities: [] },
  { name: 'Ping on Slack',       attack: 0, health: 0, cost: 1, type: 'SPELL',  description: 'Deal 2 damage to a minion',                       abilities: ['spell_damage_2'] },
  { name: 'Pair Programming',    attack: 2, health: 2, cost: 2, type: 'MINION', description: '',                                                abilities: [] },
  { name: 'Code Review',         attack: 0, health: 0, cost: 2, type: 'SPELL',  description: 'Give a minion +3/+3',                             abilities: ['spell_buff_target_3'] },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateDeck(profile) {
  const cards = [];

  // 1. Legendary from title
  const titleLower = profile.title.toLowerCase();
  for (const [kw, template] of Object.entries(TITLE_CARDS)) {
    if (titleLower.includes(kw)) {
      cards.push(make(template));
      break;
    }
  }

  // 2. Company signature card
  const companyLower = profile.company.toLowerCase();
  for (const [kw, template] of Object.entries(COMPANY_CARDS)) {
    if (companyLower.includes(kw)) {
      cards.push(make(template));
      break;
    }
  }

  // 3. Skill cards (up to 6)
  const skills = profile.skills || [];
  for (const skill of skills) {
    if (cards.length >= 8) break;
    const sl = skill.toLowerCase().trim();
    for (const [kw, template] of Object.entries(SKILL_MAP)) {
      if (sl.includes(kw) || kw.includes(sl)) {
        cards.push(make(template));
        break;
      }
    }
  }

  // 4. Fill remainder from shuffled default pool
  const pool = shuffle(DEFAULT_POOL);
  let pi = 0;
  while (cards.length < 10) {
    cards.push(make(pool[pi % pool.length]));
    pi++;
  }

  return shuffle(cards.slice(0, 10));
}

export function generateHero(profile) {
  const titleLower = profile.title.toLowerCase();
  let hp = 30;
  if (titleLower.includes('senior') || titleLower.includes('lead') || titleLower.includes('staff')) hp = 32;
  if (titleLower.includes('director') || titleLower.includes('principal') || titleLower.includes('vp')) hp = 35;
  if (titleLower.includes('ceo') || titleLower.includes('cto') || titleLower.includes('founder')) hp = 40;

  return {
    name: profile.name,
    title: profile.title,
    company: profile.company,
    health: hp,
    maxHealth: hp,
    armor: 0,
    attack: 0,
    attacksAvailable: 0,
    initials: profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2),
  };
}
