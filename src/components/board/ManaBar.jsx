import styles from './ManaBar.module.css'

export default function ManaBar({ current, max }) {
  return (
    <div className={styles.container}>
      <div className={styles.label}>
        <span className={styles.icon}>💎</span>
        <span className={styles.count}>{current}<span className={styles.max}>/{max}</span></span>
      </div>
      <div className={styles.crystals}>
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            className={`${styles.crystal} ${i < current ? styles.full : styles.spent}`}
            style={{ '--i': i }}
          />
        ))}
      </div>
    </div>
  )
}
