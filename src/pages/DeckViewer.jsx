import { useNavigate, useSearchParams } from 'react-router-dom'
import Card from '../components/card/Card'
import Button from '../components/ui/Button'
import { useDeckStore } from '../store/deckStore'
import styles from './DeckViewer.module.css'

export default function DeckViewer() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { savedDecks } = useDeckStore()

  // ?i=N views a specific saved deck; no param shows all saved decks
  const indexParam = searchParams.get('i')
  const decks = indexParam !== null
    ? [savedDecks[parseInt(indexParam)]].filter(Boolean)
    : savedDecks

  if (decks.length === 0) {
    return (
      <div className={styles.empty}>
        <h2>No decks found</h2>
        <p>Import a LinkedIn profile from the main menu to generate a deck.</p>
        <Button variant="primary" onClick={() => navigate('/')}>Go to Menu</Button>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => navigate('/')}>← Back</button>
        <h2 className={styles.pageTitle}>
          {indexParam !== null ? `${decks[0].ownerName}'s Deck` : 'All Decks'}
        </h2>
        <div />
      </div>

      <div className={styles.decksWrapper}>
        {decks.map((deck, idx) => (
          <DeckPanel key={idx} deck={deck} />
        ))}
      </div>
    </div>
  )
}

function DeckPanel({ deck }) {
  const { cards, passive, ownerName } = deck

  const avgCost = (cards.reduce((s, c) => s + c.cost, 0) / cards.length).toFixed(1)
  const totalAtk = cards.reduce((s, c) => s + c.attack, 0)
  const totalHp = cards.reduce((s, c) => s + c.hp, 0)

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h3 className={styles.ownerName}>{ownerName}</h3>
          {deck.profileUrl && (
            <a className={styles.profileLink} href={deck.profileUrl} target="_blank" rel="noreferrer">
              {deck.profileUrl.replace('https://www.', '')}
            </a>
          )}
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.cardGrid}>
          {cards.map(card => (
            <Card key={card.id} card={card} size="viewer" />
          ))}
        </div>

        <div className={styles.sidebar}>
          {passive && (
            <div className={styles.passivePanel}>
              <div className={styles.passiveLabel}>Passive Ability</div>
              <div className={styles.passiveName}>{passive.name}</div>
              <p className={styles.passiveDesc}>{passive.description}</p>
            </div>
          )}

          <div className={styles.statsPanel}>
            <div className={styles.statsTitle}>Deck Stats</div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Cards</span>
              <span className={styles.statValue}>{cards.length}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Avg Cost</span>
              <span className={styles.statValue}>{avgCost}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Total ATK</span>
              <span className={styles.statValue} style={{ color: 'var(--accent-gold)' }}>{totalAtk}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Total HP</span>
              <span className={styles.statValue} style={{ color: 'var(--accent-danger)' }}>{totalHp}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>With Abilities</span>
              <span className={styles.statValue}>{cards.filter(c => c.specialAbility).length}</span>
            </div>
          </div>

          <div className={styles.statsPanel}>
            <div className={styles.statsTitle}>Rarity</div>
            {['common', 'rare', 'legendary'].map(r => {
              const count = cards.filter(c => c.rarity === r).length
              return count > 0 ? (
                <div key={r} className={styles.stat}>
                  <span className={styles.statLabel} style={{ textTransform: 'capitalize' }}>{r}</span>
                  <span className={styles.statValue}>{count}</span>
                </div>
              ) : null
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
