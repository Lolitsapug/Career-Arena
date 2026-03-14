import { memo } from 'react'
import styles from './BgParticles.module.css'

const PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  delay: `${i * 0.7}s`,
  x: `${(i * 73) % 100}%`,
  dur: `${8 + (i * 1.3) % 6}s`,
  rot: `${10 + (i * 11) % 30}deg`,
}))

export default memo(function BgParticles() {
  return (
    <div className={styles.bgParticles}>
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          className={styles.particle}
          style={{ '--delay': p.delay, '--x': p.x, '--dur': p.dur, '--rot': p.rot }}
        />
      ))}
    </div>
  )
})
