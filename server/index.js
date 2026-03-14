import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { scrapeLinkedIn } from './scraper.js'
import { generateDeckFromProfile } from './gemini.js'
import { initGameSocket } from './gameLoop.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isProduction = process.env.NODE_ENV === 'production'

const app = express()
const server = createServer(app)

// CORS — allow both dev and production origins
const corsOrigins = [
  'http://localhost:5173',
  'http://localhost:3001',
]
if (process.env.CORS_ORIGIN) corsOrigins.push(process.env.CORS_ORIGIN)

app.use(cors({ origin: corsOrigins }))
app.use(express.json())

// Socket.io server
const io = new Server(server, {
  cors: { origin: corsOrigins, methods: ['GET', 'POST'] },
})

// Initialize multiplayer game socket handlers
initGameSocket(io)

// ── REST API endpoints (unchanged) ───────────────────────────────────────────

app.post('/api/generate-deck', async (req, res) => {
  const { profileUrl } = req.body
  if (!profileUrl) return res.status(400).json({ error: 'profileUrl is required' })

  try {
    console.log(`[server] Scraping ${profileUrl}...`)
    const profileText = await scrapeLinkedIn(profileUrl)

    console.log('[server] Sending to Gemini...')
    const deck = await generateDeckFromProfile(profileText, profileUrl)

    res.json(deck)
  } catch (err) {
    console.error('[server] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/health', (_, res) => res.json({ ok: true }))

// ── Production: serve Vite build output ──────────────────────────────────────

if (isProduction) {
  const distPath = join(__dirname, '..', 'dist')
  app.use(express.static(distPath))
  // SPA fallback — all non-API routes serve index.html
  app.get('/{*splat}', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' })
    res.sendFile(join(distPath, 'index.html'))
  })
}

const PORT = process.env.PORT || 3001
server.listen(PORT, () => console.log(`[server] Career Arena running on http://localhost:${PORT}${isProduction ? ' (production)' : ''}`))
