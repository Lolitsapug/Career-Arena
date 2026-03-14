import { useState, useCallback } from 'react';
import {
  endTurn, beginNewTurn, playCard, selectMinion,
  attackTarget, getValidTargets, resolveSpellTarget, getSpellTargets,
} from './gameEngine.js';

// ─── Small sub-components ────────────────────────────────────────────────────

function ManaBar({ mana }) {
  const crystals = Array.from({ length: 10 }, (_, i) => i < mana.current);
  return (
    <div className="mana-bar">
      {crystals.map((full, i) => (
        <div key={i} className={`mana-crystal ${full ? 'full' : 'empty'}`} />
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

function Hero({ hero, isOpponent, isValidTarget, onClick, isCurrentPlayer }) {
  return (
    <div
      className={`hero-portrait ${isOpponent ? 'hero-opponent' : 'hero-player'} ${isValidTarget ? 'valid-target' : ''} ${isCurrentPlayer && !isOpponent ? 'active-hero' : ''}`}
      onClick={onClick}
      title={`${hero.name} — ${hero.title} @ ${hero.company}`}
    >
      <div className="hero-avatar">{hero.initials}</div>
      <div className="hero-health">
        <span className="health-icon">❤</span>
        {hero.armor > 0 && <span className="hero-armor">🛡{hero.armor}</span>}
        <span>{hero.health}</span>
      </div>
      <div className="hero-name-tag">{hero.name.split(' ')[0]}</div>
    </div>
  );
}

function HandCard({ card, canPlay, isSelected, onClick, isOpponent }) {
  if (isOpponent) {
    return <div className="hand-card hand-card--back" />;
  }
  return (
    <div
      className={`hand-card ${canPlay ? 'can-play' : ''} ${isSelected ? 'selected' : ''} ${card.type === 'SPELL' ? 'spell-card' : ''}`}
      onClick={onClick}
    >
      <div className="card-cost">{card.cost}</div>
      <div className="card-art">{card.type === 'SPELL' ? '✨' : getArt(card)}</div>
      <div className="card-name">{card.name}</div>
      {card.type === 'MINION' && (
        <div className="card-stats">
          <span className="card-attack">⚔{card.attack}</span>
          <span className="card-health">❤{card.health}</span>
        </div>
      )}
      {card.description && <div className="card-desc">{card.description}</div>}
      {card.abilities?.includes('taunt') && <div className="ability-badge taunt-badge">TAUNT</div>}
      {card.abilities?.includes('divine_shield') && <div className="ability-badge divine-badge">DIVINE</div>}
      {card.abilities?.includes('charge') && <div className="ability-badge charge-badge">CHARGE</div>}
    </div>
  );
}

function BoardMinionCard({ minion, isSelected, isValidTarget, canAttack, onClick }) {
  const exhausted = !canAttack;
  return (
    <div
      className={`board-minion
        ${isSelected ? 'selected-attacker' : ''}
        ${isValidTarget ? 'valid-target' : ''}
        ${canAttack ? 'can-attack' : 'exhausted'}
        ${minion.abilities?.includes('taunt') ? 'has-taunt' : ''}
        ${minion.hasDivineShield ? 'has-divine' : ''}
      `}
      onClick={onClick}
      title={minion.description || minion.name}
    >
      {minion.hasDivineShield && <div className="divine-aura" />}
      <div className="minion-art">{getArt(minion)}</div>
      <div className="minion-name">{minion.name}</div>
      <div className="minion-stats">
        <span className="stat-attack">⚔{minion.attack}</span>
        <span className={`stat-health ${minion.damaged ? 'damaged' : ''}`}>❤{minion.health}</span>
      </div>
      {minion.abilities?.includes('taunt') && <div className="taunt-ring" />}
      {exhausted && <div className="exhausted-overlay" />}
    </div>
  );
}

// Map card names/abilities to emoji art
function getArt(card) {
  const n = (card.name || '').toLowerCase();
  const arts = {
    'ninja': '🥷', 'wizard': '🧙', 'architect': '🏗️', 'engineer': '⚙️',
    'ceo': '👔', 'cto': '💻', 'founder': '🚀', 'data': '📊',
    'cloud': '☁️', 'security': '🔐', 'developer': '💾', 'manager': '📋',
    'marketing': '📢', 'sales': '💰', 'design': '🎨', 'intern': '🎓',
    'hacker': '💻', 'network': '🧠', 'product': '📦', 'analyst': '📈',
    'sprint': '🏃', 'coffee': '☕', 'pivot': '🔄', 'event': '🤝',
    'boost': '⬆️', 'collaboration': '🤜', 'lab': '🔬', 'email': '📧',
    'review': '⭐', 'session': '🤔', 'meeting': '📅', 'slack': '💬',
    'programming': '👥', 'burnout': '💥', 'stock': '📈', 'layoff': '🪓',
    'debt': '💸', 'googler': '🔍', 'meta': '🌐', 'apple': '🍎',
    'aws': '☁️', 'netflix': '🎬', 'open': '🤖', 'anthropic': '🧬',
    'staff': '🌟', 'principal': '🎯', 'lead': '🏆',
  };
  for (const [kw, emoji] of Object.entries(arts)) {
    if (n.includes(kw)) return emoji;
  }
  if (card.type === 'SPELL') return '✨';
  return '🃏';
}

// ─── Transition Screen ────────────────────────────────────────────────────────
function TransitionScreen({ nextPlayerName, onReady }) {
  return (
    <div className="transition-screen">
      <div className="transition-card">
        <div className="transition-icon">🔄</div>
        <h2>Turn Over!</h2>
        <p>Pass the device to</p>
        <div className="transition-player-name">{nextPlayerName}</div>
        <button className="ready-btn" onClick={onReady}>
          I'm Ready — Begin Turn
        </button>
      </div>
    </div>
  );
}

// ─── Game Over Screen ─────────────────────────────────────────────────────────
function GameOverScreen({ winner, onRestart }) {
  return (
    <div className="transition-screen">
      <div className="transition-card gameover-card">
        <div className="transition-icon">🏆</div>
        <h2>{winner.hero.name} Wins!</h2>
        <p className="gameover-title">{winner.hero.title}</p>
        <p className="gameover-company">@ {winner.hero.company}</p>
        <button className="ready-btn" onClick={onRestart}>
          Play Again
        </button>
      </div>
    </div>
  );
}

// ─── Main GameBoard ───────────────────────────────────────────────────────────
export default function GameBoard({ initialState, onRestart }) {
  const [state, setState] = useState(() => beginNewTurn(initialState));

  const cur = state.currentPlayer;
  const opp = 1 - cur;
  const curPlayer = state.players[cur];
  const oppPlayer = state.players[opp];

  const validTargets = getValidTargets(state);
  const spellTargets = getSpellTargets(state);

  // ─ Handlers ──────────────────────────────────────────────────────────────

  const handlePlayCard = useCallback((cardIdx) => {
    const card = state.players[cur].hand[cardIdx];
    if (!card) return;
    const { state: ns, needsTarget } = playCard(state, cardIdx);
    setState(ns);
  }, [state, cur]);

  const handleSelectMinion = useCallback((playerIdx, boardIdx) => {
    // If a spell is pending, clicking a minion resolves the spell
    if (state.pendingSpell) {
      const isFriendly = playerIdx === cur;
      const spellAbs = state.pendingSpell.card.abilities || [];
      const isBuff = spellAbs.some(a => a.startsWith('spell_buff_target'));
      const isDmg = spellAbs.some(a => ['spell_damage_3', 'spell_damage_2'].includes(a));
      if (isBuff && isFriendly) {
        setState(resolveSpellTarget(state, 'friendly_minion', boardIdx));
      } else if (isDmg && !isFriendly) {
        setState(resolveSpellTarget(state, 'enemy_minion', boardIdx));
      }
      return;
    }

    if (playerIdx === cur) {
      // Select as attacker
      setState(selectMinion(state, playerIdx, boardIdx));
    } else {
      // Attack enemy minion
      if (state.selectedMinion) {
        setState(attackTarget(state, 'enemy_minion', boardIdx));
      }
    }
  }, [state, cur]);

  const handleHeroClick = useCallback((playerIdx) => {
    if (state.pendingSpell) return; // spells don't target heroes in our impl
    if (playerIdx === opp && state.selectedMinion) {
      setState(attackTarget(state, 'enemy_hero', null));
    }
  }, [state, opp]);

  const handleEndTurn = useCallback(() => {
    setState(endTurn(state));
  }, [state]);

  const handleTransitionReady = useCallback(() => {
    setState(beginNewTurn(state));
  }, [state]);

  const handleCancelSpell = useCallback(() => {
    setState(s => ({ ...s, pendingSpell: null }));
  }, []);

  // ─ Render ─────────────────────────────────────────────────────────────────

  if (state.phase === 'gameover') {
    return <GameOverScreen winner={state.players[state.winner]} onRestart={onRestart} />;
  }

  if (state.phase === 'transition') {
    const nextName = state.players[state.currentPlayer].hero.name;
    return <TransitionScreen nextPlayerName={nextName} onReady={handleTransitionReady} />;
  }

  const curMana = curPlayer.mana;

  return (
    <div className="game-board">
      {/* ── Opponent area (top) ── */}
      <div className="player-area opponent-area">
        <div className="hero-zone">
          <Hero
            hero={oppPlayer.hero}
            isOpponent
            isValidTarget={validTargets.hero}
            onClick={() => handleHeroClick(opp)}
            isCurrentPlayer={false}
          />
          <DeckCounter count={oppPlayer.deck.length} />
          <div className="opp-mana-info">
            <div className="mana-crystal full" style={{ opacity: 0.5 }} />
            <span>{oppPlayer.mana.current}/{oppPlayer.mana.max}</span>
          </div>
        </div>
        <div className="hand-zone opponent-hand">
          {oppPlayer.hand.map((_, i) => (
            <HandCard key={i} card={null} isOpponent />
          ))}
        </div>
      </div>

      {/* ── Board ── */}
      <div className="board-area">
        {/* Opponent's minions */}
        <div className="minion-row opponent-row">
          {oppPlayer.board.map((minion, i) => (
            <BoardMinionCard
              key={minion.id}
              minion={minion}
              isSelected={false}
              isValidTarget={
                (!!state.selectedMinion && validTargets.minions.includes(i)) ||
                (!!state.pendingSpell && spellTargets.enemyMinions.includes(i))
              }
              canAttack={false}
              onClick={() => handleSelectMinion(opp, i)}
            />
          ))}
          {oppPlayer.board.length === 0 && (
            <div className="empty-board-hint opp-hint">Opponent's side</div>
          )}
        </div>

        <div className="board-divider">
          <div className="rope" />
        </div>

        {/* Current player's minions */}
        <div className="minion-row player-row">
          {curPlayer.board.map((minion, i) => (
            <BoardMinionCard
              key={minion.id}
              minion={minion}
              isSelected={state.selectedMinion?.boardIdx === i && state.selectedMinion?.playerIdx === cur}
              isValidTarget={!!state.pendingSpell && spellTargets.friendlyMinions.includes(i)}
              canAttack={minion.canAttack}
              onClick={() => handleSelectMinion(cur, i)}
            />
          ))}
          {curPlayer.board.length === 0 && (
            <div className="empty-board-hint">Play minions here</div>
          )}
        </div>
      </div>

      {/* ── Current player area (bottom) ── */}
      <div className="player-area current-area">
        <div className="hero-zone">
          <Hero
            hero={curPlayer.hero}
            isOpponent={false}
            isValidTarget={false}
            onClick={() => handleHeroClick(cur)}
            isCurrentPlayer
          />
          <DeckCounter count={curPlayer.deck.length} />
          <ManaBar mana={curMana} />
        </div>

        <div className="hand-zone player-hand">
          {curPlayer.hand.map((card, i) => (
            <HandCard
              key={card.id}
              card={card}
              canPlay={curMana.current >= card.cost && (card.type === 'SPELL' || curPlayer.board.length < 7)}
              isSelected={false}
              onClick={() => handlePlayCard(i)}
              isOpponent={false}
            />
          ))}
        </div>
      </div>

      {/* ── End Turn Button ── */}
      <div className="end-turn-zone">
        <button
          className={`end-turn-btn ${state.pendingSpell ? 'disabled' : ''}`}
          onClick={state.pendingSpell ? undefined : handleEndTurn}
        >
          {state.pendingSpell ? 'Choose Target' : 'END TURN'}
        </button>
        {state.pendingSpell && (
          <button className="cancel-btn" onClick={handleCancelSpell}>Cancel</button>
        )}
        <div className="turn-indicator">Turn {state.turn}</div>
        <div className="active-player-label">{curPlayer.hero.name}</div>
      </div>

      {/* ── Overlay hints ── */}
      {state.selectedMinion && (
        <div className="action-hint">Select an enemy target to attack</div>
      )}
      {state.pendingSpell && (
        <div className="action-hint spell-hint">
          🎯 Select a target for <strong>{state.pendingSpell.card.name}</strong>
        </div>
      )}

      {/* ── Log ── */}
      {state.log?.length > 0 && (
        <div className="game-log">{state.log[0]}</div>
      )}
    </div>
  );
}
