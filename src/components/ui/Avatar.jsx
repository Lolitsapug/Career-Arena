import styles from './Avatar.module.css'

export default function Avatar({ name = '', size = 40 }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials || '?'}
    </div>
  )
}
