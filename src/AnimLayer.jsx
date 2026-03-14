import { useRef, useEffect } from 'react';

// ─── Attack type helpers ───────────────────────────────────────────────────────
export function getAttackType(card) {
  const n = (card?.name || '').toLowerCase();
  if (/wizard|magic|neural|ai engineer|openai|anthropic|script wizard|data analyst|analytics|query/.test(n)) return 'magic';
  if (/engineer|developer|hacker|coder|java|python|sql|aws|cloud|devops|k8s|docker|container|gopher|systems|low.level/.test(n)) return 'electric';
  if (/ceo|chief executive|vp|vice|director|principal|staff|executive officer|performance review|tech debt/.test(n)) return 'punch';
  if (/ninja|deal closer|sales|growth hacker|sprint|startup founder|intern/.test(n)) return 'sword';
  if (/fire|flame|burn|meteor/.test(n)) return 'fire';
  if ((card?.attack || 0) >= 5) return 'punch';
  if ((card?.attack || 0) >= 3) return 'sword';
  return 'sword';
}

const PROJ_EMOJI  = { sword: '⚔️', magic: '🔮', electric: '⚡', fire: '🔥', punch: '👊', arrow: '🏹' };
const IMPACT_EMOJI = { sword: '💥', magic: '✨', electric: '🌟', fire: '💥', punch: '💢', arrow: '💥' };
const GLOW_COLOR  = { sword: '#fcd34d', magic: '#c084fc', electric: '#60a5fa', fire: '#f97316', punch: '#fb923c', arrow: '#86efac' };
const PARTICLE_COLORS = {
  sword:    ['#fcd34d', '#f59e0b', '#fef3c7'],
  magic:    ['#c084fc', '#a855f7', '#e9d5ff', '#818cf8'],
  electric: ['#60a5fa', '#38bdf8', '#bae6fd', '#fff'],
  fire:     ['#f97316', '#ef4444', '#fbbf24', '#fde68a'],
  punch:    ['#fb923c', '#fcd34d', '#fff', '#fed7aa'],
  arrow:    ['#86efac', '#4ade80', '#bbf7d0'],
};

// ─── Projectile ───────────────────────────────────────────────────────────────
function Projectile({ anim }) {
  const ref = useRef();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { startX, startY, endX, endY, attackType } = anim;
    const dx = endX - startX;
    const dy = endY - startY;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const glow = GLOW_COLOR[attackType] || '#fcd34d';

    Object.assign(el.style, {
      left: `${startX}px`, top: `${startY}px`,
      transform: `translate(-50%,-50%) rotate(${angle}deg) scale(0.4)`,
      opacity: '0',
      filter: `drop-shadow(0 0 10px ${glow}) drop-shadow(0 0 20px ${glow})`,
    });

    // Appear
    const r1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'opacity 0.06s, transform 0.1s';
        el.style.opacity = '1';
        el.style.transform = `translate(-50%,-50%) rotate(${angle}deg) scale(1.4)`;

        // Fly
        setTimeout(() => {
          el.style.transition = `left 0.31s cubic-bezier(0.25,0,0.85,1), top 0.31s cubic-bezier(0.25,0,0.85,1), transform 0.31s, opacity 0.07s 0.26s`;
          el.style.left = `${endX}px`;
          el.style.top = `${endY}px`;
          el.style.transform = `translate(-50%,-50%) rotate(${angle}deg) scale(0.6)`;
          el.style.opacity = '0';
        }, 70);
      });
    });
    return () => cancelAnimationFrame(r1);
  }, []);

  return (
    <span
      ref={ref}
      style={{ position: 'fixed', pointerEvents: 'none', zIndex: 500, fontSize: '2.2rem', lineHeight: 1, userSelect: 'none' }}
    >
      {PROJ_EMOJI[anim.attackType] || '⚔️'}
    </span>
  );
}

// ─── Impact ───────────────────────────────────────────────────────────────────
function ImpactRing({ x, y, attackType, count = 8 }) {
  const colors = PARTICLE_COLORS[attackType] || PARTICLE_COLORS.sword;
  const glow   = GLOW_COLOR[attackType] || '#fcd34d';

  return (
    <div style={{ position: 'fixed', left: x, top: y, transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 500 }}>
      {/* Central emoji burst */}
      <span
        className="impact-main"
        style={{ filter: `drop-shadow(0 0 14px ${glow}) drop-shadow(0 0 6px #fff)`, fontSize: '3rem' }}
      >
        {IMPACT_EMOJI[attackType] || '💥'}
      </span>

      {/* Ring of particles */}
      {Array.from({ length: count }).map((_, i) => {
        const color = colors[i % colors.length];
        const dist  = 35 + (i % 3) * 18;
        const size  = 6 + (i % 3) * 3;
        return (
          <div
            key={i}
            className="impact-particle"
            style={{
              '--angle': `${(i / count) * 360}deg`,
              '--dist': `${dist}px`,
              '--color': color,
              '--size': `${size}px`,
            }}
          />
        );
      })}

      {/* Shockwave ring */}
      <div className="shockwave" style={{ '--color': glow }} />
    </div>
  );
}

// ─── Damage Number ────────────────────────────────────────────────────────────
function DamageNumber({ x, y, amount }) {
  const big = amount >= 5;
  return (
    <div
      className={`damage-num ${big ? 'damage-num--big' : ''}`}
      style={{ position: 'fixed', left: x, top: y, pointerEvents: 'none', zIndex: 501 }}
    >
      -{amount}
    </div>
  );
}

// ─── Heart Crack ──────────────────────────────────────────────────────────────
function HeartCrack({ x, y }) {
  return (
    <div className="heart-crack-anim" style={{ position: 'fixed', left: x, top: y, pointerEvents: 'none', zIndex: 502 }}>
      💔
    </div>
  );
}

// ─── Divine Shield Break ──────────────────────────────────────────────────────
function DivineBurst({ x, y }) {
  return (
    <div style={{ position: 'fixed', left: x, top: y, transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 502 }}>
      <div className="divine-burst-ring" />
      <div className="divine-burst-ring divine-burst-ring--2" />
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="divine-shard" style={{ '--angle': `${i * 36}deg` }} />
      ))}
      <span className="divine-burst-glow" style={{ fontSize: '2.5rem' }}>✨</span>
    </div>
  );
}

// ─── Death Explosion ──────────────────────────────────────────────────────────
function DeathBurst({ ghost }) {
  const { minion, x, y } = ghost;
  const type   = getAttackType(minion);
  const colors = PARTICLE_COLORS[type] || PARTICLE_COLORS.sword;
  const glow   = GLOW_COLOR[type] || '#fcd34d';

  return (
    <div style={{ position: 'fixed', left: x, top: y, transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 501 }}>
      {/* Skull rising */}
      <div className="death-skull">💀</div>

      {/* Particles radiating out */}
      {Array.from({ length: 12 }).map((_, i) => {
        const color = colors[i % colors.length];
        const dist  = 45 + (i % 4) * 20;
        const size  = 8 + (i % 3) * 4;
        return (
          <div
            key={i}
            className="death-particle"
            style={{
              '--angle': `${(i / 12) * 360}deg`,
              '--dist': `${dist}px`,
              '--color': color,
              '--size': `${size}px`,
              animationDelay: `${i * 20}ms`,
            }}
          />
        );
      })}

      {/* Central explosion */}
      <div
        className="death-center"
        style={{ filter: `drop-shadow(0 0 16px ${glow})`, fontSize: '3.5rem' }}
      >
        💥
      </div>

      {/* Minion art ghosting away */}
      <div className="death-ghost-art" style={{ filter: `drop-shadow(0 0 8px ${glow})`, fontSize: '2.5rem' }}>
        {minion.art || '👻'}
      </div>
    </div>
  );
}

// ─── Summon Flash ─────────────────────────────────────────────────────────────
function SummonFlash({ x, y, attackType }) {
  const glow = GLOW_COLOR[attackType] || '#22c55e';
  return (
    <div style={{ position: 'fixed', left: x, top: y, transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 499 }}>
      <div className="summon-ring" style={{ '--color': glow }} />
      <div className="summon-ring summon-ring--2" style={{ '--color': glow }} />
    </div>
  );
}

// ─── Screen Vignette Flash ────────────────────────────────────────────────────
function ScreenFlash() {
  return <div className="screen-vignette-flash" />;
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function AnimLayer({ anims, deathGhosts, screenFlash }) {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {screenFlash && <ScreenFlash />}

      {anims.map(a => {
        switch (a.kind) {
          case 'projectile':   return <Projectile    key={a.id} anim={a} />;
          case 'impact':       return <ImpactRing    key={a.id} x={a.x} y={a.y} attackType={a.attackType} />;
          case 'damage-num':   return <DamageNumber  key={a.id} x={a.x} y={a.y} amount={a.amount} />;
          case 'heart-crack':  return <HeartCrack    key={a.id} x={a.x} y={a.y} />;
          case 'divine-burst': return <DivineBurst   key={a.id} x={a.x} y={a.y} />;
          case 'summon':       return <SummonFlash   key={a.id} x={a.x} y={a.y} attackType={a.attackType} />;
          default: return null;
        }
      })}

      {deathGhosts.map(ghost => (
        <DeathBurst key={ghost.id} ghost={ghost} />
      ))}
    </div>
  );
}
