// In-memory room management for multiplayer games

const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function createRoom(socketId) {
  let code;
  do { code = generateCode(); } while (rooms.has(code));

  const room = {
    code,
    players: [
      { socketId, deck: null, ready: false },
    ],
    gameState: null,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

export function joinRoom(code, socketId) {
  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };
  if (room.players.length >= 2) return { error: 'Room is full' };
  if (room.players[0].socketId === socketId) return { error: 'Cannot join your own room' };

  room.players.push({ socketId, deck: null, ready: false });
  return { room };
}

export function getRoom(code) {
  return rooms.get(code) || null;
}

export function getRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some(p => p.socketId === socketId)) return room;
  }
  return null;
}

export function getPlayerIndex(room, socketId) {
  return room.players.findIndex(p => p.socketId === socketId);
}

export function setPlayerDeck(code, socketId, deck) {
  const room = rooms.get(code);
  if (!room) return null;
  const player = room.players.find(p => p.socketId === socketId);
  if (player) player.deck = deck;
  return room;
}

export function setPlayerReady(code, socketId) {
  const room = rooms.get(code);
  if (!room) return null;
  const player = room.players.find(p => p.socketId === socketId);
  if (player) player.ready = true;
  return room;
}

export function bothReady(room) {
  return room.players.length === 2 &&
    room.players.every(p => p.ready && p.deck);
}

export function removePlayer(socketId) {
  for (const [code, room] of rooms.entries()) {
    const idx = room.players.findIndex(p => p.socketId === socketId);
    if (idx !== -1) {
      room.players.splice(idx, 1);
      if (room.players.length === 0) {
        rooms.delete(code);
      }
      return { room, removedIdx: idx, deleted: room.players.length === 0 };
    }
  }
  return null;
}

export function deleteRoom(code) {
  rooms.delete(code);
}

// Reconnect: swap the old socket ID for a new one
export function reconnectPlayer(code, oldSocketId, newSocketId) {
  const room = rooms.get(code);
  if (!room) return null;
  const player = room.players.find(p => p.socketId === oldSocketId);
  if (player) player.socketId = newSocketId;
  return room;
}

// Clean up stale rooms older than maxAge (ms)
export function cleanupStaleRooms(maxAge = 30 * 60 * 1000) {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (!room.gameState && now - room.createdAt > maxAge) {
      rooms.delete(code);
    }
  }
}
