import { generateHero } from '../cardGenerator.js';

let _cardIdCtr = 0;

export const VALID_ABILITIES = new Set([
  'taunt', 'divine_shield', 'rush', 'charge', 'stealth',
  'battlecry_draw_1', 'battlecry_draw_2',
  'battlecry_aoe_1', 'battlecry_aoe_2',
  'battlecry_buff_friendly', 'battlecry_buff_all_1', 'battlecry_buff_all_2',
  'battlecry_buff_self', 'battlecry_silence',
  'deathrattle_draw_1', 'deathrattle_summon_intern',
  'deathrattle_damage_all', 'deathrattle_heal_hero',
  'spell_heal_hero', 'spell_damage_hero', 'spell_damage_hero_5',
  'spell_damage_3', 'spell_aoe_2', 'spell_freeze',
  'spell_buff_all_1', 'spell_buff_target', 'spell_draw_2',
]);

export function inferAbilitiesFromText(existingAbilities, description) {
  const has = a => existingAbilities.includes(a);
  const extras = [];
  const d = (description || '').toLowerCase();

  if (!has('taunt')         && (d.includes('taunt') || d.includes('must be attacked first') || d.includes('protects other minions'))) extras.push('taunt');
  if (!has('divine_shield') && (d.includes('divine shield') || d.includes('absorbs the first'))) extras.push('divine_shield');
  if (!has('rush')          && d.includes('rush'))   extras.push('rush');
  if (!has('charge')        && d.includes('charge')) extras.push('charge');

  if (!has('deathrattle_draw_1') &&
      (d.includes('deathrattle') || d.includes('when this minion dies') || d.includes('when destroyed')) &&
      (d.includes('draw') || d.includes('card'))) {
    extras.push('deathrattle_draw_1');
  }
  if (!has('deathrattle_summon_intern') &&
      (d.includes('deathrattle') || d.includes('when this minion dies') || d.includes('when destroyed')) &&
      (d.includes('summon') || d.includes('intern') || d.includes('1/1'))) {
    extras.push('deathrattle_summon_intern');
  }

  if (!has('battlecry_draw_1') && !has('battlecry_draw_2') &&
      (d.includes('battlecry') || d.includes('when played')) && d.includes('draw')) {
    extras.push(d.includes('2 card') || d.includes('two card') ? 'battlecry_draw_2' : 'battlecry_draw_1');
  }
  if (!has('battlecry_aoe_1') && !has('battlecry_aoe_2') &&
      (d.includes('battlecry') || d.includes('when played')) &&
      (d.includes('all enemies') || d.includes('all enemy') || d.includes('deal') && d.includes('damage to all'))) {
    extras.push(d.includes('2 damage') || d.includes('2 dmg') ? 'battlecry_aoe_2' : 'battlecry_aoe_1');
  }
  if (!has('battlecry_buff_friendly') && !has('battlecry_buff_all_1') && !has('battlecry_buff_all_2') &&
      (d.includes('battlecry') || d.includes('when played')) &&
      (d.includes('friendly minion') || d.includes('all minion')) &&
      (d.includes('+1/+1') || d.includes('+2/+2'))) {
    extras.push(d.includes('+2/+2') ? 'battlecry_buff_all_2' : 'battlecry_buff_all_1');
  }

  return [...existingAbilities, ...extras];
}

export function geminiCardToGameCard(card) {
  const rawAbilities = (Array.isArray(card.abilities) ? card.abilities : [])
    .filter(a => VALID_ABILITIES.has(a));
  const description = card.abilityDescription || card.specialAbility?.description || '';
  const abilities = inferAbilitiesFromText(rawAbilities, description);
  const health = Math.min(Math.max(Number(card.hp) || 2, 1), 10);
  return {
    id: card.id || `g${++_cardIdCtr}_${Math.random().toString(36).slice(2, 6)}`,
    name: card.name || 'Unknown',
    type: card.type === 'SPELL' ? 'SPELL' : 'MINION',
    cost: Math.min(Math.max(Number(card.cost) || 1, 0), 10),
    attack: card.type === 'SPELL' ? 0 : Math.min(Math.max(Number(card.attack) || 1, 0), 10),
    health,
    maxHealth: health,
    description,
    abilities,
    hasDivineShield: abilities.includes('divine_shield'),
    canAttack: false,
    attacksAvailable: 0,
    damaged: false,
    dead: false,
  };
}

export function buildPlayerFromSavedDeck(savedDeck, initialHandSize) {
  const profile = savedDeck.profileMeta || {
    name: savedDeck.ownerName || 'Unknown',
    title: 'Professional',
    company: 'Unknown',
    skills: [],
    experience: 1,
    profilePictureUrl: null,
  };
  const hero = generateHero(profile);
  const cards = (savedDeck.cards || []).map(geminiCardToGameCard);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  const hand = cards.splice(0, initialHandSize);
  return { profile, hero, mana: { current: 0, max: 0 }, hand, deck: cards, board: [], discard: [] };
}

export function buildInitialState(deck1, deck2, generateDeck) {
  const p1 = buildPlayerFromSavedDeck(deck1, 3);
  const p2 = buildPlayerFromSavedDeck(deck2, 4);
  return {
    phase: 'play', currentPlayer: 0, turn: 1, winner: null, log: [],
    selectedMinion: null, pendingSpell: null, pendingBattlecryTarget: null,
    players: [p1, p2],
  };
}
