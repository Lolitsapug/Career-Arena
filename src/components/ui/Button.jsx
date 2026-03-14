import styles from './Button.module.css'

export default function Button({ children, variant = 'primary', disabled, onClick, className = '' }) {
  return (
    <button
      className={`${styles.btn} ${styles[variant]} ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
