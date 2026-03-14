import { useState, useCallback, useRef } from 'react';
import {
  endTurn, beginNewTurn, playCard, selectMinion,
  attackTarget, getValidTargets, resolveSpellTarget, getSpellTargets,
} from './gameEngine.js';
import AnimLayer, { getAttackType } from './AnimLayer.jsx';

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

function Hero({ hero, playerIdx, isOpponent, isValidTarget, onClick, isCurrentPlayer, isFlashing }) {
  return (
    <div
      data-hero-idx={playerIdx}
      className={`hero-portrait ${isOpponent ? 'hero-opponent' : 'hero-player'} ${isValidTarget ? 'valid-target' : ''} ${isCurrentPlayer && !isOpponent ? 'active-hero' : ''} ${isFlashing ? 'hero-taking-damage' : ''}`}
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

function HandCard({ card, canPlay, onClick, isOpponent }) {
  if (isOpponent) return <div className="hand-card hand-card--back" />;
  return (
    <div
      className={`hand-card ${canPlay ? 'can-play' : ''} ${card.type === 'SPELL' ? 'spell-card' : ''}`}
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

function BoardMinionCard({ minion, isSelected, isValidTarget, canAttack, onClick, isLunging, isTakingHit, isNewlyPlayed }) {
  return (
    <div
      data-minion-id={minion.id}
      className={`board-minion
        ${isSelected       ? 'selected-attacker' : ''}
        ${isValidTarget    ? 'valid-target'       : ''}
        ${canAttack        ? 'can-attack'         : 'exhausted'}
        ${minion.abilities?.includes('taunt') ? 'has-taunt' : ''}
        ${minion.hasDivineShield ? 'has-divine' : ''}
        ${isLunging        ? 'lunging'            : ''}
        ${isTakingHit      ? 'taking-hit'         : ''}
        ${isNewlyPlayed    ? 'just-summoned'      : ''}
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
      {!canAttack && <div className="exhausted-overlay" />}
    </div>
  );
}

// ─── Transition / GameOver screens ───────────────────────────────────────────
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
export default function GameBoard({ initialState, onRestart }) {
  const [state, setState]           = useState(() => beginNewTurn(initialState));

  // ── Animation state ───────────────────────────────────────────────────────
  const [anims, setAnims]           = useState([]);
  const [deathGhosts, setDeathGhosts] = useState([]);
  const [shakingIds, setShakingIds]  = useState(new Set()); // attacker lunge
  const [hitIds, setHitIds]          = useState(new Set()); // defender shake
  const [flashHeroes, setFlashHeroes] = useState(new Set()); // hero damage flash
  const [screenFlash, setScreenFlash] = useState(false);
  const [newlyPlayed, setNewlyPlayed] = useState(new Set()); // summon glow

  // ── Helpers ───────────────────────────────────────────────────────────────
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

  function flashHero(playerIdx) {
    setFlashHeroes(prev => new Set([...prev, playerIdx]));
    setTimeout(() => setFlashHeroes(prev => { const n = new Set(prev); n.delete(playerIdx); return n; }), 450);
  }

  /**
   * Fires all attack animations BEFORE setState so we can read DOM positions.
   * @param {object} curState   – state BEFORE the update
   * @param {object} nextState  – state AFTER the update (for detecting deaths)
   * @param {{x,y}} startPos    – attacker screen center
   * @param {{x,y}} endPos      – target screen center
   * @param {string} atkType    – sword / magic / electric / fire / punch
   * @param {number} damage     – damage amount
   * @param {boolean} isHero    – did we hit a hero?
   * @param {number} oppIdx     – opponent player index
   */
  function triggerAttack(curState, nextState, startPos, endPos, atkType, damage, isHero, oppIdx) {
    if (!startPos || !endPos) return;

    // 1. Attacker lunge
    const atkBI = curState.selectedMinion?.boardIdx;
    const atkMinion = curState.players[curState.currentPlayer].board[atkBI];
    if (atkMinion) shakeMinionId(atkMinion.id, false);

    // 2. Projectile
    queueAnim({ kind: 'projectile', attackType: atkType, startX: startPos.x, startY: startPos.y, endX: endPos.x, endY: endPos.y }, 0, 400);

    // 3. Impact + damage number (arrives ~320ms)
    queueAnim({ kind: 'impact',      attackType: atkType, x: endPos.x, y: endPos.y }, 310, 600);
    queueAnim({ kind: 'damage-num',  x: endPos.x, y: endPos.y - 20, amount: damage }, 330, 1000);

    // 4. Defender shake
    if (!isHero) {
      const defMinion = curState.players[oppIdx].board.find(m => {
        const el = document.querySelector(`[data-minion-id="${m.id}"]`);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        return Math.abs(cx - endPos.x) < 50 && Math.abs(cy - endPos.y) < 50;
      });
      if (defMinion) setTimeout(() => shakeMinionId(defMinion.id, true), 310);
    } else {
      // Hero flash + heart crack
      setTimeout(() => {
        flashHero(oppIdx);
        queueAnim({ kind: 'heart-crack', x: endPos.x, y: endPos.y }, 0, 900);
        setScreenFlash(true);
        setTimeout(() => setScreenFlash(false), 500);
      }, 310);
    }

    // 5. Divine shield break detection
    const pi = curState.currentPlayer;
    for (let p = 0; p < 2; p++) {
      const prevBoard = curState.players[p].board;
      const newBoard  = nextState.players[p].board;
      for (const pm of prevBoard) {
        const nm = newBoard.find(m => m.id === pm.id);
        if (nm && pm.hasDivineShield && !nm.hasDivineShield) {
          const el = document.querySelector(`[data-minion-id="${pm.id}"]`);
          const pos = getCenter(el);
          if (pos) setTimeout(() => queueAnim({ kind: 'divine-burst', x: pos.x, y: pos.y }, 0, 600), 310);
        }
      }
    }

    // 6. Death explosions — capture positions NOW (before re-render removes elements)
    const deadGhosts = [];
    for (let p = 0; p < 2; p++) {
      const prevBoard = curState.players[p].board;
      const newBoard  = nextState.players[p].board;
      for (const pm of prevBoard) {
        if (!newBoard.find(m => m.id === pm.id)) {
          const el = document.querySelector(`[data-minion-id="${pm.id}"]`);
          const pos = getCenter(el);
          if (pos) {
            deadGhosts.push({ id: `ghost_${pm.id}_${makeId()}`, minion: { ...pm, art: getArt(pm) }, x: pos.x, y: pos.y });
          }
        }
      }
    }
    if (deadGhosts.length > 0) {
      // Show death burst ~50ms after impact
      setTimeout(() => {
        setDeathGhosts(prev => [...prev, ...deadGhosts]);
        const ids = deadGhosts.map(g => g.id);
        setTimeout(() => setDeathGhosts(prev => prev.filter(g => !ids.includes(g.id))), 900);
      }, 350);
    }
  }

  // ── Game state refs ───────────────────────────────────────────────────────
  const cur = state.currentPlayer;
  const opp = 1 - cur;
  const curPlayer = state.players[cur];
  const oppPlayer = state.players[opp];
  const validTargets = getValidTargets(state);
  const spellTargets = getSpellTargets(state);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handlePlayCard = useCallback((cardIdx) => {
    const card = state.players[cur].hand[cardIdx];
    if (!card) return;
    const { state: ns } = playCard(state, cardIdx);

    // Summon animation — detect newly added minion
    if (card.type === 'MINION') {
      const newMinion = ns.players[cur].board[ns.players[cur].board.length - 1];
      if (newMinion) {
        // Find future position (approximate board center for now; actual pos appears after render)
        setNewlyPlayed(prev => new Set([...prev, newMinion.id]));
        setTimeout(() => setNewlyPlayed(prev => { const n = new Set(prev); n.delete(newMinion.id); return n; }), 500);
        // Summon ring after brief render delay
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
    // Pending spell → resolve it
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
        const spellCard = state.pendingSpell.card;
        const spellCasterEl = document.querySelector(`[data-hero-idx="${cur}"]`);
        const casterPos = getCenter(spellCasterEl);
        if (casterPos && targetPos) {
          queueAnim({ kind: 'projectile', attackType: 'magic', startX: casterPos.x, startY: casterPos.y, endX: targetPos.x, endY: targetPos.y }, 0, 400);
          const dmg = abs.includes('spell_damage_3') ? 3 : 2;
          queueAnim({ kind: 'impact',     attackType: 'magic', x: targetPos.x, y: targetPos.y }, 310, 600);
          queueAnim({ kind: 'damage-num', x: targetPos.x, y: targetPos.y - 20, amount: dmg },     330, 900);
          // Death check
          const curBoard = state.players[opp].board[boardIdx];
          if (curBoard && curBoard.health - dmg <= 0) {
            const pos = targetPos;
            setTimeout(() => {
              setDeathGhosts(prev => [...prev, { id: `ghost_spell_${makeId()}`, minion: { ...curBoard, art: getArt(curBoard) }, x: pos.x, y: pos.y }]);
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

    // Attack enemy minion
    if (!state.selectedMinion) return;
    const atkBI    = state.selectedMinion.boardIdx;
    const attacker = state.players[cur].board[atkBI];
    const defender = state.players[opp].board[boardIdx];
    if (!attacker || !defender) return;

    const atkEl  = document.querySelector(`[data-minion-id="${attacker.id}"]`);
    const defEl  = document.querySelector(`[data-minion-id="${defender.id}"]`);
    const atkPos = getCenter(atkEl);
    const defPos = getCenter(defEl);
    const atkType = getAttackType(attacker);

    const ns = attackTarget(state, 'enemy_minion', boardIdx);
    triggerAttack(state, ns, atkPos, defPos, atkType, attacker.attack, false, opp);
    setState(ns);
  }, [state, cur, opp]);

  const handleHeroClick = useCallback((playerIdx) => {
    if (state.pendingSpell) return;
    if (playerIdx === opp && state.selectedMinion) {
      const atkBI    = state.selectedMinion.boardIdx;
      const attacker = state.players[cur].board[atkBI];
      if (!attacker) return;

      const atkEl   = document.querySelector(`[data-minion-id="${attacker.id}"]`);
      const heroEl  = document.querySelector(`[data-hero-idx="${opp}"]`);
      const atkPos  = getCenter(atkEl);
      const heroPos = getCenter(heroEl);
      const atkType = getAttackType(attacker);

      const ns = attackTarget(state, 'enemy_hero', null);
      triggerAttack(state, ns, atkPos, heroPos, atkType, attacker.attack, true, opp);
      setState(ns);
    }
  }, [state, cur, opp]);

  const handleEndTurn   = useCallback(() => { if (!state.pendingSpell) setState(endTurn(state)); }, [state]);
  const handleReady     = useCallback(() => setState(beginNewTurn(state)), [state]);
  const handleCancelSpell = useCallback(() => setState(s => ({ ...s, pendingSpell: null })), []);

  // ── Render ────────────────────────────────────────────────────────────────
  if (state.phase === 'gameover')   return <GameOverScreen  winner={state.players[state.winner]} onRestart={onRestart} />;
  if (state.phase === 'transition') return <TransitionScreen nextPlayerName={state.players[state.currentPlayer].hero.name} onReady={handleReady} />;

  return (
    <div className="game-board">
      {/* ── Opponent area ── */}
      <div className="player-area opponent-area">
        <div className="hero-zone">
          <Hero
            hero={oppPlayer.hero} playerIdx={opp} isOpponent
            isValidTarget={validTargets.hero}
            onClick={() => handleHeroClick(opp)}
            isCurrentPlayer={false}
            isFlashing={flashHeroes.has(opp)}
          />
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

      {/* ── Board ── */}
      <div className="board-area">
        <div className="minion-row opponent-row">
          {oppPlayer.board.map((minion, i) => (
            <BoardMinionCard
              key={minion.id}
              minion={minion}
              isSelected={false}
              isValidTarget={
                (!!state.selectedMinion && validTargets.minions.includes(i)) ||
                (!!state.pendingSpell   && spellTargets.enemyMinions.includes(i))
              }
              canAttack={false}
              onClick={() => handleSelectMinion(opp, i)}
              isLunging={shakingIds.has(minion.id)}
              isTakingHit={hitIds.has(minion.id)}
              isNewlyPlayed={newlyPlayed.has(minion.id)}
            />
          ))}
          {oppPlayer.board.length === 0 && <div className="empty-board-hint opp-hint">Opponent's side</div>}
        </div>

        <div className="board-divider"><div className="rope" /></div>

        <div className="minion-row player-row">
          {curPlayer.board.map((minion, i) => (
            <BoardMinionCard
              key={minion.id}
              minion={minion}
              isSelected={state.selectedMinion?.boardIdx === i && state.selectedMinion?.playerIdx === cur}
              isValidTarget={!!state.pendingSpell && spellTargets.friendlyMinions.includes(i)}
              canAttack={minion.canAttack}
              onClick={() => handleSelectMinion(cur, i)}
              isLunging={shakingIds.has(minion.id)}
              isTakingHit={hitIds.has(minion.id)}
              isNewlyPlayed={newlyPlayed.has(minion.id)}
            />
          ))}
          {curPlayer.board.length === 0 && <div className="empty-board-hint">Play minions here</div>}
        </div>
      </div>

      {/* ── Current player area ── */}
      <div className="player-area current-area">
        <div className="hero-zone">
          <Hero
            hero={curPlayer.hero} playerIdx={cur} isOpponent={false}
            isValidTarget={false}
            onClick={() => handleHeroClick(cur)}
            isCurrentPlayer
            isFlashing={flashHeroes.has(cur)}
          />
          <DeckCounter count={curPlayer.deck.length} />
          <ManaBar mana={curPlayer.mana} />
        </div>
        <div className="hand-zone player-hand">
          {curPlayer.hand.map((card, i) => (
            <HandCard
              key={card.id}
              card={card}
              canPlay={curPlayer.mana.current >= card.cost && (card.type === 'SPELL' || curPlayer.board.length < 7)}
              onClick={() => handlePlayCard(i)}
              isOpponent={false}
            />
          ))}
        </div>
      </div>

      {/* ── End Turn button ── */}
      <div className="end-turn-zone">
        <button
          className={`end-turn-btn ${state.pendingSpell ? 'disabled' : ''}`}
          onClick={state.pendingSpell ? undefined : handleEndTurn}
        >
          {state.pendingSpell ? 'Choose Target' : 'END TURN'}
        </button>
        {state.pendingSpell && <button className="cancel-btn" onClick={handleCancelSpell}>Cancel</button>}
        <div className="turn-indicator">Turn {state.turn}</div>
        <div className="active-player-label">{curPlayer.hero.name}</div>
      </div>

      {/* ── Hint overlay ── */}
      {state.selectedMinion && !state.pendingSpell && (
        <div className="action-hint">Select an enemy target to attack</div>
      )}
      {state.pendingSpell && (
        <div className="action-hint spell-hint">
          🎯 Select a target for <strong>{state.pendingSpell.card.name}</strong>
        </div>
      )}

      {/* ── Log ── */}
      {state.log?.length > 0 && <div className="game-log">{state.log[0]}</div>}

      {/* ── Animation layer (always on top) ── */}
      <AnimLayer anims={anims} deathGhosts={deathGhosts} screenFlash={screenFlash} />
    </div>
  );
}
