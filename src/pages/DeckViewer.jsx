import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { useDeckStore } from '../store/deckStore'
import styles from './DeckViewer.module.css'
import BgParticles from '../components/BgParticles'

const ABILITY_LABELS = {
  taunt:                      { label: 'Taunt',          icon: '🛡️', desc: 'Must be attacked first. Protects other minions and your hero.' },
  divine_shield:              { label: 'Divine Shield',  icon: '✨', desc: 'Absorbs the first source of damage, removing the shield.' },
  rush:                       { label: 'Rush',            icon: '⚡', desc: 'Can attack enemy minions immediately when played.' },
  charge:                     { label: 'Charge',          icon: '💨', desc: 'Can attack immediately, including the enemy hero.' },
  stealth:                    { label: 'Stealth',         icon: '🌑', desc: 'Cannot be targeted until it attacks.' },
  battlecry_draw_1:           { label: 'Battlecry',       icon: '🎴', desc: 'When played: Draw 1 card.' },
  battlecry_draw_2:           { label: 'Battlecry',       icon: '🎴', desc: 'When played: Draw 2 cards.' },
  battlecry_aoe_1:            { label: 'Battlecry',       icon: '🎴', desc: 'When played: Deal 1 damage to all enemies.' },
  battlecry_aoe_2:            { label: 'Battlecry',       icon: '🎴', desc: 'When played: Deal 2 damage to all enemies.' },
  battlecry_buff_friendly:    { label: 'Battlecry',       icon: '🎴', desc: 'When played: Give all friendly minions +1/+1.' },
  battlecry_buff_all_1:       { label: 'Battlecry',       icon: '🎴', desc: 'When played: Give all friendly minions +1/+1.' },
  battlecry_buff_all_2:       { label: 'Battlecry',       icon: '🎴', desc: 'When played: Give all friendly minions +2/+2.' },
  battlecry_buff_self:        { label: 'Battlecry',       icon: '🎴', desc: 'When played: Gain +2/+2.' },
  battlecry_silence:          { label: 'Battlecry',       icon: '🎴', desc: 'When played: Silence an enemy minion.' },
  deathrattle_draw_1:         { label: 'Deathrattle',     icon: '💀', desc: 'When destroyed: Draw 1 card.' },
  deathrattle_summon_intern:  { label: 'Deathrattle',     icon: '💀', desc: 'When destroyed: Summon a 1/1 Intern.' },
  deathrattle_damage_all:     { label: 'Deathrattle',     icon: '💀', desc: 'When destroyed: Deal 1 damage to all minions.' },
  deathrattle_heal_hero:      { label: 'Deathrattle',     icon: '💀', desc: 'When destroyed: Restore 4 HP to your hero.' },
}

function getArt(card) {
  const n = (card?.name || '').toLowerCase()
  const MAP = {
    ninja:'🥷', wizard:'🧙', architect:'🏗️', engineer:'⚙️', ceo:'👔', cto:'💻',
    founder:'🚀', data:'📊', cloud:'☁️', security:'🔐', developer:'💾', manager:'📋',
    marketing:'📢', sales:'💰', design:'🎨', intern:'🎓', hacker:'💻',
    product:'📦', analyst:'📈', sprint:'🏃', coffee:'☕', pivot:'🔄',
    lead:'🏆', junior:'👦', director:'🏛️', vp:'🏛️', principal:'🎯',
    senior:'⭐', staff:'🌟', consultant:'💼',
  }
  for (const [kw, emoji] of Object.entries(MAP)) {
    if (n.includes(kw)) return emoji
  }
  return '🃏'
}

function CardModal({ card, onClose }) {
  const abilities = (card.abilities || []).filter(a => ABILITY_LABELS[a])
  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
        <button className={styles.modalClose} onClick={onClose}>✕</button>

        <div className={styles.modalArt}>{getArt(card)}</div>
        <div className={styles.modalName}>{card.name}</div>
        {card.role && card.role !== card.name && (
          <div className={styles.modalRole}>{card.role}{card.company ? ` · ${card.company}` : ''}</div>
        )}

        <div className={styles.modalStats}>
          <div className={styles.modalStat}>
            <span className={styles.modalStatIcon}>💎</span>
            <span className={styles.modalStatLabel}>Cost</span>
            <span className={styles.modalStatVal}>{card.cost}</span>
          </div>
          <div className={styles.modalStat}>
            <span className={styles.modalStatIcon}>⚔️</span>
            <span className={styles.modalStatLabel}>Attack</span>
            <span className={styles.modalStatVal}>{card.attack}</span>
          </div>
          <div className={styles.modalStat}>
            <span className={styles.modalStatIcon}>❤️</span>
            <span className={styles.modalStatLabel}>Health</span>
            <span className={styles.modalStatVal}>{card.hp ?? card.health}</span>
          </div>
        </div>

        {abilities.length > 0 && (
          <div className={styles.modalAbilities}>
            {abilities.map(a => {
              const info = ABILITY_LABELS[a]
              if (!info) return null
              return (
                <div key={a} className={styles.modalAbility}>
                  <span className={styles.modalAbilityLabel}>{info.label}</span>
                  <span className={styles.modalAbilityDesc}>{info.desc}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Flavour text: only show when the card has recognised abilities — it describes them in career terms */}
        {abilities.length > 0 && card.abilityDescription && (
          <p className={styles.modalFlavorDesc}>"{card.abilityDescription}"</p>
        )}
        {/* Legacy old-format cards */}
        {abilities.length === 0 && card.specialAbility?.description && (
          <p className={styles.modalFlavorDesc}>{card.specialAbility.description}</p>
        )}

        <div className={styles.modalRarity} data-rarity={card.rarity}>{card.rarity}</div>
      </div>
    </div>
  )
}

function CardThumb({ card, onClick }) {
  const abilities = (card.abilities || []).filter(a => ABILITY_LABELS[a])
  const hasTaunt = abilities.includes('taunt')
  // Only show legacy text for genuinely old-format cards that used specialAbility object
  const legacyDesc = abilities.length === 0 && card.specialAbility?.description
  const legacyName = abilities.length === 0 && card.specialAbility?.name

  return (
    <div
      className={`${styles.cardThumb} ${hasTaunt ? styles.cardThumbTaunt : ''}`}
      onClick={onClick}
      title="Click to expand"
    >
      <div className={styles.thumbCost}>{card.cost}</div>
      <div className={styles.thumbArt}>{getArt(card)}</div>
      <div className={styles.thumbName}>{card.name}</div>

      <div className={styles.thumbAbilityRows}>
        {abilities.map(a => {
          const info = ABILITY_LABELS[a]
          return (
            <div key={a} className={styles.thumbAbilityRow}>
              <span className={styles.thumbAbilityIcon}>{info.icon}</span>
              <span className={styles.thumbAbilityText}>
                <strong>{info.label}:</strong> {info.desc}
              </span>
            </div>
          )
        })}
        {legacyDesc && (
          <div className={styles.thumbAbilityRow}>
            <span className={styles.thumbAbilityIcon}>✨</span>
            <span className={styles.thumbAbilityText}>
              {legacyName && <strong>{legacyName}: </strong>}
              {legacyDesc}
            </span>
          </div>
        )}
      </div>

      <div className={styles.thumbStats}>
        <span className={styles.thumbAtk}>⚔{card.attack}</span>
        <span className={styles.thumbHp}>❤{card.hp ?? card.health}</span>
      </div>
    </div>
  )
}

export default function DeckViewer() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { savedDecks } = useDeckStore()
  const [expandedCard, setExpandedCard] = useState(null)

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
      <BgParticles />
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => navigate('/')}>← Back</button>
        <h2 className={styles.pageTitle}>
          {indexParam !== null ? `${decks[0].ownerName}'s Deck` : 'All Decks'}
        </h2>
        <div />
      </div>

      <div className={styles.decksWrapper}>
        {decks.map((deck, idx) => (
          <DeckPanel key={idx} deck={deck} onCardClick={setExpandedCard} />
        ))}
      </div>

      {expandedCard && <CardModal card={expandedCard} onClose={() => setExpandedCard(null)} />}
    </div>
  )
}

function DeckPanel({ deck, onCardClick }) {
  const { cards, passive, ownerName } = deck

  const avgCost = (cards.reduce((s, c) => s + c.cost, 0) / cards.length).toFixed(1)
  const totalAtk = cards.reduce((s, c) => s + c.attack, 0)
  const totalHp  = cards.reduce((s, c) => s + (c.hp ?? c.health ?? 0), 0)
  const withAbilities = cards.filter(c => (c.abilities?.length > 0) || c.specialAbility).length

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
            <CardThumb key={card.id} card={card} onClick={() => onCardClick(card)} />
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
              <span className={styles.statValue} style={{ color: '#fcd34d' }}>{totalAtk}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Total HP</span>
              <span className={styles.statValue} style={{ color: '#f87171' }}>{totalHp}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>With Abilities</span>
              <span className={styles.statValue}>{withAbilities}</span>
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
