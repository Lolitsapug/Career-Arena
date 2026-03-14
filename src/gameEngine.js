import { generateDeck, generateHero } from './cardGenerator.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function drawCards(player, n) {
  const p = deepClone(player);
  for (let i = 0; i < n; i++) {
    if (p.deck.length === 0) {
      // Fatigue: deal 1 damage (simplified – just skip)
      break;
    }
    if (p.hand.length < 10) {
      p.hand.push(p.deck.shift());
    }
    // else card is burned
  }
  return p;
}

function hasTaunt(board) {
  return board.some(m => m.abilities.includes('taunt') && !m.dead);
}

function applyDamageToMinion(minion, amount) {
  const m = { ...minion };
  if (m.hasDivineShield) {
    m.hasDivineShield = false;
    return m;
  }
  m.health -= amount;
  m.damaged = true;
  if (m.health <= 0) m.dead = true;
  return m;
}

function applyDamageToHero(hero, amount) {
  const h = { ...hero };
  const absorbed = Math.min(h.armor, amount);
  h.armor -= absorbed;
  h.health -= (amount - absorbed);
  return h;
}

function removeDeadMinions(board) {
  return board.filter(m => !m.dead);
}

function resolveDeathrattles(state, playerIdx, deadMinions) {
  let s = deepClone(state);
  for (const m of deadMinions) {
    const abs = m.abilities || [];
    if (abs.includes('deathrattle_draw_1')) {
      s.players[playerIdx] = drawCards(s.players[playerIdx], 1);
    }
    if (abs.includes('deathrattle_summon_intern') && s.players[playerIdx].board.length < 7) {
      s.players[playerIdx].board.push({
        id: `intern_dr_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        name: 'Intern', attack: 1, health: 1, maxHealth: 1, cost: 0,
        type: 'MINION', description: 'Summoned by Deathrattle',
        abilities: [], hasDivineShield: false,
        canAttack: false, attacksAvailable: 0, damaged: false, dead: false,
      });
    }
  }
  return s;
}

// Remove dead minions and fire their deathrattles
function removeDeadAndResolve(state) {
  let s = deepClone(state);
  for (let pi = 0; pi < 2; pi++) {
    const dead = s.players[pi].board.filter(m => m.dead);
    s.players[pi].board = s.players[pi].board.filter(m => !m.dead);
    if (dead.length > 0) s = resolveDeathrattles(s, pi, dead);
  }
  return s;
}

function resolveBattlecry(state, playerIdx, card) {
  let s = deepClone(state);
  const abs = card.abilities || [];

  if (abs.includes('battlecry_draw_1')) {
    s.players[playerIdx] = drawCards(s.players[playerIdx], 1);
  }
  if (abs.includes('battlecry_draw_2')) {
    s.players[playerIdx] = drawCards(s.players[playerIdx], 2);
  }
  if (abs.includes('battlecry_aoe_1') || abs.includes('battlecry_aoe_2')) {
    const dmg = abs.includes('battlecry_aoe_2') ? 2 : 1;
    const oppIdx = 1 - playerIdx;
    s.players[oppIdx].board = s.players[oppIdx].board.map(m => applyDamageToMinion(m, dmg));
    s.players[oppIdx].hero = applyDamageToHero(s.players[oppIdx].hero, dmg);
    s.players[oppIdx].board = removeDeadMinions(s.players[oppIdx].board);
  }
  if (abs.includes('battlecry_buff_all_1') || abs.includes('battlecry_buff_all_2') || abs.includes('battlecry_buff_friendly')) {
    const bonus = abs.includes('battlecry_buff_all_2') ? 2 : 1;
    s.players[playerIdx].board = s.players[playerIdx].board.map(m => ({
      ...m,
      attack: m.attack + bonus,
      health: m.health + bonus,
      maxHealth: m.maxHealth + bonus,
    }));
  }
  if (abs.includes('battlecry_spawn_2')) {
    for (let i = 0; i < 2 && s.players[playerIdx].board.length < 7; i++) {
      s.players[playerIdx].board.push({
        id: `intern_${Date.now()}_${i}`,
        name: 'Intern',
        attack: 1,
        health: 1,
        maxHealth: 1,
        cost: 0,
        type: 'MINION',
        description: '',
        abilities: [],
        hasDivineShield: false,
        canAttack: false,
        attacksAvailable: 0,
        damaged: false,
        dead: false,
      });
    }
  }
  return s;
}

function resolveSpell(state, playerIdx, card, targetType, targetIdx) {
  let s = deepClone(state);
  const abs = card.abilities || [];
  const oppIdx = 1 - playerIdx;

  if (abs.includes('spell_draw_2')) {
    s.players[playerIdx] = drawCards(s.players[playerIdx], 2);
  }
  if (abs.includes('spell_buff_all_1')) {
    s.players[playerIdx].board = s.players[playerIdx].board.map(m => ({
      ...m, attack: m.attack + 1, health: m.health + 1, maxHealth: m.maxHealth + 1,
    }));
  }
  if (abs.includes('spell_buff_target') || abs.includes('spell_buff_target_3')) {
    const bonus = abs.includes('spell_buff_target_3') ? 3 : 2;
    if (targetType === 'friendly_minion' && targetIdx != null) {
      const m = s.players[playerIdx].board[targetIdx];
      if (m) {
        m.attack += bonus;
        m.health += bonus;
        m.maxHealth += bonus;
      }
    } else if (s.players[playerIdx].board.length > 0) {
      // fallback: buff the first minion
      s.players[playerIdx].board[0].attack += bonus;
      s.players[playerIdx].board[0].health += bonus;
      s.players[playerIdx].board[0].maxHealth += bonus;
    }
  }
  if (abs.includes('spell_damage_3') || abs.includes('spell_damage_2')) {
    const dmg = abs.includes('spell_damage_3') ? 3 : 2;
    if (targetType === 'enemy_minion' && targetIdx != null) {
      s.players[oppIdx].board[targetIdx] = applyDamageToMinion(s.players[oppIdx].board[targetIdx], dmg);
      s.players[oppIdx].board = removeDeadMinions(s.players[oppIdx].board);
    } else if (targetType === 'friendly_minion' && targetIdx != null) {
      // spell can target friendly too
      s.players[playerIdx].board[targetIdx] = applyDamageToMinion(s.players[playerIdx].board[targetIdx], dmg);
      s.players[playerIdx].board = removeDeadMinions(s.players[playerIdx].board);
    } else if (s.players[oppIdx].board.length > 0) {
      // fallback: damage random enemy minion
      const ri = Math.floor(Math.random() * s.players[oppIdx].board.length);
      s.players[oppIdx].board[ri] = applyDamageToMinion(s.players[oppIdx].board[ri], dmg);
      s.players[oppIdx].board = removeDeadMinions(s.players[oppIdx].board);
    }
  }
  if (abs.includes('spell_aoe_4')) {
    s.players[oppIdx].board = s.players[oppIdx].board.map(m => applyDamageToMinion(m, 4));
    s.players[oppIdx].board = removeDeadMinions(s.players[oppIdx].board);
  }
  if (abs.includes('spell_destroy_weak')) {
    // Destroy lowest health enemy minion
    const weakIdx = s.players[oppIdx].board.findIndex(m => m.health <= 2);
    if (weakIdx !== -1) {
      s.players[oppIdx].board.splice(weakIdx, 1);
    }
  }
  return s;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function createInitialState(profile1, profile2) {
  function buildPlayer(profile, initialHandSize) {
    const deck = generateDeck(profile);
    const hero = generateHero(profile);
    const hand = deck.splice(0, initialHandSize);
    return { profile, hero, mana: { current: 0, max: 0 }, hand, deck, board: [] };
  }

  return {
    phase: 'play',
    currentPlayer: 0,
    turn: 1,
    winner: null,
    log: [],
    // UI state (kept in game state for simplicity)
    selectedMinion: null,   // { playerIdx, boardIdx }
    pendingSpell: null,      // { cardIdx, card } – spell awaiting target selection
    players: [
      buildPlayer(profile1, 3),
      buildPlayer(profile2, 4),
    ],
  };
}

/** Called at start of each player's turn */
export function startTurn(state) {
  let s = deepClone(state);
  const pi = s.currentPlayer;
  const p = s.players[pi];

  // Increase mana
  const newMax = Math.min(p.mana.max + 1, 10);
  p.mana = { current: newMax, max: newMax };

  // Draw a card
  s.players[pi] = drawCards(p, 1);

  // Enable attacks on all board minions (clear rushOnly restriction at start of each new turn)
  s.players[pi].board = s.players[pi].board.map(m => ({
    ...m,
    canAttack: true,
    attacksAvailable: m.abilities?.includes('windfury') ? 2 : 1,
    rushOnly: false,
  }));

  s.selectedMinion = null;
  s.pendingSpell = null;
  s.log = [`[Turn ${s.turn}] ${s.players[pi].hero.name}'s turn begins.`];
  return s;
}

/** Play a card from hand. Returns { state, needsTarget: bool } */
export function playCard(state, cardIndex) {
  let s = deepClone(state);
  const pi = s.currentPlayer;
  const p = s.players[pi];
  const card = p.hand[cardIndex];

  if (!card) return { state: s, needsTarget: false };
  if (p.mana.current < card.cost) return { state: s, needsTarget: false };
  if (card.type === 'MINION' && p.board.length >= 7) return { state: s, needsTarget: false };

  // Deduct mana
  s.players[pi].mana.current -= card.cost;

  // Remove from hand
  s.players[pi].hand.splice(cardIndex, 1);

  if (card.type === 'MINION') {
    // Place on board
    const hasCharge = card.abilities?.includes('charge');
    const hasRush   = card.abilities?.includes('rush');
    const minion = {
      ...card,
      canAttack: hasCharge || hasRush,
      attacksAvailable: (hasCharge || hasRush) ? 1 : 0,
      rushOnly: hasRush && !hasCharge, // rush minions can't attack hero on first turn
      dead: false,
    };
    s.players[pi].board.push(minion);

    // Resolve battlecry (synchronously – ignore async spawn edge case)
    s = resolveBattlecry(s, pi, card);
    s.log = [`${p.hero.name} played ${card.name}`];
  } else {
    // Spell
    const needsTarget = (card.abilities || []).some(a =>
      ['spell_damage_3', 'spell_damage_2', 'spell_buff_target', 'spell_buff_target_3'].includes(a)
    );
    if (needsTarget) {
      s.pendingSpell = { cardIndex, card };
      // Card already removed from hand; if cancelled we won't re-add for simplicity
      return { state: s, needsTarget: true };
    } else {
      s = resolveSpell(s, pi, card, null, null);
      s.log = [`${p.hero.name} cast ${card.name}`];
    }
  }

  s = checkWin(s);
  return { state: s, needsTarget: false };
}

/** Resolve a pending spell on a chosen target */
export function resolveSpellTarget(state, targetType, targetIdx) {
  let s = deepClone(state);
  if (!s.pendingSpell) return s;
  const { card } = s.pendingSpell;
  const pi = s.currentPlayer;
  s.pendingSpell = null;
  s = resolveSpell(s, pi, card, targetType, targetIdx);
  s.log = [`${s.players[pi].hero.name} cast ${card.name}`];
  s = checkWin(s);
  return s;
}

/** Select / deselect a friendly minion as attacker */
export function selectMinion(state, playerIdx, boardIdx) {
  let s = deepClone(state);
  if (s.currentPlayer !== playerIdx) return s; // can't select opponent's minions
  const minion = s.players[playerIdx].board[boardIdx];
  if (!minion || !minion.canAttack || minion.attacksAvailable < 1) return s;

  if (s.selectedMinion?.playerIdx === playerIdx && s.selectedMinion?.boardIdx === boardIdx) {
    s.selectedMinion = null; // deselect
  } else {
    s.selectedMinion = { playerIdx, boardIdx };
  }
  return s;
}

/** Attack: selected minion attacks a target (enemy minion or enemy hero) */
export function attackTarget(state, targetType, targetIdx) {
  let s = deepClone(state);
  if (!s.selectedMinion) return s;

  const { playerIdx: atkPI, boardIdx: atkBI } = s.selectedMinion;
  const oppIdx = 1 - atkPI;
  const attacker = s.players[atkPI].board[atkBI];
  if (!attacker || !attacker.canAttack) return s;

  const oppBoard = s.players[oppIdx].board;
  const hasTnt = hasTaunt(oppBoard);

  if (targetType === 'enemy_minion') {
    if (hasTnt && !oppBoard[targetIdx]?.abilities?.includes('taunt')) {
      // Must attack taunt first
      return s;
    }
    const defender = oppBoard[targetIdx];
    if (!defender) return s;

    // Mutual damage
    s.players[oppIdx].board[targetIdx] = applyDamageToMinion(defender, attacker.attack);
    s.players[atkPI].board[atkBI] = applyDamageToMinion(attacker, defender.attack);

    s = removeDeadAndResolve(s);
  } else if (targetType === 'enemy_hero') {
    if (hasTnt) return s; // must attack taunt first
    if (attacker.rushOnly) return s; // rush minions can't attack heroes until next turn
    s.players[oppIdx].hero = applyDamageToHero(s.players[oppIdx].hero, attacker.attack);
    // Attacker takes no damage when hitting hero
    // Exhaust attacker
    if (s.players[atkPI].board[atkBI]) {
      s.players[atkPI].board[atkBI].attacksAvailable -= 1;
      if (s.players[atkPI].board[atkBI].attacksAvailable <= 0) {
        s.players[atkPI].board[atkBI].canAttack = false;
      }
    }
  }

  // Exhaust the attacker (if it survived attacking a minion)
  if (targetType === 'enemy_minion') {
    const surviving = s.players[atkPI].board.find(m => m.id === attacker.id);
    if (surviving) {
      surviving.attacksAvailable = Math.max(0, surviving.attacksAvailable - 1);
      if (surviving.attacksAvailable <= 0) surviving.canAttack = false;
    }
  }

  s.selectedMinion = null;
  s.log = [`${attacker.name} attacked ${targetType === 'enemy_hero' ? s.players[oppIdx].hero.name : oppBoard[targetIdx]?.name ?? 'minion'}`];
  s = checkWin(s);
  return s;
}

/** End the current player's turn */
export function endTurn(state) {
  let s = deepClone(state);
  s.selectedMinion = null;
  s.pendingSpell = null;

  // Freeze all current player's minions
  s.players[s.currentPlayer].board = s.players[s.currentPlayer].board.map(m => ({
    ...m, canAttack: false, attacksAvailable: 0,
  }));

  s.currentPlayer = 1 - s.currentPlayer;
  s.turn += 1;
  s.phase = 'transition'; // signal UI to show pass-device screen
  return s;
}

/** Called after the transition screen — actually begins the new player's turn */
export function beginNewTurn(state) {
  let s = deepClone(state);
  s.phase = 'play';
  return startTurn(s);
}

function checkWin(state) {
  let s = deepClone(state);
  for (let i = 0; i < 2; i++) {
    if (s.players[i].hero.health <= 0) {
      s.winner = 1 - i;
      s.phase = 'gameover';
    }
  }
  return s;
}

/** Determine valid attack targets given selected attacker */
export function getValidTargets(state) {
  if (!state.selectedMinion) return { minions: [], hero: false };
  const { playerIdx, boardIdx } = state.selectedMinion;
  const attacker = state.players[playerIdx].board[boardIdx];
  const oppIdx = 1 - playerIdx;
  const oppBoard = state.players[oppIdx].board;
  const tntPresent = hasTaunt(oppBoard);
  const isRushOnly = attacker?.rushOnly;

  if (tntPresent) {
    return {
      minions: oppBoard.map((m, i) => (m.abilities?.includes('taunt') ? i : -1)).filter(i => i !== -1),
      hero: false,
    };
  }
  return {
    minions: oppBoard.map((_, i) => i),
    hero: !isRushOnly,
  };
}

/** Determine valid spell targets given pending spell */
export function getSpellTargets(state) {
  if (!state.pendingSpell) return { friendlyMinions: [], enemyMinions: [], hero: false };
  const pi = state.currentPlayer;
  const oppIdx = 1 - pi;
  const abs = state.pendingSpell.card.abilities || [];

  const isDamage = abs.some(a => ['spell_damage_3', 'spell_damage_2'].includes(a));
  const isBuff = abs.some(a => ['spell_buff_target', 'spell_buff_target_3'].includes(a));

  return {
    friendlyMinions: isBuff ? state.players[pi].board.map((_, i) => i) : [],
    enemyMinions: isDamage ? state.players[oppIdx].board.map((_, i) => i) : [],
    hero: false,
  };
}
