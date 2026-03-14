import { create } from 'zustand'

const initialPlayer = {
  deck: [],
  hand: [],
  field: [],
  heroHp: 30,
  mana: 1,
  maxMana: 1,
}

export const useGameStore = create((set, get) => ({
  phase: 'idle', // 'idle' | 'player1Turn' | 'player2Turn' | 'gameOver'
  winner: null,
  player1: { ...initialPlayer },
  player2: { ...initialPlayer },
  selectedCard: null,   // { owner: 'player1'|'player2', cardId }
  attackerCard: null,   // { owner, cardId }

  startGame: (deck1, deck2) => {
    const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5)
    const p1deck = shuffle(deck1)
    const p2deck = shuffle(deck2)
    set({
      phase: 'player1Turn',
      winner: null,
      selectedCard: null,
      attackerCard: null,
      player1: { ...initialPlayer, deck: p1deck.slice(3), hand: p1deck.slice(0, 3), heroHp: 30, mana: 1, maxMana: 1 },
      player2: { ...initialPlayer, deck: p2deck.slice(3), hand: p2deck.slice(0, 3), heroHp: 30, mana: 1, maxMana: 1 },
    })
  },

  selectCard: (owner, cardId) => {
    const { selectedCard } = get()
    if (selectedCard?.cardId === cardId) {
      set({ selectedCard: null })
    } else {
      set({ selectedCard: { owner, cardId } })
    }
  },

  playCard: (player, cardId) => {
    const state = get()
    const p = state[player]
    const card = p.hand.find(c => c.id === cardId)
    if (!card || p.mana < card.cost) return
    set({
      [player]: {
        ...p,
        hand: p.hand.filter(c => c.id !== cardId),
        field: [...p.field, { ...card, currentHp: card.hp }],
        mana: p.mana - card.cost,
      },
      selectedCard: null,
    })
  },

  selectAttacker: (owner, cardId) => {
    set({ attackerCard: { owner, cardId } })
  },

  resolveAttack: (targetOwner, targetId) => {
    const state = get()
    const { attackerCard } = state
    if (!attackerCard) return

    const attacker = state[attackerCard.owner].field.find(c => c.id === attackerCard.cardId)
    if (!attacker) return

    const defender = state[targetOwner].field.find(c => c.id === targetId)
    if (!defender) return

    const newDefenderHp = defender.currentHp - attacker.attack
    const newAttackerHp = attacker.currentHp - defender.attack

    const updateField = (player, cardId, newHp) =>
      state[player].field
        .map(c => c.id === cardId ? { ...c, currentHp: newHp } : c)
        .filter(c => c.currentHp > 0)

    set({
      [attackerCard.owner]: {
        ...state[attackerCard.owner],
        field: updateField(attackerCard.owner, attackerCard.cardId, newAttackerHp),
      },
      [targetOwner]: {
        ...state[targetOwner],
        field: updateField(targetOwner, targetId, newDefenderHp),
      },
      attackerCard: null,
      selectedCard: null,
    })
  },

  attackHero: (targetPlayer) => {
    const state = get()
    const { attackerCard } = state
    if (!attackerCard) return

    const attacker = state[attackerCard.owner].field.find(c => c.id === attackerCard.cardId)
    if (!attacker) return

    const newHp = state[targetPlayer].heroHp - attacker.attack
    const winner = newHp <= 0 ? attackerCard.owner : null

    set({
      [targetPlayer]: { ...state[targetPlayer], heroHp: newHp },
      attackerCard: null,
      selectedCard: null,
      phase: winner ? 'gameOver' : state.phase,
      winner,
    })
  },

  endTurn: () => {
    const state = get()
    const next = state.phase === 'player1Turn' ? 'player2' : 'player1'
    const nextPhase = next === 'player1' ? 'player1Turn' : 'player2Turn'
    const p = state[next]
    const newMaxMana = Math.min(p.maxMana + 1, 10)
    const draw = p.deck.slice(0, 3)
    set({
      phase: nextPhase,
      [next]: {
        ...p,
        mana: newMaxMana,
        maxMana: newMaxMana,
        hand: [...p.hand, ...draw].slice(0, 10),
        deck: p.deck.slice(draw.length),
      },
      selectedCard: null,
      attackerCard: null,
    })
  },

  resetGame: () => set({ phase: 'idle', winner: null, player1: { ...initialPlayer }, player2: { ...initialPlayer } }),
}))
