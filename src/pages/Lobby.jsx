import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useDeckStore } from '../store/deckStore';
import BgParticles from '../components/BgParticles';
import styles from './Lobby.module.css';

export default function Lobby() {
  const navigate = useNavigate();
  const { connected, emit, on } = useSocket();
  const { savedDecks } = useDeckStore();

  const [mode, setMode] = useState(null); // null | 'create' | 'join'
  const [roomCode, setRoomCode] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [lobby, setLobby] = useState(null); // lobby-update data
  const [selectedDeckIdx, setSelectedDeckIdx] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  // Listen for server events
  useEffect(() => {
    const unsubs = [
      on('room-created', ({ code }) => {
        setRoomCode(code);
      }),
      on('lobby-update', (data) => {
        setLobby(data);
        setRoomCode(data.code);
      }),
      on('game-start', (initialState) => {
        navigate('/game', { state: { online: true, roomCode: roomCode || lobby?.code, initialState } });
      }),
      on('error-msg', ({ message }) => {
        setError(message);
        setTimeout(() => setError(null), 3000);
      }),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [on, navigate, roomCode, lobby?.code]);

  const handleCreate = useCallback(() => {
    setMode('create');
    emit('create-room');
  }, [emit]);

  const handleJoin = useCallback(() => {
    if (!joinInput.trim()) return;
    setMode('join');
    emit('join-room', { code: joinInput.trim().toUpperCase() });
  }, [emit, joinInput]);

  const handleSelectDeck = useCallback((idx) => {
    setSelectedDeckIdx(idx);
    const code = roomCode || lobby?.code;
    if (code && savedDecks[idx]) {
      emit('select-deck', { code, deck: savedDecks[idx] });
    }
  }, [emit, roomCode, lobby?.code, savedDecks]);

  const handleReady = useCallback(() => {
    const code = roomCode || lobby?.code;
    if (!code || selectedDeckIdx == null) return;
    setIsReady(true);
    emit('player-ready', { code });
  }, [emit, roomCode, lobby?.code, selectedDeckIdx]);

  // Determine my player index from lobby data
  const myPlayerIdx = lobby?.players?.findIndex(p => p.hasDeck || !p.hasDeck) ?? -1;

  if (!connected) {
    return (
      <div className={styles.page}>
        <BgParticles />
        <div className={styles.center}>
          <div className={styles.spinner} />
          <p>Connecting to server...</p>
        </div>
      </div>
    );
  }

  // Step 1: Choose create or join
  if (!mode) {
    return (
      <div className={styles.page}>
        <BgParticles />
        <div className={styles.center}>
          <h1 className={styles.title}>Online Play</h1>
          <p className={styles.subtitle}>Play against a friend over the internet</p>

          <div className={styles.modeButtons}>
            <button className={styles.bigBtn} onClick={handleCreate}>
              Create Room
            </button>
            <div className={styles.joinRow}>
              <input
                className={styles.codeInput}
                placeholder="Room code"
                value={joinInput}
                onChange={e => setJoinInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                maxLength={5}
              />
              <button className={styles.bigBtn} onClick={handleJoin}>
                Join
              </button>
            </div>
          </div>

          <button className={styles.backBtn} onClick={() => navigate('/')}>
            ← Back
          </button>

          {error && <div className={styles.error}>{error}</div>}
        </div>
      </div>
    );
  }

  // Step 2: In a room — show lobby
  const code = roomCode || lobby?.code || '...';
  const players = lobby?.players || [];
  const opponent = players.length === 2;

  return (
    <div className={styles.page}>
      <BgParticles />
      <div className={styles.lobbyCard}>
        <div className={styles.codeDisplay}>
          <span className={styles.codeLabel}>ROOM CODE</span>
          <span className={styles.codeValue}>{code}</span>
          <button className={styles.copyBtn} onClick={() => navigator.clipboard?.writeText(code)}>
            Copy
          </button>
        </div>

        <div className={styles.playersSection}>
          <h3 className={styles.sectionTitle}>Players</h3>
          <div className={styles.playerSlots}>
            {[0, 1].map(i => {
              const p = players[i];
              return (
                <div key={i} className={`${styles.playerSlot} ${p ? styles.filled : ''}`}>
                  <span className={styles.slotLabel}>Player {i + 1}</span>
                  {p ? (
                    <div className={styles.slotInfo}>
                      <span className={styles.deckName}>{p.deckName || 'Selecting deck...'}</span>
                      {p.ready && <span className={styles.readyBadge}>READY</span>}
                    </div>
                  ) : (
                    <span className={styles.waitingText}>Waiting for player...</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.deckSection}>
          <h3 className={styles.sectionTitle}>Select Your Deck</h3>
          {savedDecks.length === 0 ? (
            <p className={styles.noDeck}>No decks found. Go back and import a LinkedIn profile first.</p>
          ) : (
            <div className={styles.deckGrid}>
              {savedDecks.map((deck, i) => (
                <button
                  key={i}
                  className={`${styles.deckOption} ${selectedDeckIdx === i ? styles.deckSelected : ''}`}
                  onClick={() => !isReady && handleSelectDeck(i)}
                  disabled={isReady}
                >
                  <span className={styles.deckOwner}>{deck.ownerName}</span>
                  <span className={styles.deckCount}>{deck.cards?.length || 0} cards</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.actions}>
          {!isReady ? (
            <button
              className={styles.readyBtn}
              disabled={selectedDeckIdx == null || !opponent}
              onClick={handleReady}
            >
              {!opponent ? 'Waiting for opponent...' : selectedDeckIdx == null ? 'Select a deck first' : 'Ready Up'}
            </button>
          ) : (
            <div className={styles.waitingReady}>
              Waiting for opponent to ready up...
            </div>
          )}
        </div>

        <button className={styles.leaveBtn} onClick={() => navigate('/')}>
          Leave Room
        </button>

        {error && <div className={styles.error}>{error}</div>}
      </div>
    </div>
  );
}
