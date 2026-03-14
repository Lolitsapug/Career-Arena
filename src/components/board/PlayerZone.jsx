import Card from '../card/Card'
import HeroPortrait from './HeroPortrait'
import ManaBar from './ManaBar'
import styles from './PlayerZone.module.css'
import { useGameStore } from '../../store/gameStore'

export default function PlayerZone({ player, side }) {
  const phase = useGameStore(s => s.phase)
  const selectedCard = useGameStore(s => s.selectedCard)
  const attackerCard = useGameStore(s => s.attackerCard)
  const selectCard = useGameStore(s => s.selectCard)
  const playCard = useGameStore(s => s.playCard)
  const selectAttacker = useGameStore(s => s.selectAttacker)
  const resolveAttack = useGameStore(s => s.resolveAttack)
  const attackHero = useGameStore(s => s.attackHero)
  const endTurn = useGameStore(s => s.endTurn)

  const myTurn = phase === `${player}Turn`
  const oppPlayer = player === 'player1' ? 'player2' : 'player1'
  const pState = useGameStore(s => s[player])
  const oppState = useGameStore(s => s[oppPlayer])

  const name = pState.profile?.name || (player === 'player1' ? 'Player 1' : 'Player 2')

  function handleHandCardClick(cardId) {
    if (!myTurn) return
    if (selectedCard?.cardId === cardId) {
      selectCard(null, null)
    } else {
      selectCard(player, cardId)
    }
  }

  function handleBattlefieldClick(cardId) {
    if (!myTurn) return
    // If we have an attacker selected (from our field), can't re-select own field
    if (attackerCard) {
      // clicking own field card — cancel attacker
      if (attackerCard.owner === player) {
        selectAttacker(null, null)
      }
      return
    }
    // If a hand card is selected, clicking own field does nothing
    if (selectedCard) return
    // Select as attacker
    selectAttacker(player, cardId)
  }

  function handleEnemyFieldClick(cardId) {
    if (!myTurn) return
    if (selectedCard && selectedCard.owner === player) {
      // play card then immediately attack? No — playing goes to field first
      return
    }
    if (attackerCard && attackerCard.owner === player) {
      resolveAttack(oppPlayer, cardId)
    }
  }

  function handleEnemyHeroClick() {
    if (!myTurn || !attackerCard) return
    attackHero(oppPlayer)
  }

  function handleFieldDrop() {
    if (!myTurn || !selectedCard) return
    playCard(player, selectedCard.cardId)
  }

  return (
    <div className={`${styles.zone} ${styles[side]} ${myTurn ? styles.active : ''}`}>
      {/* Header */}
      <div className={styles.header}>
        <HeroPortrait name={name} hp={pState.heroHp} isActive={myTurn} side={side} imageUrl={pState.profile?.profilePictureUrl} />
        <ManaBar current={pState.mana} max={pState.maxMana} />
        <div className={styles.deckCount}>
          <span className={styles.deckIcon}>🃏</span>
          <span>{pState.deck.length}</span>
        </div>
      </div>

      {/* Enemy hero attack target */}
      <div
        className={`${styles.enemyHeroTarget} ${attackerCard?.owner === player ? styles.targetable : ''}`}
        onClick={handleEnemyHeroClick}
      >
        <HeroPortrait
          name={oppState.profile?.name || (oppPlayer === 'player1' ? 'Player 1' : 'Player 2')}
          hp={oppState.heroHp}
          isActive={false}
          side={side === 'left' ? 'right' : 'left'}
          imageUrl={oppState.profile?.profilePictureUrl}
        />
        {attackerCard?.owner === player && (
          <span className={styles.targetHint}>Click to attack hero</span>
        )}
      </div>

      {/* Enemy battlefield */}
      <div className={styles.sectionLabel}>
        {oppPlayer === 'player1' ? 'Player 1' : 'Player 2'} Field
      </div>
      <div className={styles.battlefield}>
        {oppState.field.map(card => (
          <Card
            key={card.id}
            card={card}
            size="board"
            isEnemy
            onClick={() => handleEnemyFieldClick(card.id)}
          />
        ))}
        {oppState.field.length === 0 && (
          <div className={styles.emptyField}>No cards in play</div>
        )}
      </div>

      {/* Divider */}
      <div className={styles.divider} />

      {/* Own battlefield */}
      <div className={styles.sectionLabel}>Your Field</div>
      <div
        className={`${styles.battlefield} ${selectedCard ? styles.dropTarget : ''}`}
        onClick={selectedCard ? handleFieldDrop : undefined}
      >
        {pState.field.map(card => (
          <Card
            key={card.id}
            card={card}
            size="board"
            attacker={attackerCard?.cardId === card.id}
            onClick={() => handleBattlefieldClick(card.id)}
          />
        ))}
        {pState.field.length === 0 && (
          <div className={`${styles.emptyField} ${selectedCard ? styles.dropHint : ''}`}>
            {selectedCard ? '▶ Click to play card here' : 'No cards in play'}
          </div>
        )}
      </div>

      {/* Hand */}
      <div className={styles.sectionLabel}>Hand ({pState.hand.length})</div>
      <div className={styles.hand}>
        {pState.hand.map(card => (
          <Card
            key={card.id}
            card={card}
            size="hand"
            selected={selectedCard?.cardId === card.id}
            onClick={() => handleHandCardClick(card.id)}
          />
        ))}
      </div>

      {/* End turn */}
      <button
        className={`${styles.endTurn} ${myTurn ? styles.endTurnActive : ''}`}
        onClick={myTurn ? endTurn : undefined}
        disabled={!myTurn}
      >
        {myTurn ? 'End Turn' : 'Waiting...'}
      </button>
    </div>
  )
}
