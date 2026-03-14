import { useState } from 'react';
import SetupScreen from './SetupScreen.jsx';
import GameBoard from './GameBoard.jsx';
import { createInitialState } from './gameEngine.js';

export default function App() {
  const [gameState, setGameState] = useState(null);

  function handleStart(profile1, profile2) {
    setGameState(createInitialState(profile1, profile2));
  }

  function handleRestart() {
    setGameState(null);
  }

  if (!gameState) {
    return <SetupScreen onStart={handleStart} />;
  }

  return <GameBoard initialState={gameState} onRestart={handleRestart} />;
}
