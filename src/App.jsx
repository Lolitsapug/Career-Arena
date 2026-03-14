import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MainMenu from './pages/MainMenu'
import GameBoard from './pages/GameBoard'
import DeckViewer from './pages/DeckViewer'
import Leaderboard from './pages/Leaderboard'
import Lobby from './pages/Lobby'
import { ThemeProvider } from './theme'

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"            element={<MainMenu />} />
          <Route path="/game"        element={<GameBoard />} />
          <Route path="/deck"        element={<DeckViewer />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/lobby"       element={<Lobby />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
