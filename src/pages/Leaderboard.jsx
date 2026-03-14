import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/ui/Avatar'
import styles from './Leaderboard.module.css'
import BgParticles from '../components/BgParticles'

const MOCK_PLAYERS = [
  { name: 'Jane Smith',    company: 'Google',    role: 'Senior Engineer',     wins: 42, losses: 8,  deck: ['⚙️','🌟','👑'] },
  { name: 'Mark Rivera',   company: 'Meta',      role: 'Product Manager',     wins: 38, losses: 12, deck: ['📋','📈','💼'] },
  { name: 'Ali Khan',      company: 'Stripe',    role: 'Staff Engineer',      wins: 35, losses: 10, deck: ['⚙️','📊','🌟'] },
  { name: 'Sara Chen',     company: 'Netflix',   role: 'Data Scientist',      wins: 31, losses: 9,  deck: ['📊','📊','⚙️'] },
  { name: 'Lucas Moore',   company: 'Amazon',    role: 'Engineering Manager', wins: 28, losses: 14, deck: ['📋','⚙️','💼'] },
  { name: 'Priya Patel',   company: 'Airbnb',    role: 'UX Designer',         wins: 25, losses: 11, deck: ['🎨','🎨','💼'] },
  { name: 'Tom Brady',     company: 'Salesforce', role: 'Sales Director',     wins: 22, losses: 13, deck: ['📈','📈','💼'] },
  { name: 'Emma Wilson',   company: 'Apple',     role: 'Frontend Engineer',   wins: 20, losses: 10, deck: ['⚙️','🎨','💼'] },
  { name: 'David Park',    company: 'Twitter',   role: 'Backend Developer',   wins: 18, losses: 12, deck: ['⚙️','📊','💼'] },
  { name: 'Lena Fischer',  company: 'Spotify',   role: 'ML Engineer',         wins: 15, losses: 8,  deck: ['📊','⚙️','🌟'] },
  { name: 'Ryan Thompson', company: 'Lyft',      role: 'Product Designer',    wins: 14, losses: 9,  deck: ['🎨','📋','💼'] },
  { name: 'You',           company: '—',         role: 'Arena Challenger',    wins: 14, losses: 6,  deck: ['⚙️','💼','📋'], isYou: true },
]

const SORT_OPTIONS = ['Wins', 'Win Rate', 'Recent']

const RANK_BADGES = ['🥇', '🥈', '🥉']

export default function Leaderboard() {
  const navigate = useNavigate()
  const [sort, setSort] = useState('Wins')

  const sorted = [...MOCK_PLAYERS].sort((a, b) => {
    if (sort === 'Wins') return b.wins - a.wins
    if (sort === 'Win Rate') return (b.wins / (b.wins + b.losses)) - (a.wins / (a.wins + a.losses))
    return 0 // Recent — keep as-is
  })

  const youEntry = sorted.find(p => p.isYou)
  const youRank = sorted.indexOf(youEntry) + 1

  return (
    <div className={styles.page}>
      <BgParticles />
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => navigate('/')}>← Back</button>
        <div className={styles.titleArea}>
          <h2 className={styles.pageTitle}>Leaderboard</h2>
          <p className={styles.subtitle}>Top Arena players ranked by career deck performance</p>
        </div>
        <div className={styles.sortPills}>
          {SORT_OPTIONS.map(s => (
            <button
              key={s}
              className={`${styles.pill} ${sort === s ? styles.pillActive : ''}`}
              onClick={() => setSort(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <div className={styles.tableHeader}>
          <span className={styles.colRank}>#</span>
          <span className={styles.colPlayer}>Player</span>
          <span className={styles.colDeck}>Deck Preview</span>
          <span className={styles.colStat}>W</span>
          <span className={styles.colStat}>L</span>
          <span className={styles.colStat}>Win%</span>
        </div>

        {sorted.map((player, idx) => {
          const rank = idx + 1
          const winRate = Math.round((player.wins / (player.wins + player.losses)) * 100)
          return (
            <div key={player.name} className={`${styles.row} ${player.isYou ? styles.youRow : ''}`}>
              <span className={styles.colRank}>
                {rank <= 3 ? RANK_BADGES[rank - 1] : <span className={styles.rankNum}>{rank}</span>}
              </span>
              <span className={styles.colPlayer}>
                <Avatar name={player.name} size={32} imageUrl={player.imageUrl} />
                <div className={styles.playerInfo}>
                  <span className={styles.playerName}>{player.name}{player.isYou ? ' (You)' : ''}</span>
                  <span className={styles.playerMeta}>{player.role} · {player.company}</span>
                </div>
              </span>
              <span className={styles.colDeck}>
                {player.deck.map((icon, i) => (
                  <span key={i} className={styles.miniCard}>{icon}</span>
                ))}
              </span>
              <span className={`${styles.colStat} ${styles.wins}`}>{player.wins}</span>
              <span className={`${styles.colStat} ${styles.losses}`}>{player.losses}</span>
              <span className={styles.colStat}>{winRate}%</span>
            </div>
          )
        })}
      </div>

      {/* Sticky "You" bar */}
      {youEntry && (
        <div className={styles.youBar}>
          <span>Your Rank: <strong>#{youRank}</strong></span>
          <span className={styles.divider}>|</span>
          <span>Wins: <strong style={{ color: 'var(--accent-success)' }}>{youEntry.wins}</strong></span>
          <span className={styles.divider}>|</span>
          <span>Losses: <strong style={{ color: 'var(--accent-danger)' }}>{youEntry.losses}</strong></span>
          <span className={styles.divider}>|</span>
          <span>Win Rate: <strong>{Math.round(youEntry.wins / (youEntry.wins + youEntry.losses) * 100)}%</strong></span>
        </div>
      )}
    </div>
  )
}
