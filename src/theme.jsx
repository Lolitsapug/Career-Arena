import { createContext, useContext, useEffect, useState } from 'react'

const THEME_STORAGE_KEY = 'career-arena-theme'

export const THEME_OPTIONS = [
  { id: 'arena', label: 'Arena' },
  { id: 'mono',  label: 'Mono' },
  { id: 'rune',  label: 'Rune' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'pixel', label: 'Pixel' },
]

const ThemeContext = createContext(null)

function getInitialTheme() {
  if (typeof window === 'undefined') return THEME_OPTIONS[0].id

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  return THEME_OPTIONS.some(option => option.id === storedTheme)
    ? storedTheme
    : THEME_OPTIONS[0].id
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEME_OPTIONS }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  return context
}
