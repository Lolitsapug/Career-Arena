import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { scrapeLinkedIn } from './scraper.js'
import { generateDeckFromProfile } from './gemini.js'

const app = express()
app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

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

// Health check
app.get('/api/health', (_, res) => res.json({ ok: true }))

const PORT = 3001
app.listen(PORT, () => console.log(`[server] Career Arena API running on http://localhost:${PORT}`))
