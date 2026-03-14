import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useCallback, useEffect } from 'react';
import {
  endTurn, beginNewTurn, playCard, selectMinion,
  attackTarget, getValidTargets, resolveSpellTarget, getSpellTargets,
  resolveBattlecryTarget,
} from '../gameEngine.js';
import { generateDeck, generateHero } from '../cardGenerator.js';
import AnimLayer, { getAttackType } from '../AnimLayer.jsx';

// ─── Convert a Gemini-generated deck card to game engine format ───────────────
let _cardIdCtr = 0;
const VALID_ABILITIES = new Set([
  'taunt', 'divine_shield', 'rush', 'charge', 'stealth',
  'battlecry_draw_1', 'battlecry_draw_2',
  'battlecry_aoe_1', 'battlecry_aoe_2',
  'battlecry_buff_friendly', 'battlecry_buff_all_1', 'battlecry_buff_all_2',
  'battlecry_buff_self', 'battlecry_silence',
  'deathrattle_draw_1', 'deathrattle_summon_intern',
  'deathrattle_damage_all', 'deathrattle_heal_hero',
]);

// Detect abilities that may be described in text but not in the abilities array (old format cards)
function inferAbilitiesFromText(existingAbilities, description) {
  const has = a => existingAbilities.includes(a);
  const extras = [];
  const d = (description || '').toLowerCase();

  // Keywords
  if (!has('taunt')         && (d.includes('taunt') || d.includes('must be attacked first') || d.includes('protects other minions'))) extras.push('taunt');
  if (!has('divine_shield') && (d.includes('divine shield') || d.includes('absorbs the first'))) extras.push('divine_shield');
  if (!has('rush')          && d.includes('rush'))   extras.push('rush');
  if (!has('charge')        && d.includes('charge')) extras.push('charge');

  // Deathrattle: draw a card
  if (!has('deathrattle_draw_1') &&
      (d.includes('deathrattle') || d.includes('when this minion dies') || d.includes('when destroyed')) &&
      (d.includes('draw') || d.includes('card'))) {
    extras.push('deathrattle_draw_1');
  }
  // Deathrattle: summon intern
  if (!has('deathrattle_summon_intern') &&
      (d.includes('deathrattle') || d.includes('when this minion dies') || d.includes('when destroyed')) &&
      (d.includes('summon') || d.includes('intern') || d.includes('1/1'))) {
    extras.push('deathrattle_summon_intern');
  }

  // Battlecry: draw cards
  if (!has('battlecry_draw_1') && !has('battlecry_draw_2') &&
      (d.includes('battlecry') || d.includes('when played')) && d.includes('draw')) {
    extras.push(d.includes('2 card') || d.includes('two card') ? 'battlecry_draw_2' : 'battlecry_draw_1');
  }
  // Battlecry: AOE damage
  if (!has('battlecry_aoe_1') && !has('battlecry_aoe_2') &&
      (d.includes('battlecry') || d.includes('when played')) &&
      (d.includes('all enemies') || d.includes('all enemy') || d.includes('deal') && d.includes('damage to all'))) {
    extras.push(d.includes('2 damage') || d.includes('2 dmg') ? 'battlecry_aoe_2' : 'battlecry_aoe_1');
  }
  // Battlecry: buff all friendly minions
  if (!has('battlecry_buff_friendly') && !has('battlecry_buff_all_1') && !has('battlecry_buff_all_2') &&
      (d.includes('battlecry') || d.includes('when played')) &&
      (d.includes('friendly minion') || d.includes('all minion')) &&
      (d.includes('+1/+1') || d.includes('+2/+2'))) {
    extras.push(d.includes('+2/+2') ? 'battlecry_buff_all_2' : 'battlecry_buff_all_1');
  }

  // No slice limit — all valid abilities must be preserved
  return [...existingAbilities, ...extras];
}

function geminiCardToGameCard(card) {
  const rawAbilities = (Array.isArray(card.abilities) ? card.abilities : [])
    .filter(a => VALID_ABILITIES.has(a));
  const description = card.abilityDescription || card.specialAbility?.description || '';
  // Always run inference — fills in abilities that were described in text but not listed (old format)
  const abilities = inferAbilitiesFromText(rawAbilities, description);
  const health = Math.min(Math.max(Number(card.hp) || 2, 1), 10);
  return {
    id: card.id || `g${++_cardIdCtr}_${Math.random().toString(36).slice(2, 6)}`,
    name: card.name || 'Unknown',
    type: 'MINION',
    cost: Math.min(Math.max(Number(card.cost) || 1, 0), 10),
    attack: Math.min(Math.max(Number(card.attack) || 1, 0), 10),
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

// Build a player state from a saved deck (Gemini format) + profile metadata
function buildPlayerFromSavedDeck(savedDeck, initialHandSize) {
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
  // Shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  const hand = cards.splice(0, initialHandSize);
  return { profile, hero, mana: { current: 0, max: 0 }, hand, deck: cards, board: [] };
}

function buildInitialState(deck1, deck2, profile1, profile2) {
  // Use saved deck cards if available, otherwise fall back to cardGenerator
  const p1 = deck1 ? buildPlayerFromSavedDeck(deck1, 3) : (() => {
    const p = profile1 || { name: 'Player 1', title: 'Developer', company: 'Unknown', skills: [], experience: 1 };
    const deck = generateDeck(p); const hero = generateHero(p);
    const hand = deck.splice(0, 3);
    return { profile: p, hero, mana: { current: 0, max: 0 }, hand, deck, board: [] };
  })();
  const p2 = deck2 ? buildPlayerFromSavedDeck(deck2, 4) : (() => {
    const p = profile2 || { name: 'Player 2', title: 'Developer', company: 'Unknown', skills: [], experience: 1 };
    const deck = generateDeck(p); const hero = generateHero(p);
    const hand = deck.splice(0, 4);
    return { profile: p, hero, mana: { current: 0, max: 0 }, hand, deck, board: [] };
  })();
  return {
    phase: 'play', currentPlayer: 0, turn: 1, winner: null, log: [],
    selectedMinion: null, pendingSpell: null, pendingBattlecryTarget: null,
    players: [p1, p2],
  };
}

// ─── Emoji art lookup ─────────────────────────────────────────────────────────
function getArt(card) {
  const n = (card?.name || '').toLowerCase();
  const MAP = {
    ninja:'🥷', wizard:'🧙', architect:'🏗️', engineer:'⚙️', ceo:'👔', cto:'💻',
    founder:'🚀', data:'📊', cloud:'☁️', security:'🔐', developer:'💾', manager:'📋',
    marketing:'📢', sales:'💰', design:'🎨', intern:'🎓', hacker:'💻', network:'🧠',
    product:'📦', analyst:'📈', sprint:'🏃', coffee:'☕', pivot:'🔄', event:'🤝',
    boost:'⬆️', collaboration:'🤜', lab:'🔬', email:'📧', review:'⭐',
    meeting:'📅', slack:'💬', programming:'👥', burnout:'💥', stock:'📈',
    layoff:'🪓', debt:'💸', googler:'🔍', meta:'🌐', apple:'🍎', aws:'☁️',
    netflix:'🎬', open:'🤖', anthropic:'🧬', staff:'🌟', principal:'🎯',
    lead:'🏆', junior:'👦', pair:'👥', gopher:'🐹',
    systems:'🖥️', low:'⚙️', container:'🐳', k8s:'⎈', docker:'🐳',
    wrangler:'🤠', sql:'🗄️', query:'🔍', scrum:'📋', speaker:'🎤',
    neural:'🧠', script:'📜', chief:'👑', vice:'🏛️', deal:'🤝',
  };
  for (const [kw, emoji] of Object.entries(MAP)) {
    if (n.includes(kw)) return emoji;
  }
  if (card?.type === 'SPELL') return '✨';
  return '🃏';
}

// ─── Ability metadata ─────────────────────────────────────────────────────────
const ABILITY_INFO = {
  taunt:                     { label: 'Taunt',          icon: '🛡️', desc: 'Must be attacked before other minions or the hero.' },
  divine_shield:             { label: 'Divine Shield',  icon: '✨', desc: 'Absorbs the first source of damage, then breaks.' },
  rush:                      { label: 'Rush',            icon: '⚡', desc: 'Can attack enemy minions immediately when played.' },
  charge:                    { label: 'Charge',          icon: '💨', desc: 'Can attack immediately, including the enemy hero.' },
  stealth:                   { label: 'Stealth',         icon: '🌑', desc: 'Cannot be targeted by attacks or abilities until it attacks.' },
  battlecry_draw_1:          { label: 'Battlecry',       icon: '🎴', desc: 'When played: Draw 1 card.' },
  battlecry_draw_2:          { label: 'Battlecry',       icon: '🎴', desc: 'When played: Draw 2 cards.' },
  battlecry_aoe_1:           { label: 'Battlecry',       icon: '🎴', desc: 'When played: Deal 1 damage to all enemies.' },
  battlecry_aoe_2:           { label: 'Battlecry',       icon: '🎴', desc: 'When played: Deal 2 damage to all enemies.' },
  battlecry_buff_friendly:   { label: 'Battlecry',       icon: '🎴', desc: 'When played: Give all friendly minions +1/+1.' },
  battlecry_buff_all_1:      { label: 'Battlecry',       icon: '🎴', desc: 'When played: Give all friendly minions +1/+1.' },
  battlecry_buff_all_2:      { label: 'Battlecry',       icon: '🎴', desc: 'When played: Give all friendly minions +2/+2.' },
  battlecry_buff_self:       { label: 'Battlecry',       icon: '🎴', desc: 'When played: Gain +2/+2.' },
  battlecry_silence:         { label: 'Battlecry',       icon: '🎴', desc: 'When played: Silence an enemy minion, removing all its abilities.' },
  deathrattle_draw_1:        { label: 'Deathrattle',     icon: '💀', desc: 'When destroyed: Draw 1 card.' },
  deathrattle_summon_intern: { label: 'Deathrattle',     icon: '💀', desc: 'When destroyed: Summon a 1/1 Intern.' },
  deathrattle_damage_all:    { label: 'Deathrattle',     icon: '💀', desc: 'When destroyed: Deal 1 damage to ALL minions.' },
  deathrattle_heal_hero:     { label: 'Deathrattle',     icon: '💀', desc: 'When destroyed: Restore 4 HP to your hero.' },
};

// ─── Card inspect modal ───────────────────────────────────────────────────────
function CardInspectModal({ card, onClose }) {
  const abilities = (card.abilities || []).filter(a => ABILITY_INFO[a]);
  // Old-format cards store ability info in specialAbility object
  const legacyAbility = card.specialAbility;
  const hasAnything = abilities.length > 0 || legacyAbility || card.description;

  return (
    <div className="inspect-backdrop" onMouseDown={onClose}>
      <div className="inspect-card" onMouseDown={e => e.stopPropagation()}>
        <button className="inspect-close" onClick={onClose}>✕</button>
        <div className="inspect-art">{card.type === 'SPELL' ? '✨' : getArt(card)}</div>
        <div className="inspect-name">{card.name}</div>
        {(card.role && card.role !== card.name) && (
          <div className="inspect-role">{card.role}{card.company ? ` · ${card.company}` : ''}</div>
        )}
        <div className="inspect-stats">
          <div className="inspect-stat"><span>💎</span><span>{card.cost}</span><span>Cost</span></div>
          {card.type !== 'SPELL' && <>
            <div className="inspect-stat"><span>⚔️</span><span>{card.attack}</span><span>Attack</span></div>
            <div className="inspect-stat"><span>❤️</span><span>{card.health}</span><span>Health</span></div>
          </>}
        </div>

        {/* New-format: structured abilities */}
        {abilities.length > 0 && (
          <div className="inspect-abilities">
            {abilities.map(a => {
              const info = ABILITY_INFO[a];
              return (
                <div key={a} className="inspect-ability">
                  <span className="inspect-ability-icon">{info.icon}</span>
                  <div>
                    <div className="inspect-ability-label">{info.label}</div>
                    <div className="inspect-ability-desc">{info.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Old-format: free-text specialAbility */}
        {abilities.length === 0 && legacyAbility && (
          <div className="inspect-abilities">
            <div className="inspect-ability">
              <span className="inspect-ability-icon">✨</span>
              <div>
                <div className="inspect-ability-label">{legacyAbility.name || legacyAbility.trigger || 'Special Ability'}</div>
                <div className="inspect-ability-desc">{legacyAbility.description}</div>
              </div>
            </div>
          </div>
        )}

        {/* Flavour / description text */}
        {card.description && abilities.length === 0 && !legacyAbility && (
          <div className="inspect-abilities">
            <div className="inspect-ability">
              <span className="inspect-ability-icon">✨</span>
              <div>
                <div className="inspect-ability-label">Ability</div>
                <div className="inspect-ability-desc">{card.description}</div>
              </div>
            </div>
          </div>
        )}

        {!hasAnything && <p className="inspect-no-ability">No special abilities</p>}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ManaBar({ mana }) {
  return (
    <div className="mana-bar">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className={`mana-crystal ${i < mana.current ? 'full' : 'empty'}`} />
      ))}
      <span className="mana-text">{mana.current}/{mana.max}</span>
    </div>
  );
}

function DeckCounter({ count }) {
  return (
    <div className="deck-counter">
      <div className="deck-icon">🂠</div>
      <span>{count}</span>
    </div>
  );
}

function Hero({ hero, playerIdx, isOpponent, isValidTarget, isTauntBlocked, onClick, isCurrentPlayer, isFlashing }) {
  return (
    <div
      data-hero-idx={playerIdx}
      className={`hero-portrait ${isOpponent ? 'hero-opponent' : 'hero-player'} ${isValidTarget ? 'valid-target' : ''} ${isTauntBlocked ? 'taunt-blocked' : ''} ${isCurrentPlayer && !isOpponent ? 'active-hero' : ''} ${isFlashing ? 'hero-taking-damage' : ''}`}
      onClick={onClick}
      title={isTauntBlocked ? 'A Taunt minion must be attacked first!' : `${hero.name} — ${hero.title} @ ${hero.company}`}
    >
      <div className="hero-avatar">
        {hero.profilePictureUrl ? (
          <img src={hero.profilePictureUrl} alt={hero.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        ) : (
          hero.initials
        )}
      </div>
      <div className="hero-health">
        <span className="health-icon">❤</span>
        {hero.armor > 0 && <span className="hero-armor">🛡{hero.armor}</span>}
        <span>{hero.health}</span>
      </div>
      <div className="hero-name-tag">{hero.name.split(' ')[0]}</div>
    </div>
  );
}

function HandCard({ card, canPlay, cantAfford, onClick, isOpponent, onInspect }) {
  if (isOpponent) return <div className="hand-card hand-card--back" />;
  const abilities = (card.abilities || []).filter(a => ABILITY_INFO[a]);
  // For old-format cards with no abilities array, show description as a generic row
  const legacyDesc = abilities.length === 0 && (card.description || card.specialAbility?.description);
  const legacyName = abilities.length === 0 && card.specialAbility?.name;

  return (
    <div
      className={`hand-card ${canPlay ? 'can-play' : ''} ${card.type === 'SPELL' ? 'spell-card' : ''} ${cantAfford ? 'cant-afford' : ''}`}
      onClick={onClick}
      onContextMenu={e => { e.preventDefault(); onInspect(card); }}
    >
      <div className="card-cost">{card.cost}</div>
      <div className="card-art">{card.type === 'SPELL' ? '✨' : getArt(card)}</div>
      <div className="card-name">{card.name}</div>

      <div className="card-ability-rows">
        {abilities.map(a => {
          const info = ABILITY_INFO[a];
          return (
            <div key={a} className="card-ability-row">
              <span className="card-ability-row-icon">{info.icon}</span>
              <span className="card-ability-row-text"><strong>{info.label}:</strong> {info.desc}</span>
            </div>
          );
        })}
        {legacyDesc && (
          <div className="card-ability-row">
            <span className="card-ability-row-icon">✨</span>
            <span className="card-ability-row-text">
              {legacyName && <strong>{legacyName}: </strong>}
              {legacyDesc}
            </span>
          </div>
        )}
      </div>

      {card.type === 'MINION' && (
        <div className="card-stats">
          <span className="card-attack">⚔{card.attack}</span>
          <span className="card-health">❤{card.health}</span>
        </div>
      )}
    </div>
  );
}

function BoardMinionCard({ minion, isSelected, isValidTarget, canAttack, onClick, onInspect, isLunging, isTakingHit, isNewlyPlayed }) {
  const abilities = (minion.abilities || []).filter(a => ABILITY_INFO[a]);
  return (
    <div
      data-minion-id={minion.id}
      className={`board-minion
        ${isSelected       ? 'selected-attacker' : ''}
        ${isValidTarget    ? 'valid-target'       : ''}
        ${canAttack        ? 'can-attack'         : 'exhausted'}
        ${minion.abilities?.includes('taunt') ? 'has-taunt' : ''}
        ${minion.hasDivineShield ? 'has-divine' : ''}
        ${minion.stealthed  ? 'is-stealthed'      : ''}
        ${minion.silenced   ? 'is-silenced'       : ''}
        ${isLunging        ? 'lunging'            : ''}
        ${isTakingHit      ? 'taking-hit'         : ''}
        ${isNewlyPlayed    ? 'just-summoned'      : ''}
      `}
      onClick={onClick}
      onContextMenu={e => { e.preventDefault(); onInspect(minion); }}
    >
      {minion.abilities?.includes('taunt') && <div className="taunt-shield" />}
      {minion.hasDivineShield && <div className="divine-aura" />}
      <div className="minion-art">{getArt(minion)}</div>
      <div className="minion-name">{minion.name}</div>
      {abilities.length > 0 && (
        <div className="minion-ability-badges">
          {abilities.map(a => (
            <div key={a} className="minion-ability-badge">
              <span className="minion-ability-badge-icon">{ABILITY_INFO[a].icon}</span>
              <span className="minion-ability-badge-label">{ABILITY_INFO[a].label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="minion-stats">
        <span className="stat-attack">⚔{minion.attack}</span>
        <span className={`stat-health ${minion.damaged ? 'damaged' : ''}`}>❤{minion.health}</span>
      </div>
      {!canAttack && <div className="exhausted-overlay" />}
    </div>
  );
}

function TransitionScreen({ nextPlayerName, onReady }) {
  return (
    <div className="transition-screen">
      <div className="transition-card">
        <div className="transition-icon">🔄</div>
        <h2>Turn Over!</h2>
        <p>Pass the device to</p>
        <div className="transition-player-name">{nextPlayerName}</div>
        <button className="ready-btn" onClick={onReady}>I'm Ready — Begin Turn</button>
      </div>
    </div>
  );
}

function GameOverScreen({ winner, onRestart }) {
  return (
    <div className="transition-screen">
      <div className="transition-card gameover-card">
        <div className="transition-icon">🏆</div>
        <h2>{winner.hero.name} Wins!</h2>
        <p className="gameover-title">{winner.hero.title}</p>
        <p className="gameover-company">@ {winner.hero.company}</p>
        <button className="ready-btn" onClick={onRestart}>Play Again</button>
      </div>
    </div>
  );
}

// ─── Animation helpers ────────────────────────────────────────────────────────
let _animIdCtr = 0;
function makeId() { return `a${++_animIdCtr}_${Date.now()}`; }

function getCenter(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// ─── Main GameBoard ───────────────────────────────────────────────────────────
export default function GameBoard() {
  const location = useLocation();
  const navigate = useNavigate();

  const { profile1, profile2, deck1, deck2 } = location.state || {};

  const [state, setState] = useState(() => beginNewTurn(buildInitialState(deck1, deck2, profile1, profile2)));

  const [anims, setAnims]             = useState([]);
  const [deathGhosts, setDeathGhosts] = useState([]);
  const [shakingIds, setShakingIds]   = useState(new Set());
  const [hitIds, setHitIds]           = useState(new Set());
  const [flashHeroes, setFlashHeroes] = useState(new Set());
  const [screenFlash, setScreenFlash] = useState(false);
  const [newlyPlayed, setNewlyPlayed] = useState(new Set());
  const [inspectedCard, setInspectedCard] = useState(null);
  const [cantAffordId, setCantAffordId] = useState(null);

  function queueAnim(animObj, delay = 0, duration = 700) {
    const id = makeId();
    setTimeout(() => {
      setAnims(prev => [...prev, { ...animObj, id }]);
      setTimeout(() => setAnims(prev => prev.filter(a => a.id !== id)), duration);
    }, delay);
  }

  function shakeMinionId(minionId, isHit) {
    const setter = isHit ? setHitIds : setShakingIds;
    setter(prev => new Set([...prev, minionId]));
    setTimeout(() => setter(prev => { const n = new Set(prev); n.delete(minionId); return n; }), 420);
  }

  function flashHeroFn(playerIdx) {
    setFlashHeroes(prev => new Set([...prev, playerIdx]));
    setTimeout(() => setFlashHeroes(prev => { const n = new Set(prev); n.delete(playerIdx); return n; }), 450);
  }

  function triggerAttack(curState, nextState, startPos, endPos, atkType, damage, isHero, oppIdx) {
    if (!startPos || !endPos) return;

    const atkBI = curState.selectedMinion?.boardIdx;
    const atkMinion = curState.players[curState.currentPlayer].board[atkBI];
    if (atkMinion) shakeMinionId(atkMinion.id, false);

    queueAnim({ kind: 'projectile', attackType: atkType, startX: startPos.x, startY: startPos.y, endX: endPos.x, endY: endPos.y }, 0, 400);
    queueAnim({ kind: 'impact', attackType: atkType, x: endPos.x, y: endPos.y }, 310, 600);
    queueAnim({ kind: 'damage-num', x: endPos.x, y: endPos.y - 20, amount: damage }, 330, 1000);

    if (!isHero) {
      const defMinion = curState.players[oppIdx].board.find(m => {
        const el = document.querySelector(`[data-minion-id="${m.id}"]`);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return Math.abs(r.left + r.width / 2 - endPos.x) < 50 && Math.abs(r.top + r.height / 2 - endPos.y) < 50;
      });
      if (defMinion) setTimeout(() => shakeMinionId(defMinion.id, true), 310);
    } else {
      setTimeout(() => {
        flashHeroFn(oppIdx);
        queueAnim({ kind: 'heart-crack', x: endPos.x, y: endPos.y }, 0, 900);
        setScreenFlash(true);
        setTimeout(() => setScreenFlash(false), 500);
      }, 310);
    }

    for (let p = 0; p < 2; p++) {
      for (const pm of curState.players[p].board) {
        const nm = nextState.players[p].board.find(m => m.id === pm.id);
        if (nm && pm.hasDivineShield && !nm.hasDivineShield) {
          const el = document.querySelector(`[data-minion-id="${pm.id}"]`);
          const pos = getCenter(el);
          if (pos) setTimeout(() => queueAnim({ kind: 'divine-burst', x: pos.x, y: pos.y }, 0, 600), 310);
        }
      }
    }

    const deadGhosts = [];
    for (let p = 0; p < 2; p++) {
      for (const pm of curState.players[p].board) {
        if (!nextState.players[p].board.find(m => m.id === pm.id)) {
          const el = document.querySelector(`[data-minion-id="${pm.id}"]`);
          const pos = getCenter(el);
          if (pos) deadGhosts.push({ id: `ghost_${pm.id}_${makeId()}`, minion: { ...pm, art: getArt(pm) }, x: pos.x, y: pos.y });
        }
      }
    }
    if (deadGhosts.length > 0) {
      setTimeout(() => {
        setDeathGhosts(prev => [...prev, ...deadGhosts]);
        const ids = deadGhosts.map(g => g.id);
        setTimeout(() => setDeathGhosts(prev => prev.filter(g => !ids.includes(g.id))), 900);
      }, 350);
    }
  }

  const cur = state.currentPlayer;
  const opp = 1 - cur;
  const curPlayer = state.players[cur];
  const oppPlayer = state.players[opp];
  const validTargets = getValidTargets(state);
  const spellTargets = getSpellTargets(state);

  const handlePlayCard = useCallback((cardIdx) => {
    const card = state.players[cur].hand[cardIdx];
    if (!card) return;
    // Not enough mana — show indicator and bail
    if (state.players[cur].mana.current < card.cost) {
      setCantAffordId(card.id);
      setTimeout(() => setCantAffordId(null), 600);
      return;
    }
    const { state: ns } = playCard(state, cardIdx);
    if (card.type === 'MINION') {
      const newMinion = ns.players[cur].board[ns.players[cur].board.length - 1];
      if (newMinion) {
        setNewlyPlayed(prev => new Set([...prev, newMinion.id]));
        setTimeout(() => setNewlyPlayed(prev => { const n = new Set(prev); n.delete(newMinion.id); return n; }), 500);
        setTimeout(() => {
          const el = document.querySelector(`[data-minion-id="${newMinion.id}"]`);
          const pos = getCenter(el);
          if (pos) queueAnim({ kind: 'summon', attackType: getAttackType(card), x: pos.x, y: pos.y }, 0, 600);
        }, 50);
      }
    }
    setState(ns);
  }, [state, cur]);

  const handleSelectMinion = useCallback((playerIdx, boardIdx) => {
    if (state.pendingBattlecryTarget) {
      // Silence targeting — must pick an enemy minion
      if (playerIdx !== opp) return; // must be enemy
      setState(resolveBattlecryTarget(state, boardIdx));
      return;
    }
    if (state.pendingSpell) {
      const isFriendly = playerIdx === cur;
      const abs = state.pendingSpell.card.abilities || [];
      const isBuff = abs.some(a => a.startsWith('spell_buff_target'));
      const isDmg  = abs.some(a => ['spell_damage_3', 'spell_damage_2'].includes(a));
      const targetEl = document.querySelector(`[data-minion-id="${state.players[playerIdx].board[boardIdx]?.id}"]`);
      const targetPos = getCenter(targetEl);

      if (isBuff && isFriendly) {
        if (targetPos) queueAnim({ kind: 'impact', attackType: 'magic', x: targetPos.x, y: targetPos.y }, 0, 600);
        setState(resolveSpellTarget(state, 'friendly_minion', boardIdx));
      } else if (isDmg && !isFriendly) {
        const ns = resolveSpellTarget(state, 'enemy_minion', boardIdx);
        const casterEl = document.querySelector(`[data-hero-idx="${cur}"]`);
        const casterPos = getCenter(casterEl);
        if (casterPos && targetPos) {
          queueAnim({ kind: 'projectile', attackType: 'magic', startX: casterPos.x, startY: casterPos.y, endX: targetPos.x, endY: targetPos.y }, 0, 400);
          const dmg = abs.includes('spell_damage_3') ? 3 : 2;
          queueAnim({ kind: 'impact', attackType: 'magic', x: targetPos.x, y: targetPos.y }, 310, 600);
          queueAnim({ kind: 'damage-num', x: targetPos.x, y: targetPos.y - 20, amount: dmg }, 330, 900);
          const target = state.players[opp].board[boardIdx];
          if (target && target.health - dmg <= 0) {
            setTimeout(() => {
              setDeathGhosts(prev => [...prev, { id: `ghost_spell_${makeId()}`, minion: { ...target, art: getArt(target) }, x: targetPos.x, y: targetPos.y }]);
              setTimeout(() => setDeathGhosts(prev => prev.slice(1)), 900);
            }, 350);
          }
        }
        setState(ns);
      }
      return;
    }

    if (playerIdx === cur) {
      setState(selectMinion(state, playerIdx, boardIdx));
      return;
    }

    if (!state.selectedMinion) return;
    const attacker = state.players[cur].board[state.selectedMinion.boardIdx];
    const defender = state.players[opp].board[boardIdx];
    if (!attacker || !defender) return;

    const atkPos = getCenter(document.querySelector(`[data-minion-id="${attacker.id}"]`));
    const defPos = getCenter(document.querySelector(`[data-minion-id="${defender.id}"]`));
    const ns = attackTarget(state, 'enemy_minion', boardIdx);
    triggerAttack(state, ns, atkPos, defPos, getAttackType(attacker), attacker.attack, false, opp);
    setState(ns);
  }, [state, cur, opp]);

  const handleHeroClick = useCallback((playerIdx) => {
    if (state.pendingSpell || playerIdx !== opp || !state.selectedMinion) return;
    if (!validTargets.hero) return; // taunt minion present — must attack it first
    const attacker = state.players[cur].board[state.selectedMinion.boardIdx];
    if (!attacker) return;
    const atkPos  = getCenter(document.querySelector(`[data-minion-id="${attacker.id}"]`));
    const heroPos = getCenter(document.querySelector(`[data-hero-idx="${opp}"]`));
    const ns = attackTarget(state, 'enemy_hero', null);
    triggerAttack(state, ns, atkPos, heroPos, getAttackType(attacker), attacker.attack, true, opp);
    setState(ns);
  }, [state, cur, opp]);

  const handleEndTurn     = useCallback(() => { if (!state.pendingSpell) setState(endTurn(state)); }, [state]);
  const handleReady       = useCallback(() => setState(beginNewTurn(state)), [state]);
  const handleCancelSpell = useCallback(() => setState(s => ({ ...s, pendingSpell: null })), []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.code !== 'Space' || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      if (state.phase === 'play' && !state.pendingSpell) setState(endTurn(state));
      else if (state.phase === 'transition') setState(beginNewTurn(state));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state]);

  if (state.phase === 'gameover')   return <GameOverScreen winner={state.players[state.winner]} onRestart={() => navigate('/')} />;
  if (state.phase === 'transition') return <TransitionScreen nextPlayerName={state.players[state.currentPlayer].hero.name} onReady={handleReady} />;

  return (
    <div className="game-board">
      <div className="player-area opponent-area">
        <div className="hero-zone">
          <Hero hero={oppPlayer.hero} playerIdx={opp} isOpponent isValidTarget={validTargets.hero}
            isTauntBlocked={!!state.selectedMinion && !validTargets.hero}
            onClick={() => handleHeroClick(opp)} isCurrentPlayer={false} isFlashing={flashHeroes.has(opp)} />
          <DeckCounter count={oppPlayer.deck.length} />
          <div className="opp-mana-info">
            <div className="mana-crystal full" style={{ opacity: 0.5 }} />
            <span>{oppPlayer.mana.current}/{oppPlayer.mana.max}</span>
          </div>
        </div>
        <div className="hand-zone opponent-hand">
          {oppPlayer.hand.map((_, i) => <HandCard key={i} card={null} isOpponent />)}
        </div>
      </div>

      <div className="board-area">
        <div className="minion-row opponent-row">
          {oppPlayer.board.map((minion, i) => (
            <BoardMinionCard key={minion.id} minion={minion} isSelected={false}
              isValidTarget={(!!state.selectedMinion && validTargets.minions.includes(i)) || (!!state.pendingSpell && spellTargets.enemyMinions.includes(i)) || (!!state.pendingBattlecryTarget && state.pendingBattlecryTarget.type === 'silence')}
              canAttack={false} onClick={() => handleSelectMinion(opp, i)} onInspect={setInspectedCard}
              isLunging={shakingIds.has(minion.id)} isTakingHit={hitIds.has(minion.id)} isNewlyPlayed={newlyPlayed.has(minion.id)} />
          ))}
          {oppPlayer.board.length === 0 && <div className="empty-board-hint opp-hint">Opponent's side</div>}
        </div>

        <div className="board-divider"><div className="rope" /></div>

        <div className="minion-row player-row">
          {curPlayer.board.map((minion, i) => (
            <BoardMinionCard key={minion.id} minion={minion}
              isSelected={state.selectedMinion?.boardIdx === i && state.selectedMinion?.playerIdx === cur}
              isValidTarget={!!state.pendingSpell && spellTargets.friendlyMinions.includes(i)}
              canAttack={minion.canAttack} onClick={() => handleSelectMinion(cur, i)} onInspect={setInspectedCard}
              isLunging={shakingIds.has(minion.id)} isTakingHit={hitIds.has(minion.id)} isNewlyPlayed={newlyPlayed.has(minion.id)} />
          ))}
          {curPlayer.board.length === 0 && <div className="empty-board-hint">Play minions here</div>}
        </div>
      </div>

      <div className="player-area current-area">
        <div className="hero-zone">
          <Hero hero={curPlayer.hero} playerIdx={cur} isOpponent={false} isValidTarget={false}
            onClick={() => handleHeroClick(cur)} isCurrentPlayer isFlashing={flashHeroes.has(cur)} />
          <DeckCounter count={curPlayer.deck.length} />
          <ManaBar mana={curPlayer.mana} />
        </div>
        <div className="hand-zone player-hand">
          {curPlayer.hand.map((card, i) => (
            <HandCard key={card.id} card={card}
              canPlay={curPlayer.mana.current >= card.cost && (card.type === 'SPELL' || curPlayer.board.length < 7)}
              cantAfford={cantAffordId === card.id}
              onClick={() => handlePlayCard(i)} isOpponent={false} onInspect={setInspectedCard} />
          ))}
        </div>
      </div>

      <div className="end-turn-zone">
        <button className={`end-turn-btn ${(state.pendingSpell || state.pendingBattlecryTarget) ? 'disabled' : ''}`}
          onClick={(state.pendingSpell || state.pendingBattlecryTarget) ? undefined : handleEndTurn}>
          {(state.pendingSpell || state.pendingBattlecryTarget) ? 'Choose Target' : 'END TURN'}
        </button>
        {state.pendingSpell && <button className="cancel-btn" onClick={handleCancelSpell}>Cancel</button>}
        {state.pendingBattlecryTarget && <button className="cancel-btn" onClick={() => setState(s => ({ ...s, pendingBattlecryTarget: null }))}>Skip</button>}
        <div className="turn-indicator">Turn {state.turn}</div>
        <div className="active-player-label">{curPlayer.hero.name}</div>
      </div>

      {state.selectedMinion && !state.pendingSpell && (
        <div className="action-hint">Select an enemy target to attack</div>
      )}
      {state.pendingSpell && (
        <div className="action-hint spell-hint">
          🎯 Select a target for <strong>{state.pendingSpell.card.name}</strong>
        </div>
      )}
      {state.pendingBattlecryTarget && (
        <div className="action-hint spell-hint">
          🤫 Select an enemy minion to <strong>Silence</strong>
        </div>
      )}

      {state.log?.length > 0 && <div className="game-log">{state.log[0]}</div>}
      <AnimLayer anims={anims} deathGhosts={deathGhosts} screenFlash={screenFlash} />
      {inspectedCard && <CardInspectModal card={inspectedCard} onClose={() => setInspectedCard(null)} />}
    </div>
  );
}
