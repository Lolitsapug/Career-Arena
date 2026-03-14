// Server-side game orchestration — runs the engine as source of truth

import {
  startTurn, playCard, selectMinion, attackTarget, getValidTargets,
  resolveSpellTarget, getSpellTargets, forfeitGame,
  resolveBattlecryTarget, endTurn,
} from '../src/gameEngine.js';

import { buildPlayerFromSavedDeck } from '../src/utils/deckHelpers.js';

import {
  getRoom, getPlayerIndex, setPlayerDeck, setPlayerReady,
  bothReady, createRoom, joinRoom, removePlayer, getRoomBySocket,
  cleanupStaleRooms,
} from './roomManager.js';

// Filter state so each player only sees their own hand/deck details
function filterStateForPlayer(state, playerIdx) {
  if (!state) return null;
  const filtered = JSON.parse(JSON.stringify(state));
  const oppIdx = 1 - playerIdx;

  // Hide opponent's hand contents — just send count
  filtered.players[oppIdx].hand = filtered.players[oppIdx].hand.map(() => ({ hidden: true }));
  // Hide opponent's deck contents — just send count
  const deckCount = filtered.players[oppIdx].deck.length;
  filtered.players[oppIdx].deck = new Array(deckCount).fill({ hidden: true });
  // Hide opponent's discard details
  filtered.players[oppIdx].discard = [];

  // Include the player's own index so the client knows which side they are
  filtered.myIndex = playerIdx;
  return filtered;
}

function broadcastState(io, room) {
  for (let i = 0; i < room.players.length; i++) {
    const filtered = filterStateForPlayer(room.gameState, i);
    io.to(room.players[i].socketId).emit('state-update', filtered);
  }
}

function broadcastLobby(io, room) {
  const lobbyData = {
    code: room.code,
    players: room.players.map((p, i) => ({
      index: i,
      hasDeck: !!p.deck,
      ready: p.ready,
      deckName: p.deck?.ownerName || null,
    })),
  };
  for (const p of room.players) {
    io.to(p.socketId).emit('lobby-update', lobbyData);
  }
}

export function initGameSocket(io) {
  // Periodic cleanup
  setInterval(() => cleanupStaleRooms(), 5 * 60 * 1000);

  io.on('connection', (socket) => {
    console.log(`[WS] Connected: ${socket.id}`);

    // ── Lobby events ──────────────────────────────────────────────

    socket.on('create-room', () => {
      const room = createRoom(socket.id);
      socket.join(room.code);
      socket.emit('room-created', { code: room.code });
      broadcastLobby(io, room);
    });

    socket.on('join-room', ({ code }) => {
      const result = joinRoom(code.toUpperCase(), socket.id);
      if (result.error) {
        socket.emit('error-msg', { message: result.error });
        return;
      }
      socket.join(code);
      broadcastLobby(io, result.room);
    });

    socket.on('select-deck', ({ code, deck }) => {
      const room = setPlayerDeck(code, socket.id, deck);
      if (room) broadcastLobby(io, room);
    });

    socket.on('player-ready', ({ code }) => {
      const room = setPlayerReady(code, socket.id);
      if (!room) return;
      broadcastLobby(io, room);

      if (bothReady(room)) {
        // Build the game state from both decks
        const p1 = buildPlayerFromSavedDeck(room.players[0].deck, 3);
        const p2 = buildPlayerFromSavedDeck(room.players[1].deck, 4);
        let state = {
          phase: 'play', currentPlayer: 0, turn: 1, winner: null, log: [],
          selectedMinion: null, pendingSpell: null, pendingBattlecryTarget: null,
          players: [p1, p2],
        };
        // Start the first turn
        state = startTurn(state);
        room.gameState = state;

        // Notify both players the game has started
        for (let i = 0; i < 2; i++) {
          io.to(room.players[i].socketId).emit('game-start', filterStateForPlayer(state, i));
        }
      }
    });

    // ── Game action events ────────────────────────────────────────

    socket.on('game-action', ({ code, action, payload }) => {
      const room = getRoom(code);
      if (!room || !room.gameState) return;

      const playerIdx = getPlayerIndex(room, socket.id);
      if (playerIdx === -1) return;

      let state = room.gameState;

      // Only the current player can take most actions
      const isMyTurn = state.currentPlayer === playerIdx;

      switch (action) {
        case 'play-card': {
          if (!isMyTurn || state.phase !== 'play') return;
          const { state: ns } = playCard(state, payload.cardIndex);
          state = ns;
          break;
        }

        case 'resolve-spell': {
          if (!isMyTurn || !state.pendingSpell) return;
          state = resolveSpellTarget(state, payload.targetType, payload.targetIdx);
          break;
        }

        case 'cancel-spell': {
          if (!isMyTurn || !state.pendingSpell) return;
          state = { ...state, pendingSpell: null };
          break;
        }

        case 'resolve-battlecry': {
          if (!isMyTurn || !state.pendingBattlecryTarget) return;
          state = resolveBattlecryTarget(state, payload.targetIdx);
          break;
        }

        case 'skip-battlecry': {
          if (!isMyTurn || !state.pendingBattlecryTarget) return;
          state = { ...state, pendingBattlecryTarget: null };
          break;
        }

        case 'select-minion': {
          if (!isMyTurn) return;
          state = selectMinion(state, playerIdx, payload.boardIdx);
          break;
        }

        case 'attack': {
          if (!isMyTurn || !state.selectedMinion) return;
          state = attackTarget(state, payload.targetType, payload.targetIdx);
          break;
        }

        case 'end-turn': {
          if (!isMyTurn || state.pendingSpell || state.pendingBattlecryTarget) return;
          state = endTurn(state);
          // In online mode, immediately start the next turn (no transition screen)
          state = startTurn(state);
          break;
        }

        case 'forfeit': {
          if (playerIdx === -1) return;
          // Override currentPlayer temporarily so forfeitGame forfeits the right player
          const saved = state.currentPlayer;
          state.currentPlayer = playerIdx;
          state = forfeitGame(state);
          if (state.phase !== 'gameover') state.currentPlayer = saved;
          break;
        }

        default:
          return;
      }

      room.gameState = state;
      broadcastState(io, room);
    });

    // ── Disconnect ────────────────────────────────────────────────

    socket.on('disconnect', () => {
      console.log(`[WS] Disconnected: ${socket.id}`);
      const room = getRoomBySocket(socket.id);
      if (!room) return;

      if (room.gameState && room.gameState.phase !== 'gameover') {
        // Mid-game disconnect — opponent wins by forfeit
        const pi = getPlayerIndex(room, socket.id);
        if (pi !== -1) {
          const saved = room.gameState.currentPlayer;
          room.gameState.currentPlayer = pi;
          room.gameState = forfeitGame(room.gameState);
          room.gameState.disconnected = true;
          // Notify remaining player
          const oppIdx = 1 - pi;
          if (room.players[oppIdx]) {
            io.to(room.players[oppIdx].socketId).emit('state-update',
              filterStateForPlayer(room.gameState, oppIdx));
            io.to(room.players[oppIdx].socketId).emit('opponent-disconnected');
          }
        }
      }

      const result = removePlayer(socket.id);
      if (result && !result.deleted) {
        broadcastLobby(io, result.room);
      }
    });
  });
}
