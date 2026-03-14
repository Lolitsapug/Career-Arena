import { create } from 'zustand'
import { generateMockDeck, SAMPLE_PROFILE, SAMPLE_PROFILE_2 } from '../utils/cardFactory'

const API_BASE = 'http://localhost:3001'
const STORAGE_KEY = 'career-arena-decks'

function loadSavedDecks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function persistDecks(decks) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(decks)) } catch {}
}

async function fetchDeckFromServer(profileUrl) {
  const res = await fetch(`${API_BASE}/api/generate-deck`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileUrl }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Server error' }))
    throw new Error(err.error || `Server returned ${res.status}`)
  }
  return res.json()
}

async function isServerAvailable() {
  try {
    const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch { return false }
}

export const useDeckStore = create((set, get) => ({
  // Saved deck library — persisted to localStorage
  savedDecks: loadSavedDecks(),

  // Currently selected decks for each player slot
  player1Deck: null,
  player2Deck: null,

  isGenerating: false,
  generateError: null,

  // Generate a new deck from LinkedIn and save it to the library
  generateDeck: async (profileUrl) => {
    set({ isGenerating: true, generateError: null })
    try {
      let deck
      const serverUp = await isServerAvailable()

      if (serverUp && profileUrl.startsWith('http')) {
        deck = await fetchDeckFromServer(profileUrl)
      } else {
        if (!serverUp) console.warn('[deckStore] Backend not running — using mock deck')
        await new Promise(r => setTimeout(r, 1400))
        const mock = get().savedDecks.length === 0 ? SAMPLE_PROFILE : SAMPLE_PROFILE_2
        deck = generateMockDeck(mock)
      }

      // Add a timestamp so the library can sort/identify entries
      const entry = { ...deck, generatedAt: Date.now(), profileUrl: profileUrl || null }
      const updated = [entry, ...get().savedDecks]
      persistDecks(updated)
      set({ savedDecks: updated, isGenerating: false, generateError: null })
      return entry
    } catch (err) {
      set({ generateError: err.message, isGenerating: false })
      return null
    }
  },

  selectDeck: (playerNum, deck) => set({ [`player${playerNum}Deck`]: deck }),

  deleteSavedDeck: (index) => {
    const updated = get().savedDecks.filter((_, i) => i !== index)
    persistDecks(updated)
    set({ savedDecks: updated })
  },

  clearSlot: (playerNum) => set({ [`player${playerNum}Deck`]: null }),
}))
