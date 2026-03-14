import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

// In production the API is same-origin; in dev it's the Express server on 3001
const SERVER_URL = import.meta.env.VITE_SERVER_URL || (
  import.meta.env.PROD ? '' : 'http://localhost:3001'
);

let sharedSocket = null;

function getSocket() {
  if (!sharedSocket || sharedSocket.disconnected) {
    sharedSocket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }
  return sharedSocket;
}

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    function onConnect() { setConnected(true); }
    function onDisconnect() { setConnected(false); }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    if (socket.connected) setConnected(true);
    if (!socket.connected) socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback((event, handler) => {
    const socket = socketRef.current;
    if (!socket) return () => {};
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }, []);

  return { socket: socketRef.current, connected, emit, on };
}
