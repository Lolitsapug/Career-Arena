import { generateDeck, generateHero } from './cardGenerator.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function isMinionDead(minion) {
  const health = Number(minion?.health);
  return Boolean(minion?.dead) || (Number.isFinite(health) && health <= 0);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function drawCards(player, n) {
  const p = deepClone(player);
  if (!p.discard) p.discard = [];
  for (let i = 0; i < n; i++) {
    if (p.deck.length === 0) {
      if (p.discard.length > 0) {
        // Reshuffle discard pile back into deck
        p.deck = shuffle(p.discard.map(c => ({
          ...c, canAttack: false, attacksAvailable: 0, dead: false, damaged: false,
        })));
        p.discard = [];
      } else {
        break; // truly out of cards
      }
    }
    if (p.hand.length < 10) {
      p.hand.push(p.deck.shift());
    }
    // else card is burned (hand full)
  }
  return p;
}

function hasTaunt(board) {
  return board.some(m => m.abilities?.includes('taunt') && !isMinionDead(m) && !m.stealthed);
}

function isStealthed(minion) {
  return Boolean(minion?.stealthed);
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
  return board.filter(m => !isMinionDead(m));
}

function resolveDeathrattles(state, playerIdx, deadMinions) {
  let s = deepClone(state);
  const oppIdx = 1 - playerIdx;
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
    if (abs.includes('deathrattle_damage_all')) {
      // Deal 1 damage to all minions on both sides
      s.players[playerIdx].board = s.players[playerIdx].board.map(bm => applyDamageToMinion(bm, 1));
      s.players[oppIdx].board    = s.players[oppIdx].board.map(bm => applyDamageToMinion(bm, 1));
      // Note: we don't recurse here to avoid infinite chains — dead minions from this will be cleaned up in the next removeDeadAndResolve pass
    }
    if (abs.includes('deathrattle_heal_hero')) {
      s.players[playerIdx].hero = {
        ...s.players[playerIdx].hero,
        health: Math.min(s.players[playerIdx].hero.health + 4, s.players[playerIdx].hero.maxHealth ?? 30),
      };
    }
  }
  return s;
}

// Remove dead minions and fire their deathrattles
function removeDeadAndResolve(state) {
  let s = deepClone(state);
  for (let pi = 0; pi < 2; pi++) {
    const dead = s.players[pi].board.filter(m => isMinionDead(m));
    s.players[pi].board = s.players[pi].board.filter(m => !isMinionDead(m));
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
    s = removeDeadAndResolve(s); // fire deathrattles on AOE kills
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
  if (abs.includes('battlecry_buff_self')) {
    // Find the just-played minion (last on board) and give it +2/+2
    const board = s.players[playerIdx].board;
    if (board.length > 0) {
      const last = board[board.length - 1];
      last.attack += 2;
      last.health += 2;
      last.maxHealth += 2;
    }
  }
  if (abs.includes('battlecry_silence')) {
    // Silence is targeted — set pendingBattlecryTarget so UI can pick an enemy minion
    // We store it similarly to pendingSpell; the game board will need to handle resolution
    s.pendingBattlecryTarget = { type: 'silence', sourcePlayerIdx: playerIdx };
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

  if (abs.includes('spell_draw_1')) {
    s.players[playerIdx] = drawCards(s.players[playerIdx], 1);
  }
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
      if (m) { m.attack += bonus; m.health += bonus; m.maxHealth += bonus; }
    } else if (s.players[playerIdx].board.length > 0) {
      s.players[playerIdx].board[0].attack += bonus;
      s.players[playerIdx].board[0].health += bonus;
      s.players[playerIdx].board[0].maxHealth += bonus;
    }
  }
  if (abs.includes('spell_damage_3') || abs.includes('spell_damage_2')) {
    const dmg = abs.includes('spell_damage_3') ? 3 : 2;
    if (targetType === 'enemy_minion' && targetIdx != null) {
      s.players[oppIdx].board[targetIdx] = applyDamageToMinion(s.players[oppIdx].board[targetIdx], dmg);
    } else if (targetType === 'friendly_minion' && targetIdx != null) {
      s.players[playerIdx].board[targetIdx] = applyDamageToMinion(s.players[playerIdx].board[targetIdx], dmg);
    } else if (s.players[oppIdx].board.length > 0) {
      const ri = Math.floor(Math.random() * s.players[oppIdx].board.length);
      s.players[oppIdx].board[ri] = applyDamageToMinion(s.players[oppIdx].board[ri], dmg);
    }
    s = removeDeadAndResolve(s); // fire deathrattles on spell kills
  }
  if (abs.includes('spell_aoe_4')) {
    s.players[oppIdx].board = s.players[oppIdx].board.map(m => applyDamageToMinion(m, 4));
    s = removeDeadAndResolve(s); // fire deathrattles on AOE kills
  }
  if (abs.includes('spell_destroy_weak')) {
    const weakIdx = s.players[oppIdx].board.findIndex(m => m.health <= 2);
    if (weakIdx !== -1) {
      s.players[oppIdx].board[weakIdx].dead = true;
      s = removeDeadAndResolve(s);
    }
  }
  if (abs.includes('spell_heal_hero')) {
    const hero = s.players[playerIdx].hero;
    hero.health = Math.min(hero.health + 6, hero.maxHealth || 30);
  }
  if (abs.includes('spell_damage_hero_5')) {
    s.players[oppIdx].hero = applyDamageToHero(s.players[oppIdx].hero, 5);
  } else if (abs.includes('spell_damage_hero')) {
    s.players[oppIdx].hero = applyDamageToHero(s.players[oppIdx].hero, 3);
  }
  if (abs.includes('spell_freeze')) {
    if (targetType === 'enemy_minion' && targetIdx != null) {
      s.players[oppIdx].board[targetIdx].frozen = true;
      s.players[oppIdx].board[targetIdx].canAttack = false;
      s.players[oppIdx].board[targetIdx].attacksAvailable = 0;
    }
  }
  if (abs.includes('spell_aoe_2')) {
    s.players[oppIdx].board = s.players[oppIdx].board.map(m => applyDamageToMinion(m, 2));
    s = removeDeadAndResolve(s);
  }
  return s;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function createInitialState(profile1, profile2) {
  function buildPlayer(profile, initialHandSize) {
    const deck = generateDeck(profile);
    const hero = generateHero(profile);
    const hand = deck.splice(0, initialHandSize);
    return { profile, hero, mana: { current: 0, max: 0 }, hand, deck, board: [], discard: [] };
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
  s.players[pi] = drawCards(s.players[pi], 1);

  // Network Effect: draw 1 extra card each turn
  if (s.players[pi].passive?.key === 'communication') {
    s.players[pi] = drawCards(s.players[pi], 1);
  }

  // Creative Vision: mark that the first card this turn is free
  if (s.players[pi].passive?.key === 'design') {
    s.players[pi].firstCardPlayedThisTurn = true;
  }

  // Enable attacks on all board minions (clear rushOnly + frozen at start of each new turn)
  s.players[pi].board = s.players[pi].board.map(m => ({
    ...m,
    canAttack: !m.frozen,
    attacksAvailable: m.frozen ? 0 : (m.abilities?.includes('windfury') ? 2 : 1),
    rushOnly: false,
    frozen: false, // frozen lasts only one turn
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

  // Creative Vision: first card played this turn costs 0
  let effectiveCost = card.cost;
  if (p.passive?.key === 'design' && p.firstCardPlayedThisTurn) {
    effectiveCost = 0;
    s.players[pi].firstCardPlayedThisTurn = false;
  }

  if (p.mana.current < effectiveCost) return { state: s, needsTarget: false };
  if (card.type === 'MINION' && p.board.length >= 7) return { state: s, needsTarget: false };

  if (card.type === 'MINION') {
    // Deduct mana and remove from hand immediately for minions
    s.players[pi].mana.current -= effectiveCost;
    s.players[pi].hand.splice(cardIndex, 1);
    if (!s.players[pi].discard) s.players[pi].discard = [];
    s.players[pi].discard.push(card);
    // Place on board
    const hasCharge  = card.abilities?.includes('charge');
    const hasRush    = card.abilities?.includes('rush');
    const hasStealth = card.abilities?.includes('stealth');
    const minion = {
      ...card,
      canAttack: hasCharge || hasRush,
      attacksAvailable: (hasCharge || hasRush) ? 1 : 0,
      rushOnly: hasRush && !hasCharge, // rush minions can't attack hero on first turn
      stealthed: hasStealth,
      dead: false,
    };
    s.players[pi].board.push(minion);

    // Persuasion: if opponent has this passive, new minion gets -1 ATK
    const oppIdx = 1 - pi;
    if (s.players[oppIdx].passive?.key === 'sales') {
      const newMinionIdx = s.players[pi].board.length - 1;
      s.players[pi].board[newMinionIdx] = {
        ...s.players[pi].board[newMinionIdx],
        attack: Math.max(0, s.players[pi].board[newMinionIdx].attack - 1),
      };
    }

    // Resolve battlecry (synchronously – ignore async spawn edge case)
    s = resolveBattlecry(s, pi, card);
    s.log = [`${p.hero.name} played ${card.name}`];
  } else {
    // Spell — check if it needs a target before committing mana/hand removal
    const needsTarget = (card.abilities || []).some(a =>
      ['spell_damage_3', 'spell_damage_2', 'spell_buff_target', 'spell_buff_target_3', 'spell_freeze'].includes(a)
    );
    if (needsTarget) {
      // Don't remove from hand or deduct mana yet — wait for target confirmation
      s.pendingSpell = { cardIndex, card, effectiveCost };
      return { state: s, needsTarget: true };
    } else {
      // No target needed — commit immediately
      s.players[pi].mana.current -= effectiveCost;
      s.players[pi].hand.splice(cardIndex, 1);
      if (!s.players[pi].discard) s.players[pi].discard = [];
      s.players[pi].discard.push(card);
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
  const { cardIndex, card, effectiveCost } = s.pendingSpell;
  const pi = s.currentPlayer;
  s.pendingSpell = null;
  // Now commit: deduct mana and remove card from hand
  s.players[pi].mana.current -= (effectiveCost ?? card.cost);
  s.players[pi].hand.splice(cardIndex, 1);
  if (!s.players[pi].discard) s.players[pi].discard = [];
  s.players[pi].discard.push(card);
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

  // Attacking breaks stealth
  if (s.players[atkPI].board[atkBI]) {
    s.players[atkPI].board[atkBI].stealthed = false;
  }

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

/** Current player forfeits — other player wins immediately */
export function forfeitGame(state) {
  let s = deepClone(state);
  s.winner = 1 - s.currentPlayer;
  s.phase = 'gameover';
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
    // Only taunt minions are valid — stealthed taunt minions still must be attacked
    return {
      minions: oppBoard.reduce((acc, m, i) => { if (m.abilities?.includes('taunt') && !m.stealthed) acc.push(i); return acc; }, []),
      hero: false,
    };
  }
  // Stealthed minions cannot be targeted
  return {
    minions: oppBoard.reduce((acc, m, i) => { if (!isStealthed(m)) acc.push(i); return acc; }, []),
    hero: !isRushOnly,
  };
}

/** Resolve a battlecry silence on a target enemy minion */
export function resolveBattlecryTarget(state, targetIdx) {
  let s = deepClone(state);
  if (!s.pendingBattlecryTarget) return s;
  const { type, sourcePlayerIdx } = s.pendingBattlecryTarget;
  s.pendingBattlecryTarget = null;
  const oppIdx = 1 - sourcePlayerIdx;
  if (type === 'silence' && s.players[oppIdx].board[targetIdx]) {
    const m = s.players[oppIdx].board[targetIdx];
    m.abilities = [];
    m.hasDivineShield = false;
    m.stealthed = false;
    m.silenced = true;
  }
  return s;
}

/** Determine valid spell targets given pending spell */
export function getSpellTargets(state) {
  if (!state.pendingSpell) return { friendlyMinions: [], enemyMinions: [], hero: false };
  const pi = state.currentPlayer;
  const oppIdx = 1 - pi;
  const abs = state.pendingSpell.card.abilities || [];

  const isDamage = abs.some(a => ['spell_damage_3', 'spell_damage_2'].includes(a));
  const isBuff = abs.some(a => ['spell_buff_target', 'spell_buff_target_3'].includes(a));
  const isFreeze = abs.includes('spell_freeze');

  return {
    friendlyMinions: isBuff ? state.players[pi].board.map((_, i) => i) : [],
    enemyMinions: (isDamage || isFreeze) ? state.players[oppIdx].board.map((_, i) => i) : [],
    hero: false,
  };
}
