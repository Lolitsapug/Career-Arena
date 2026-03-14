import Avatar from '../ui/Avatar'
import styles from './HeroPortrait.module.css'

export default function HeroPortrait({ name, hp, isActive, side, imageUrl }) {
  const lowHp = hp <= 10
  const pct = Math.max(0, Math.min(100, (hp / 30) * 100))

  return (
    <div className={`${styles.hero} ${isActive ? styles.active : ''} ${side === 'right' ? styles.right : ''}`}>
      <Avatar name={name} size={38} imageUrl={imageUrl} />
      <div className={styles.info}>
        <span className={styles.name}>{name}</span>
        <div className={styles.hpRow}>
          <span className={`${styles.hpNum} ${lowHp ? styles.lowHp : ''}`}>
            ❤️ {hp}
          </span>
          <div className={styles.hpBarTrack}>
            <div
              className={`${styles.hpBarFill} ${lowHp ? styles.hpBarLow : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
