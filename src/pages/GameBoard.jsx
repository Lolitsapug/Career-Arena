import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useCallback, useEffect, useMemo, useRef, memo } from 'react';
import { useTheme } from '../theme.jsx';
import BgParticles from '../components/BgParticles';
import {
  endTurn, beginNewTurn, playCard, selectMinion,
  attackTarget, getValidTargets, resolveSpellTarget, getSpellTargets,
  forfeitGame, resolveBattlecryTarget,
} from '../gameEngine.js';
import { generateDeck, generateHero } from '../cardGenerator.js';
import AnimLayer, { getAttackType } from '../AnimLayer.jsx';
import { useSocket } from '../hooks/useSocket.js';

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
  'spell_heal_hero', 'spell_damage_hero', 'spell_damage_hero_5',
  'spell_damage_3', 'spell_aoe_2', 'spell_freeze',
  'spell_buff_all_1', 'spell_buff_target', 'spell_draw_2',
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
  return { profile, hero, mana: { current: 0, max: 0 }, hand, deck: cards, board: [], discard: [] };
}

function buildInitialState(deck1, deck2, profile1, profile2) {
  // Use saved deck cards if available, otherwise fall back to cardGenerator
  const p1 = deck1 ? buildPlayerFromSavedDeck(deck1, 3) : (() => {
    const p = profile1 || { name: 'Player 1', title: 'Developer', company: 'Unknown', skills: [], experience: 1 };
    const deck = generateDeck(p); const hero = generateHero(p);
    const hand = deck.splice(0, 3);
    return { profile: p, hero, mana: { current: 0, max: 0 }, hand, deck, board: [], discard: [] };
  })();
  const p2 = deck2 ? buildPlayerFromSavedDeck(deck2, 4) : (() => {
    const p = profile2 || { name: 'Player 2', title: 'Developer', company: 'Unknown', skills: [], experience: 1 };
    const deck = generateDeck(p); const hero = generateHero(p);
    const hand = deck.splice(0, 4);
    return { profile: p, hero, mana: { current: 0, max: 0 }, hand, deck, board: [], discard: [] };
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
  spell_heal_hero:           { label: 'Lesser Heal',     icon: '💚', desc: 'Restore 6 HP to your hero.' },
  spell_damage_hero:         { label: 'Mind Blast',      icon: '🎯', desc: 'Deal 3 damage to the enemy hero.' },
  spell_damage_hero_5:       { label: 'Pyroblast',       icon: '🔥', desc: 'Deal 5 damage to the enemy hero.' },
  spell_damage_3:            { label: 'Frostbolt',       icon: '❄️', desc: 'Deal 3 damage to a target minion.' },
  spell_aoe_2:               { label: 'Consecration',    icon: '💥', desc: 'Deal 2 damage to all enemy minions.' },
  spell_freeze:              { label: 'Frost Nova',      icon: '🌨️', desc: 'Freeze an enemy minion — it skips its next attack.' },
  spell_buff_all_1:          { label: 'Mark of the Wild',icon: '🌿', desc: 'Give all friendly minions +1/+1.' },
  spell_buff_target:         { label: 'Power Word',      icon: '⬆️', desc: 'Give a friendly minion +2/+2.' },
  spell_draw_2:              { label: 'Arcane Intellect', icon: '🎴', desc: 'Draw 2 cards.' },
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
const ManaBar = memo(function ManaBar({ mana }) {
  return (
    <div className="mana-bar">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className={`mana-crystal ${i < mana.current ? 'full' : 'empty'}`} />
      ))}
      <span className="mana-text">{mana.current}/{mana.max}</span>
    </div>
  );
});

const DeckCounter = memo(function DeckCounter({ count, isPlayer }) {
  return (
    <div className="deck-counter" data-deck={isPlayer ? 'player' : 'opponent'}>
      <div className="deck-icon">🂠</div>
      <span>{count}</span>
    </div>
  );
});

const Hero = memo(function Hero({ hero, playerIdx, isOpponent, isValidTarget, isTauntBlocked, onClick, isCurrentPlayer, isFlashing }) {
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
    </div>
  );
});

const HandCard = memo(function HandCard({ card, canPlay, cantAfford, onClick, isOpponent, onInspect }) {
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

      {card.type === 'SPELL' ? (
        <div className="spell-text-body">
          {abilities.slice(0, 1).map(a => {
            const info = ABILITY_INFO[a];
            return (
              <div key={a} className="spell-text-block">
                <div className="spell-ability-name">{info.icon} {info.label}</div>
                <div className="spell-ability-desc">{info.desc}</div>
              </div>
            );
          })}
          {abilities.length === 0 && legacyDesc && (
            <div className="spell-text-block">
              <div className="spell-ability-desc">{legacyDesc}</div>
            </div>
          )}
        </div>
      ) : (
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
      )}

      {card.type === 'MINION' && (
        <div className="card-stats">
          <span className="card-attack">⚔{card.attack}</span>
          <span className="card-health">❤{card.health}</span>
        </div>
      )}
    </div>
  );
});

const BoardMinionCard = memo(function BoardMinionCard({ minion, isSelected, isValidTarget, canAttack, isOpponent, onClick, onInspect, isLunging, isTakingHit, isNewlyPlayed, isBuffed, playerIdx, boardIdx }) {
  const abilities = (minion.abilities || []).filter(a => ABILITY_INFO[a]);
  return (
    <div
      data-minion-id={minion.id}
      className={`board-minion
        ${isSelected       ? 'selected-attacker' : ''}
        ${isValidTarget    ? 'valid-target'       : ''}
        ${canAttack ? 'can-attack' : (!isOpponent ? 'exhausted' : '')}
        ${minion.abilities?.includes('taunt') ? 'has-taunt' : ''}
        ${minion.hasDivineShield ? 'has-divine' : ''}
        ${minion.stealthed  ? 'is-stealthed'      : ''}
        ${minion.silenced   ? 'is-silenced'       : ''}
        ${isLunging        ? 'lunging'            : ''}
        ${isTakingHit      ? 'taking-hit'         : ''}
        ${isNewlyPlayed    ? 'just-summoned'      : ''}
      `}
      onClick={() => onClick(playerIdx, boardIdx)}
      onContextMenu={e => { e.preventDefault(); onInspect(minion); }}
    >
      {minion.abilities?.includes('taunt') && <div className="taunt-shield" />}
      {minion.hasDivineShield && <div className="divine-aura" />}
      {minion.stealthed && <div className="stealth-icon">👁</div>}
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
        <span className={`stat-attack ${isBuffed ? 'stat-buffed' : ''}`}>⚔{minion.attack}</span>
        <span className={`stat-health ${minion.damaged ? 'damaged' : ''} ${isBuffed ? 'stat-buffed' : ''}`}>❤{minion.health}</span>
      </div>
      {!canAttack && <div className="exhausted-overlay" />}
    </div>
  );
});

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

function GameOverScreen({ winner, loser, forfeit, onRestart }) {
  const [phase, setPhase] = useState('explode'); // explode → rise → done

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('rise'), 1400);
    const t2 = setTimeout(() => setPhase('done'),  2600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const loserAvatar = loser?.hero?.profilePictureUrl;
  const winnerAvatar = winner?.hero?.profilePictureUrl;

  // Memoised so random values don't re-roll on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fragments = useMemo(() => Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2;
    const dist = 80 + Math.random() * 130;
    return {
      tx: Math.cos(angle) * dist,
      ty: Math.sin(angle) * dist,
      size: 12 + Math.random() * 22,
      delay: Math.random() * 0.15,
      emoji: ['💥','🔥','💢','⚡','🌀','✨','🧨','💫'][i % 8],
    };
  }), []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Gold confetti for winner — memoised
  const confetti = useMemo(() => Array.from({ length: 24 }, (_, i) => ({
    left: `${(i / 24) * 100}%`,
    delay: (i * 0.08) + 's',
    dur: (1.2 + Math.random() * 0.8) + 's',
    emoji: ['🏆','⭐','✨','🥇','💫','🎖️'][i % 6],
  })), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="gameover-screen">
      {/* Loser explosion */}
      <div className={`gameover-loser ${phase === 'explode' ? 'go-exploding' : 'go-hidden'}`}>
        <div className="go-loser-avatar">
          {loserAvatar
            ? <img src={loserAvatar} alt={loser.hero.name} />
            : <span>{loser?.hero?.initials || '?'}</span>}
        </div>
        <div className="go-loser-name">{loser?.hero?.name}</div>
        {phase === 'explode' && fragments.map((f, i) => (
          <div
            key={i}
            className="go-fragment"
            style={{
              '--tx': `${f.tx}px`,
              '--ty': `${f.ty}px`,
              '--fsize': `${f.size}px`,
              animationDelay: `${f.delay}s`,
            }}
          >{f.emoji}</div>
        ))}
      </div>

      {/* Winner reveal */}
      <div className={`gameover-winner-reveal ${phase !== 'explode' ? 'go-rising' : ''}`}>
        {phase !== 'explode' && confetti.map((c, i) => (
          <div
            key={i}
            className="go-confetti"
            style={{ left: c.left, animationDelay: c.delay, animationDuration: c.dur }}
          >{c.emoji}</div>
        ))}

        <div className="go-trophy">🏆</div>
        <div className="go-winner-avatar">
          {winnerAvatar
            ? <img src={winnerAvatar} alt={winner.hero.name} />
            : <span>{winner?.hero?.initials || '?'}</span>}
        </div>
        <h2 className="go-winner-name">{winner?.hero?.name}</h2>
        <p className="go-winner-title">{winner?.hero?.title}</p>
        <p className="go-winner-company">@ {winner?.hero?.company}</p>
        {forfeit && <p className="go-forfeit-note">Victory by forfeit</p>}

        {phase === 'done' && (
          <button className="ready-btn go-play-again" onClick={onRestart}>
            ↩ Back to Menu
          </button>
        )}
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

// ─── Board Ambience Overlay ───────────────────────────────────────────────────
const EMBERS = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: `${5 + (i * 37 + 13) % 90}%`,
  w: `${2 + (i * 7) % 4}px`,
  dur: `${5 + (i * 1.3) % 5}s`,
  delay: `${(i * 0.7) % 6}s`,
  drift: `${-30 + (i * 17) % 60}px`,
}));
const SCANS = Array.from({ length: 4 }, (_, i) => ({
  id: i,
  y: `${10 + i * 22}%`,
  dur: `${10 + i * 3}s`,
  delay: `${i * 2.5}s`,
}));
const RUNE_CHARS = ['ᚠ','ᚢ','ᚦ','ᚨ','ᚱ','ᚲ','ᚷ','ᚹ','ᚺ','ᚾ','ᛁ','ᛃ','ᛇ','ᛈ','ᛊ','ᛏ','ᛒ','ᛖ','ᛗ','ᛚ'];
const RUNES = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  char: RUNE_CHARS[i % RUNE_CHARS.length],
  x: `${3 + (i * 41 + 7) % 94}%`,
  y: `${5 + (i * 29 + 11) % 88}%`,
  fs: `${0.7 + (i * 0.15) % 1.1}rem`,
  dur: `${4 + (i * 0.9) % 5}s`,
  delay: `${(i * 0.6) % 5}s`,
}));


function BoardAmbience() {
  const { theme } = useTheme();
  if (theme === 'arena') return (
    <div className="board-ambience">
      {EMBERS.map(e => (
        <div key={e.id} className="ambience-ember" style={{
          '--x': e.x, '--w': e.w, '--dur': e.dur, '--delay': e.delay, '--drift': e.drift,
        }} />
      ))}
    </div>
  );
  if (theme === 'mono') return (
    <div className="board-ambience">
      {SCANS.map(s => (
        <div key={s.id} className="ambience-scan" style={{
          '--y': s.y, '--dur': s.dur, '--delay': s.delay,
        }} />
      ))}
    </div>
  );
  if (theme === 'rune') return (
    <div className="board-ambience">
      {RUNES.map(r => (
        <div key={r.id} className="ambience-rune" style={{
          '--x': r.x, '--y': r.y, '--fs': r.fs, '--dur': r.dur, '--delay': r.delay,
        }}>{r.char}</div>
      ))}
    </div>
  );
  return null;
}

// ─── Main GameBoard ───────────────────────────────────────────────────────────
export default function GameBoard() {
  const location = useLocation();
  const navigate = useNavigate();

  const { profile1, profile2, deck1, deck2, online, roomCode, initialState } = location.state || {};
  const isOnline = !!online;
  const { emit, on } = useSocket();

  const [state, setState] = useState(() => {
    if (isOnline && initialState) return initialState;
    return beginNewTurn(buildInitialState(deck1, deck2, profile1, profile2));
  });

  // In online mode, myIndex is fixed; in hotseat, it follows currentPlayer
  const myIndex = isOnline ? (state.myIndex ?? 0) : state.currentPlayer;

  // Listen for state updates from server
  useEffect(() => {
    if (!isOnline) return;
    const unsub1 = on('state-update', (newState) => setState(newState));
    const unsub2 = on('opponent-disconnected', () => {
      // State will already be gameover from server
    });
    return () => { unsub1(); unsub2(); };
  }, [isOnline, on]);

  // Helper to send actions to server
  function emitAction(action, payload = {}) {
    emit('game-action', { code: roomCode, action, payload });
  }

  const [anims, setAnims]             = useState([]);
  const [deathGhosts, setDeathGhosts] = useState([]);
  const [shakingIds, setShakingIds]   = useState(new Set());
  const [hitIds, setHitIds]           = useState(new Set());
  const [flashHeroes, setFlashHeroes] = useState(new Set());
  const [screenFlash, setScreenFlash] = useState(false);
  const [newlyPlayed, setNewlyPlayed] = useState(new Set());
  const [inspectedCard, setInspectedCard] = useState(null);
  const [cantAffordId, setCantAffordId] = useState(null);
  const [forfeitConfirm, setForfeitConfirm] = useState(false);
  const [wasForfeit, setWasForfeit] = useState(false);
  const [opponentOnFire, setOpponentOnFire] = useState(false);
  const [buffedIds, setBuffedIds] = useState(new Set());
  const [drawAnims, setDrawAnims] = useState([]); // [{id, delay}]
  const [scale, setScale] = useState(() => {
    const saved = localStorage.getItem('ca-scale');
    if (saved) { document.documentElement.dataset.scale = saved; return saved; }
    const h = window.screen.height;
    const auto = h <= 1120 ? 'sm' : h <= 1300 ? 'md' : 'lg';
    document.documentElement.dataset.scale = auto;
    return auto;
  });

  function toggleScale() {
    const cycle = { sm: 'md', md: 'lg', lg: 'sm' };
    const next = cycle[scale] ?? 'md';
    document.documentElement.dataset.scale = next;
    localStorage.setItem('ca-scale', next);
    setScale(next);
  }

  function queueAnim(animObj, delay = 0, duration = 700) {
    const id = makeId();
    setTimeout(() => {
      setAnims(prev => [...prev, { ...animObj, id }]);
      setTimeout(() => setAnims(prev => prev.filter(a => a.id !== id)), duration);
    }, delay);
  }

  function shakeMinionId(minionId, isHit) {
    const setter = isHit ? setHitIds : setShakingIds;
    setter(prev => { const n = new Set(prev); n.add(minionId); return n; });
    setTimeout(() => setter(prev => { const n = new Set(prev); n.delete(minionId); return n; }), 420);
  }

  function flashHeroFn(playerIdx) {
    setFlashHeroes(prev => { const n = new Set(prev); n.add(playerIdx); return n; });
    setTimeout(() => setFlashHeroes(prev => { const n = new Set(prev); n.delete(playerIdx); return n; }), 450);
  }

  function triggerFireAura() {
    setOpponentOnFire(true);
    setTimeout(() => setOpponentOnFire(false), 1500);
    const areaEl = document.querySelector('.opponent-area');
    if (areaEl) {
      const rect = areaEl.getBoundingClientRect();
      for (let i = 0; i < 8; i++) {
        const x = rect.left + (0.1 + Math.random() * 0.8) * rect.width;
        const y = rect.top  + (0.1 + Math.random() * 0.8) * rect.height;
        queueAnim({ kind: 'impact', attackType: 'fire', x, y }, 350 + i * 100, 500);
      }
    }
  }

  function flashBuffedMinions(prevState, nextState, playerIdx) {
    const prevBoard = prevState.players[playerIdx].board;
    const nextBoard = nextState.players[playerIdx].board;
    const ids = [];
    nextBoard.forEach((m, i) => {
      const prev = prevBoard[i];
      if (prev && (m.attack > prev.attack || m.health > prev.health || m.maxHealth > prev.maxHealth)) {
        ids.push(m.id);
      }
    });
    if (ids.length === 0) return;
    setBuffedIds(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
    setTimeout(() => setBuffedIds(prev => {
      const n = new Set(prev);
      ids.forEach(id => n.delete(id));
      return n;
    }), 800);
  }

  function triggerDrawAnimation(count) {
    // Spawn `count` card-back tokens flying from deck to hand
    const deckEl = document.querySelector('[data-deck="player"]');
    const handEl = document.querySelector('.player-hand');
    if (!deckEl || !handEl) return;
    const deckRect  = deckEl.getBoundingClientRect();
    const handRect  = handEl.getBoundingClientRect();
    const startX = deckRect.left + deckRect.width / 2;
    const startY = deckRect.top  + deckRect.height / 2;
    const endX   = handRect.left + handRect.width  / 2;
    const endY   = handRect.top  + handRect.height / 2;
    for (let i = 0; i < count; i++) {
      const id = makeId();
      const delay = i * 180;
      setTimeout(() => {
        setDrawAnims(prev => [...prev, { id, startX, startY, endX, endY }]);
        setTimeout(() => setDrawAnims(prev => prev.filter(a => a.id !== id)), 700);
      }, delay);
    }
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

  // "me" is always the local player's side (bottom); "them" is always opponent (top)
  const me = myIndex;
  const them = 1 - me;
  // cur/opp for game logic — who is currently taking a turn
  const cur = state.currentPlayer;
  const opp = 1 - cur;
  // For rendering, the bottom of the board is always "me"
  const curPlayer = state.players[me];
  const oppPlayer = state.players[them];
  const isMyTurn = cur === me;
  const validTargets = getValidTargets(state);
  const spellTargets = getSpellTargets(state);

  const handlePlayCard = useCallback((cardIdx) => {
    if (isOnline && !isMyTurn) return;
    const card = state.players[me].hand[cardIdx];
    if (!card) return;
    if (state.players[me].mana.current < card.cost) {
      setCantAffordId(card.id);
      setTimeout(() => setCantAffordId(null), 600);
      return;
    }
    if (isOnline) {
      emitAction('play-card', { cardIndex: cardIdx });
      return;
    }
    const { state: ns } = playCard(state, cardIdx);
    if (card.type === 'MINION') {
      const newMinion = ns.players[cur].board[ns.players[cur].board.length - 1];
      if (newMinion) {
        setNewlyPlayed(prev => { const n = new Set(prev); n.add(newMinion.id); return n; });
        setTimeout(() => setNewlyPlayed(prev => { const n = new Set(prev); n.delete(newMinion.id); return n; }), 500);
        setTimeout(() => {
          const el = document.querySelector(`[data-minion-id="${newMinion.id}"]`);
          const pos = getCenter(el);
          if (pos) queueAnim({ kind: 'summon', attackType: getAttackType(card), x: pos.x, y: pos.y }, 0, 600);
        }, 50);
      }
      flashBuffedMinions(state, ns, cur);
      const abs = card.abilities || [];
      const drawCount = abs.includes('battlecry_draw_2') ? 2 : abs.includes('battlecry_draw_1') ? 1 : 0;
      if (drawCount > 0) setTimeout(() => triggerDrawAnimation(drawCount), 200);
    }
    if (card.type === 'SPELL') {
      const abs = card.abilities || [];
      const isHeroDmg = abs.includes('spell_damage_hero_5') || abs.includes('spell_damage_hero');
      if (isHeroDmg) {
        const dmg = abs.includes('spell_damage_hero_5') ? 5 : 3;
        const casterEl = document.querySelector(`[data-hero-idx="${me}"]`);
        const targetEl = document.querySelector(`[data-hero-idx="${them}"]`);
        const casterPos = getCenter(casterEl);
        const targetPos = getCenter(targetEl);
        if (casterPos && targetPos) {
          queueAnim({ kind: 'projectile', attackType: 'fire', startX: casterPos.x, startY: casterPos.y, endX: targetPos.x, endY: targetPos.y }, 0, 400);
          queueAnim({ kind: 'impact', attackType: 'fire', x: targetPos.x, y: targetPos.y }, 310, 700);
          queueAnim({ kind: 'damage-num', x: targetPos.x, y: targetPos.y - 20, amount: dmg }, 330, 900);
        }
        triggerFireAura();
      }
    }
    setState(ns);
  }, [state, me, them, cur, isOnline, isMyTurn]);

  const handleSelectMinion = useCallback((playerIdx, boardIdx) => {
    if (isOnline && !isMyTurn) return;

    if (state.pendingBattlecryTarget) {
      if (playerIdx !== them) return;
      if (isOnline) { emitAction('resolve-battlecry', { targetIdx: boardIdx }); return; }
      setState(resolveBattlecryTarget(state, boardIdx));
      return;
    }
    if (state.pendingSpell) {
      const isFriendly = playerIdx === me;
      const abs = state.pendingSpell.card.abilities || [];
      const isBuff = abs.some(a => a.startsWith('spell_buff_target'));
      const isDmg  = abs.some(a => ['spell_damage_3', 'spell_damage_2'].includes(a));
      const isFreeze = abs.includes('spell_freeze');
      const targetEl = document.querySelector(`[data-minion-id="${state.players[playerIdx].board[boardIdx]?.id}"]`);
      const targetPos = getCenter(targetEl);

      if (isBuff && isFriendly) {
        if (!isOnline && targetPos) queueAnim({ kind: 'impact', attackType: 'magic', x: targetPos.x, y: targetPos.y }, 0, 600);
        if (isOnline) { emitAction('resolve-spell', { targetType: 'friendly_minion', targetIdx: boardIdx }); return; }
        setState(resolveSpellTarget(state, 'friendly_minion', boardIdx));
      } else if ((isDmg || isFreeze) && !isFriendly) {
        if (isOnline) { emitAction('resolve-spell', { targetType: 'enemy_minion', targetIdx: boardIdx }); return; }
        const ns = resolveSpellTarget(state, 'enemy_minion', boardIdx);
        const casterEl = document.querySelector(`[data-hero-idx="${me}"]`);
        const casterPos = getCenter(casterEl);
        if (casterPos && targetPos) {
          queueAnim({ kind: 'projectile', attackType: 'magic', startX: casterPos.x, startY: casterPos.y, endX: targetPos.x, endY: targetPos.y }, 0, 400);
          const dmg = abs.includes('spell_damage_3') ? 3 : 2;
          queueAnim({ kind: 'impact', attackType: 'magic', x: targetPos.x, y: targetPos.y }, 310, 600);
          queueAnim({ kind: 'damage-num', x: targetPos.x, y: targetPos.y - 20, amount: dmg }, 330, 900);
          const target = state.players[them].board[boardIdx];
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

    if (playerIdx === me) {
      if (isOnline) { emitAction('select-minion', { boardIdx }); return; }
      setState(selectMinion(state, playerIdx, boardIdx));
      return;
    }

    if (!state.selectedMinion) return;
    const attacker = state.players[me].board[state.selectedMinion.boardIdx];
    const defender = state.players[them].board[boardIdx];
    if (!attacker || !defender) return;

    if (isOnline) { emitAction('attack', { targetType: 'enemy_minion', targetIdx: boardIdx }); return; }
    const atkPos = getCenter(document.querySelector(`[data-minion-id="${attacker.id}"]`));
    const defPos = getCenter(document.querySelector(`[data-minion-id="${defender.id}"]`));
    const ns = attackTarget(state, 'enemy_minion', boardIdx);
    triggerAttack(state, ns, atkPos, defPos, getAttackType(attacker), attacker.attack, false, them);
    const drawnCards = ns.players[cur].hand.length - state.players[cur].hand.length;
    if (drawnCards > 0) setTimeout(() => triggerDrawAnimation(drawnCards), 400);
    setState(ns);
  }, [state, me, them, cur, isOnline, isMyTurn]);

  const handleHeroClick = useCallback((playerIdx) => {
    if (isOnline && !isMyTurn) return;
    if (state.pendingSpell || playerIdx !== them || !state.selectedMinion) return;
    if (!validTargets.hero) return;
    const attacker = state.players[me].board[state.selectedMinion.boardIdx];
    if (!attacker) return;
    if (isOnline) { emitAction('attack', { targetType: 'enemy_hero', targetIdx: null }); return; }
    const atkPos  = getCenter(document.querySelector(`[data-minion-id="${attacker.id}"]`));
    const heroPos = getCenter(document.querySelector(`[data-hero-idx="${them}"]`));
    const ns = attackTarget(state, 'enemy_hero', null);
    triggerAttack(state, ns, atkPos, heroPos, getAttackType(attacker), attacker.attack, true, them);
    setState(ns);
  }, [state, me, them, isOnline, isMyTurn]);

  const handleEndTurn = useCallback(() => {
    if (isOnline && !isMyTurn) return;
    if (state.pendingSpell) return;
    if (isOnline) { emitAction('end-turn'); return; }
    setState(endTurn(state));
  }, [state, isOnline, isMyTurn]);
  const handleReady       = useCallback(() => setState(beginNewTurn(state)), [state]);
  const handleCancelSpell = useCallback(() => {
    if (isOnline) { emitAction('cancel-spell'); return; }
    setState(s => ({ ...s, pendingSpell: null }));
  }, [isOnline]);

  const stateRef = useRef(state);
  const isOnlineRef = useRef(isOnline);
  useEffect(() => { stateRef.current = state; isOnlineRef.current = isOnline; });
  useEffect(() => {
    function onKeyDown(e) {
      if (e.code !== 'Space' || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      const s = stateRef.current;
      if (isOnlineRef.current) return; // no keyboard shortcuts in online mode
      if (s.phase === 'play' && !s.pendingSpell) setState(endTurn(s));
      else if (s.phase === 'transition') setState(beginNewTurn(s));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (state.phase === 'gameover')   return <GameOverScreen winner={state.players[state.winner]} loser={state.players[1 - state.winner]} forfeit={wasForfeit} onRestart={() => navigate('/')} />;
  if (!isOnline && state.phase === 'transition') return <TransitionScreen nextPlayerName={state.players[state.currentPlayer].hero.name} onReady={handleReady} />;

  return (
    <div className="game-board">
      <div className="board-side board-side--left">
        <div className="player-name-label player-name-label--opponent">{oppPlayer.hero.name}</div>
        <div className="sidebar-turn">
          <span className="sidebar-turn-label">TURN {state.turn}</span>
        </div>
        <div className="player-name-label player-name-label--player">{curPlayer.hero.name}</div>
      </div>
      {/* Forfeit button — top right */}
      <div className="forfeit-zone">
        {forfeitConfirm ? (
          <div className="forfeit-confirm">
            <span>Forfeit?</span>
            <button className="forfeit-yes" onClick={() => {
              setWasForfeit(true);
              if (isOnline) { emitAction('forfeit'); } else { setState(forfeitGame(state)); }
            }}>Yes</button>
            <button className="forfeit-no" onClick={() => setForfeitConfirm(false)}>No</button>
          </div>
        ) : (
          <button className="forfeit-btn" onClick={() => setForfeitConfirm(true)}>🏳 Forfeit</button>
        )}
      </div>

      <div className="opponent-hand-top">
        <div className="hand-zone opponent-hand">
          {oppPlayer.hand.map((_, i) => <HandCard key={i} card={null} isOpponent />)}
        </div>
      </div>

      <div className={`player-area opponent-area${opponentOnFire ? ' opponent-fire-aura' : ''}`}>
        <BgParticles />
        <div className="hero-zone">
          <div className="hero-side-info hero-side-info--left">
            <ManaBar mana={oppPlayer.mana} />
          </div>
          <div className="hero-zone-spacer" />
          <div className="hero-side-info hero-side-info--right">
            <DeckCounter count={oppPlayer.deck.length} isPlayer={false} />
          </div>
        </div>
      </div>

      <div className="board-area">
        {/* Opponent hero — sits in a wood circle at the top edge of the board */}
        <div className="board-hero-cup board-hero-cup--top">
          <Hero hero={oppPlayer.hero} playerIdx={them} isOpponent isValidTarget={validTargets.hero}
            isTauntBlocked={!!state.selectedMinion && !validTargets.hero}
            onClick={() => handleHeroClick(them)} isCurrentPlayer={false} isFlashing={flashHeroes.has(them)} />
        </div>

        <div className="minion-row opponent-row">
          {oppPlayer.board.map((minion, i) => (
            <BoardMinionCard key={minion.id} minion={minion} playerIdx={them} boardIdx={i} isSelected={false} isOpponent={true}
              isValidTarget={(!!state.selectedMinion && validTargets.minions.includes(i)) || (!!state.pendingSpell && spellTargets.enemyMinions.includes(i)) || (!!state.pendingBattlecryTarget && state.pendingBattlecryTarget.type === 'silence')}
              canAttack={false} onClick={handleSelectMinion} onInspect={setInspectedCard}
              isLunging={shakingIds.has(minion.id)} isTakingHit={hitIds.has(minion.id)} isNewlyPlayed={newlyPlayed.has(minion.id)} />
          ))}
          {oppPlayer.board.length === 0 && <div className="empty-board-hint opp-hint">Opponent's side</div>}
        </div>

        <div className="board-divider">
          <div className="rope">
            <span className="rope-icon">⚔</span>
          </div>
        </div>

        <div className="minion-row player-row">
          {curPlayer.board.map((minion, i) => (
            <BoardMinionCard key={minion.id} minion={minion} playerIdx={me} boardIdx={i}
              isSelected={state.selectedMinion?.boardIdx === i && state.selectedMinion?.playerIdx === me}
              isValidTarget={!!state.pendingSpell && spellTargets.friendlyMinions.includes(i)}
              canAttack={minion.canAttack && isMyTurn} onClick={handleSelectMinion} onInspect={setInspectedCard}
              isLunging={shakingIds.has(minion.id)} isTakingHit={hitIds.has(minion.id)} isNewlyPlayed={newlyPlayed.has(minion.id)} isBuffed={buffedIds.has(minion.id)} />
          ))}
          {curPlayer.board.length === 0 && <div className="empty-board-hint">Play minions here</div>}
        </div>

        {/* Player hero — sits in a wood circle at the bottom edge of the board */}
        <div className="board-hero-cup board-hero-cup--bottom">
          <Hero hero={curPlayer.hero} playerIdx={me} isOpponent={false} isValidTarget={false}
            onClick={() => handleHeroClick(me)} isCurrentPlayer={isMyTurn} isFlashing={flashHeroes.has(me)} />
        </div>
      </div>

      <div className="player-area current-area">
        <BgParticles />
        <div className="hero-zone">
          <div className="hero-side-info hero-side-info--left">
            <ManaBar mana={curPlayer.mana} />
          </div>
          <div className="hero-zone-spacer" />
          <div className="hero-side-info hero-side-info--right">
            <DeckCounter count={curPlayer.deck.length} isPlayer={true} />
          </div>
        </div>
        <div className="hand-zone player-hand">
          {curPlayer.hand.map((card, i) => (
            <HandCard key={card.id} card={card}
              canPlay={isMyTurn && curPlayer.mana.current >= card.cost && (card.type === 'SPELL' || curPlayer.board.length < 7)}
              cantAfford={cantAffordId === card.id}
              onClick={() => handlePlayCard(i)} isOpponent={false} onInspect={setInspectedCard} />
          ))}
        </div>
      </div>

      <div className="end-turn-zone">
        <button className={`end-turn-btn ${(state.pendingSpell || state.pendingBattlecryTarget || (isOnline && !isMyTurn)) ? 'disabled' : ''}`}
          onClick={(state.pendingSpell || state.pendingBattlecryTarget || (isOnline && !isMyTurn)) ? undefined : handleEndTurn}>
          {(state.pendingSpell || state.pendingBattlecryTarget) ? 'Choose Target' : (isOnline && !isMyTurn) ? 'OPPONENT\'S TURN' : 'END TURN'}
        </button>
        {state.pendingSpell && <button className="cancel-btn" onClick={handleCancelSpell}>Cancel</button>}
        {state.pendingBattlecryTarget && <button className="cancel-btn" onClick={() => {
          if (isOnline) { emitAction('skip-battlecry'); } else { setState(s => ({ ...s, pendingBattlecryTarget: null })); }
        }}>Skip</button>}
        <button className="scale-toggle-btn" onClick={toggleScale} title="Cycle display scale">
          {scale === 'sm' ? '🔍 1080p' : scale === 'md' ? '🔎 1200p' : '🔭 1440p'}
        </button>
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

      {/* Draw card animations — card backs flying from deck to hand */}
      {drawAnims.map(a => (
        <div key={a.id} className="draw-card-anim" style={{
          '--start-x': `${a.startX}px`,
          '--start-y': `${a.startY}px`,
          '--end-x':   `${a.endX}px`,
          '--end-y':   `${a.endY}px`,
          left: a.startX,
          top:  a.startY,
        }} />
      ))}
    </div>
  );
}
