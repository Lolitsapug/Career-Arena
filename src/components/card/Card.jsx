import styles from './Card.module.css'

const RARITY_COLORS = {
  common: 'var(--text-dim)',
  rare: 'var(--accent-primary)',
  legendary: 'var(--accent-gold)',
}

export default function Card({
  card,
  size = 'board',       // 'hand' | 'board' | 'viewer'
  selected = false,
  attacker = false,
  onClick,
  isEnemy = false,
}) {
  const { name, role, company, cost, attack, currentHp, hp, specialAbility, artGradient, rarity } = card
  const hpVal = currentHp ?? hp
  const lowHp = hpVal <= 2

  return (
    <div
      className={`
        ${styles.card}
        ${styles[size]}
        ${selected ? styles.selected : ''}
        ${attacker ? styles.attacker : ''}
        ${isEnemy ? styles.enemy : ''}
      `}
      style={{ '--rarity-color': RARITY_COLORS[rarity] || RARITY_COLORS.common }}
      onClick={onClick}
    >
      {/* Cost */}
      <div className={styles.cost}>{cost}</div>

      {/* Art */}
      <div className={styles.art} style={{ background: artGradient }}>
        <span className={styles.roleIcon}>{getRoleEmoji(role)}</span>
      </div>

      {/* Name */}
      <div className={styles.nameArea}>
        <div className={styles.cardName}>{name}</div>
        <div className={styles.cardSub}>{company}</div>
      </div>

      {/* Ability */}
      {specialAbility && (
        <div className={styles.ability}>{specialAbility.name}: {specialAbility.description}</div>
      )}

      {/* Stats */}
      <div className={styles.stats}>
        <span className={styles.attack}>{attack}</span>
        <span className={`${styles.hpBadge} ${lowHp ? styles.lowHp : ''}`}>{hpVal}</span>
      </div>
    </div>
  )
}

function getRoleEmoji(role = '') {
  const r = role.toLowerCase()
  if (r.includes('engineer') || r.includes('developer') || r.includes('dev')) return '⚙️'
  if (r.includes('manager') || r.includes('director')) return '📋'
  if (r.includes('design')) return '🎨'
  if (r.includes('data') || r.includes('analyst') || r.includes('scientist')) return '📊'
  if (r.includes('ceo') || r.includes('chief') || r.includes('vp')) return '👑'
  if (r.includes('sales')) return '📈'
  if (r.includes('lead') || r.includes('staff')) return '🌟'
  return '💼'
}
