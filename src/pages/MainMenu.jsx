import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Avatar from '../components/ui/Avatar'
import { useDeckStore } from '../store/deckStore'
import { useTheme } from '../theme'
import styles from './MainMenu.module.css'

// Convert a saved deck (from deckStore) into a profile object for createInitialState
function deckToProfile(deck) {
  if (!deck) return { name: 'Unknown', title: 'Developer', company: 'Unknown', skills: [], experience: 1 };
  // Use profileMeta saved from the server if available (has title/company/skills)
  if (deck.profileMeta) return deck.profileMeta;
  return {
    name: deck.ownerName || 'Unknown',
    title: deck.jobTitle || deck.title || 'Developer',
    company: deck.company || 'Unknown',
    skills: Array.isArray(deck.skills) ? deck.skills : (deck.skills || '').split(',').map(s => s.trim()).filter(Boolean),
    experience: deck.experience || 1,
  };
}

export default function MainMenu() {
  const navigate = useNavigate()
  const { savedDecks, player1Deck, player2Deck, isGenerating, generateError, generateDeck, selectDeck, deleteSavedDeck, clearSlot, clearAllDecks } = useDeckStore()
  const { theme, setTheme, themes } = useTheme()

  const [importModal, setImportModal]   = useState(false)
  const [profileInput, setProfileInput] = useState('')
  const [selectingFor, setSelectingFor] = useState(null) // 1 | 2
  const [deckPickerOpen, setDeckPickerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete]   = useState(null) // index

  const bothReady = player1Deck && player2Deck

  async function handleGenerate() {
    const url = profileInput.trim()
    if (!url) return
    const profileUrl = url.startsWith('http') ? url : `https://www.${url}`
    const deck = await generateDeck(profileUrl)
    if (deck) {
      setImportModal(false)
      setProfileInput('')
    }
  }

  function openDeckPicker(playerNum) {
    setSelectingFor(playerNum)
    setDeckPickerOpen(true)
  }

  function handlePickDeck(deck) {
    selectDeck(selectingFor, deck)
    setDeckPickerOpen(false)
    setSelectingFor(null)
  }

  function handleDeleteDeck(index, e) {
    e.stopPropagation()
    setConfirmDelete(index)
  }

  function timeAgo(ts) {
    const mins = Math.floor((Date.now() - ts) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div className={styles.page}>
      {/* Background particles */}
      <div className={styles.bgParticles}>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className={styles.particle} style={{ '--delay': `${i * 0.7}s`, '--x': `${(i * 73) % 100}%` }} />
        ))}
      </div>

      <div className={styles.layout}>
        {/* ── LEFT: Logo + actions ── */}
        <div className={styles.left}>
          <div className={styles.logo}>
            <h1 className={styles.title}>Career Arena</h1>
            <p className={styles.tagline}>Build your deck from your career</p>
          </div>

          <div className={styles.themeSwitcher}>
            <span className={styles.themeLabel}>Theme</span>
            <div className={styles.themeToggle} role="tablist" aria-label="Theme selection">
              {themes.map(option => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={theme === option.id}
                  className={`${styles.themeOption} ${theme === option.id ? styles.themeOptionActive : ''}`}
                  onClick={() => setTheme(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Player slots */}
          <div className={styles.slots}>
            <PlayerSlot
              num={1}
              deck={player1Deck}
              onPick={() => openDeckPicker(1)}
              onClear={() => clearSlot(1)}
            />
            <div className={styles.vsChip}>VS</div>
            <PlayerSlot
              num={2}
              deck={player2Deck}
              onPick={() => openDeckPicker(2)}
              onClear={() => clearSlot(2)}
            />
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            <Button variant="primary" disabled={!bothReady} onClick={() => {
              navigate('/game', { state: {
                deck1: player1Deck,
                deck2: player2Deck,
                profile1: deckToProfile(player1Deck),
                profile2: deckToProfile(player2Deck),
              }});
            }}>
              {bothReady ? '⚔️  Enter the Arena' : 'Select both decks to play'}
            </Button>
            <div className={styles.secondaryActions}>
              <Button variant="ghost" disabled={!player1Deck} onClick={() => navigate('/deck')}>
                View Decks
              </Button>
              <Button variant="ghost" onClick={() => navigate('/leaderboard')}>
                Leaderboard
              </Button>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Deck Library ── */}
        <div className={styles.right}>
          <div className={styles.libraryHeader}>
            <h2 className={styles.libraryTitle}>Deck Library</h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              {savedDecks.length > 0 && (
                <button className={styles.clearAllBtn} onClick={() => { if (window.confirm('Clear all saved decks?')) clearAllDecks() }}>
                  Clear All
                </button>
              )}
              <button className={styles.importBtn} onClick={() => setImportModal(true)}>
                + Import LinkedIn
              </button>
            </div>
          </div>

          {savedDecks.length === 0 ? (
            <div className={styles.emptyLibrary}>
              <p>No decks yet.</p>
              <p>Import a LinkedIn profile to generate your first deck.</p>
              <Button variant="ghost" onClick={() => setImportModal(true)}>Import Now</Button>
            </div>
          ) : (
            <div className={styles.deckList}>
              {savedDecks.map((deck, i) => (
                <div
                  key={i}
                  className={`${styles.deckCard} ${player1Deck === deck || player2Deck === deck ? styles.deckInUse : ''}`}
                  onClick={() => {
                    // Quick-assign: P1 first, then P2
                    if (!player1Deck || player1Deck === deck) {
                      selectDeck(1, deck)
                    } else if (!player2Deck || player2Deck === deck) {
                      selectDeck(2, deck)
                    }
                  }}
                >
                  <Avatar name={deck.ownerName} size={40} imageUrl={deck.profileMeta?.profilePictureUrl} />
                  <div className={styles.deckInfo}>
                    <span className={styles.deckName}>{deck.ownerName}</span>
                    <span className={styles.deckMeta}>
                      {deck.cards?.length ?? 0} cards · {deck.passive?.name ?? 'No passive'}
                    </span>
                    <span className={styles.deckTime}>{timeAgo(deck.generatedAt)}</span>
                  </div>
                  <div className={styles.deckSlotBadges}>
                    {player1Deck === deck && <span className={styles.badge1}>P1</span>}
                    {player2Deck === deck && <span className={styles.badge2}>P2</span>}
                  </div>
                  <div className={styles.deckActions}>
                    <button
                      className={styles.viewBtn}
                      title="View deck"
                      onClick={e => { e.stopPropagation(); navigate(`/deck?i=${i}`) }}
                    >👁</button>
                    <button
                      className={styles.assignBtn}
                      title="Assign to Player 1"
                      onClick={e => { e.stopPropagation(); selectDeck(1, deck) }}
                    >1</button>
                    <button
                      className={styles.assignBtn}
                      title="Assign to Player 2"
                      onClick={e => { e.stopPropagation(); selectDeck(2, deck) }}
                    >2</button>
                    <button
                      className={styles.deleteBtn}
                      title="Delete deck"
                      onClick={e => handleDeleteDeck(i, e)}
                    >✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Import Modal ── */}
      <Modal open={importModal} onClose={() => !isGenerating && setImportModal(false)} title="Import LinkedIn Profile">
        <div className={styles.importForm}>
          <p className={styles.importHint}>
            Paste a LinkedIn profile URL. The server will scrape the page and Gemini AI will generate 10 cards.
          </p>
          <input
            className={styles.input}
            placeholder="https://www.linkedin.com/in/username"
            value={profileInput}
            onChange={e => setProfileInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !isGenerating && handleGenerate()}
            disabled={isGenerating}
            autoFocus
          />
          {generateError && <p className={styles.error}>⚠ {generateError}</p>}
          <Button variant="primary" disabled={isGenerating || !profileInput.trim()} onClick={handleGenerate}>
            {isGenerating ? 'Generating...' : 'Generate Deck'}
          </Button>
          {isGenerating && (
            <p className={styles.generating}>✨ Scraping LinkedIn &amp; generating cards with Gemini AI...</p>
          )}
        </div>
      </Modal>

      {/* ── Deck Picker Modal ── */}
      <Modal
        open={deckPickerOpen}
        onClose={() => setDeckPickerOpen(false)}
        title={`Select deck for Player ${selectingFor}`}
      >
        <div className={styles.pickerList}>
          {savedDecks.length === 0 ? (
            <p className={styles.importHint}>No decks in library. Import one first.</p>
          ) : (
            savedDecks.map((deck, i) => (
              <div key={i} className={styles.pickerRow} onClick={() => handlePickDeck(deck)}>
                <Avatar name={deck.ownerName} size={36} imageUrl={deck.profileMeta?.profilePictureUrl} />
                <div className={styles.deckInfo}>
                  <span className={styles.deckName}>{deck.ownerName}</span>
                  <span className={styles.deckMeta}>{deck.cards?.length ?? 0} cards · {deck.passive?.name ?? ''}</span>
                </div>
                {(player1Deck === deck || player2Deck === deck) && (
                  <span className={styles.inUsePill}>In use</span>
                )}
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* ── Delete confirm ── */}
      <Modal open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Delete deck?">
        <div className={styles.importForm}>
          <p className={styles.importHint}>
            This will remove <strong>{savedDecks[confirmDelete]?.ownerName}</strong>'s deck from the library.
          </p>
          <div className={styles.secondaryActions}>
            <Button variant="danger" onClick={() => { deleteSavedDeck(confirmDelete); setConfirmDelete(null) }}>Delete</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function PlayerSlot({ num, deck, onPick, onClear }) {
  return (
    <div className={`${styles.slot} ${deck ? styles.slotFilled : ''}`}>
      <div className={styles.slotLabel}>Player {num}</div>
      {deck ? (
        <div className={styles.slotDeck}>
          <Avatar name={deck.ownerName} size={44} imageUrl={deck.profileMeta?.profilePictureUrl} />
          <div className={styles.slotDeckInfo}>
            <span className={styles.slotName}>{deck.ownerName}</span>
            <span className={styles.slotMeta}>{deck.cards?.length ?? 0} cards · {deck.passive?.name ?? ''}</span>
          </div>
          <button className={styles.slotClear} onClick={onClear} title="Remove">✕</button>
        </div>
      ) : (
        <button className={styles.slotEmpty} onClick={onPick}>
          <span className={styles.slotPlus}>+</span>
          <span>Select Deck</span>
        </button>
      )}
    </div>
  )
}
