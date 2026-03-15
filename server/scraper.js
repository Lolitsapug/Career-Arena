import puppeteer from 'puppeteer'
import os from 'os'
import path from 'path'
import fs from 'fs'

const CHROME_EXECUTABLE = process.env.CHROME_PATH
  || (os.platform() === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/chromium-browser')
const SESSION_DIR = path.join(os.tmpdir(), 'career-arena-session')
const HEADLESS_MODE = os.platform() !== 'win32' || String(process.env.SCRAPER_HEADLESS || '').toLowerCase() === 'true'

let _browser = null
let _loggedIn = false

function clearLocks() {
  for (const f of [path.join(SESSION_DIR, 'Default', 'LOCK'), path.join(SESSION_DIR, 'SingletonLock')]) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch {}
  }
}

async function getBrowser() {
  if (_browser) {
    try { await _browser.pages(); return _browser } catch { _browser = null; _loggedIn = false }
  }
  fs.mkdirSync(SESSION_DIR, { recursive: true })
  clearLocks()
  _browser = await puppeteer.launch({
    headless: HEADLESS_MODE ? 'new' : false,
    executablePath: CHROME_EXECUTABLE,
    userDataDir: SESSION_DIR,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--window-size=1100,800'],
  })
  _browser.on('disconnected', () => { _browser = null; _loggedIn = false })
  return _browser
}

async function ensureLoggedIn(page) {
  if (_loggedIn) return

  // Navigate to login — if already logged in LinkedIn redirects to /feed automatically
  console.log('[scraper] Checking login status...')
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 })

  // Wait up to 8s for the redirect to /feed to settle
  await waitForUrl(page, url => !url.includes('/login'), 8000).catch(() => {})

  const url = page.url()
  console.log('[scraper] After login check, URL:', url)

  if (url.includes('/feed') || url.includes('/in/') || url.includes('linkedin.com/home')) {
    console.log('[scraper] Already logged in.')
    _loggedIn = true
    return
  }

  // Still on login page — type credentials
  const email    = process.env.LINKEDIN_EMAIL
  const password = process.env.LINKEDIN_PASSWORD
  if (!email || !password) throw new Error('Set LINKEDIN_EMAIL and LINKEDIN_PASSWORD in .env')

  console.log('[scraper] Entering credentials...')
  await page.waitForSelector('#username', { timeout: 10000 })
  await page.type('#username', email, { delay: 0 })
  await page.type('#password', password, { delay: 0 })
  await page.click('[type="submit"]')

  // Wait for navigation away from login
  await waitForUrl(page, url => !url.includes('/login'), 20000).catch(() => {})
  const afterUrl = page.url()
  console.log('[scraper] After credential login, URL:', afterUrl)

  if (afterUrl.includes('/feed') || afterUrl.includes('linkedin.com/home')) {
    console.log('[scraper] Logged in successfully.')
    _loggedIn = true
    return
  }

  if (afterUrl.includes('checkpoint') || afterUrl.includes('challenge') || afterUrl.includes('verify')) {
    console.log('[scraper] ⚠️  Verification needed. Complete it in the browser window, then press ENTER in this terminal...')
    await waitForEnter()
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    if (page.url().includes('/feed')) {
      _loggedIn = true
      console.log('[scraper] Verified and logged in.')
    } else {
      throw new Error('Still not logged in after verification.')
    }
    return
  }

  throw new Error(`Unexpected page after login attempt: ${afterUrl}`)
}

// Poll page.url() until predicate is true or timeout
function waitForUrl(page, predicate, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const interval = setInterval(() => {
      const url = page.url()
      if (predicate(url)) {
        clearInterval(interval)
        resolve(url)
      } else if (Date.now() - start > timeout) {
        clearInterval(interval)
        reject(new Error('waitForUrl timed out, current URL: ' + url))
      }
    }, 200)
  })
}

function waitForEnter() {
  return new Promise(resolve => {
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    process.stdin.once('data', () => { process.stdin.pause(); resolve() })
  })
}

export async function scrapeLinkedIn(profileUrl) {
  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')

    await page.setRequestInterception(true)
    page.on('request', req => {
      const type = req.resourceType()
      // Allow LinkedIn's media CDN so profile picture src attributes get set by their lazy-loader
      if (type === 'image' && req.url().includes('media.licdn.com')) {
        req.continue()
      } else if (type === 'image' || type === 'stylesheet' || type === 'font' || type === 'media') {
        req.abort()
      } else {
        req.continue()
      }
    })

    await ensureLoggedIn(page)

    console.log(`[scraper] Loading profile: ${profileUrl}`)

    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // Scroll to trigger lazy sections, waiting for key selectors instead of fixed delays
    await page.waitForSelector('h1', { timeout: 15000 })
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2))
    await page.waitForSelector('#experience', { timeout: 8000 }).catch(() => {})
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForSelector('#skills', { timeout: 8000 }).catch(() => {})

    const profileData = await page.evaluate(() => {
      const getText = sel => { const el = document.querySelector(sel); return el ? el.innerText.trim() : '' }
      const getAll  = sel => [...document.querySelectorAll(sel)].map(el => el.innerText.trim()).filter(Boolean)
      const getAttr = (sel, attr) => { const el = document.querySelector(sel); return el ? el.getAttribute(attr) : null }
      return {
        name:       getText('h1'),
        headline:   getText('.text-body-medium.break-words'),
        location:   getText('.text-body-small.inline.t-black--light.break-words'),
        about:      getText('#about ~ div .full-width'),
        experience: getAll('#experience ~ div .pvs-list__item--line-separated'),
        education:  getAll('#education ~ div .pvs-list__item--line-separated'),
        skills:     getAll('#skills ~ div .pvs-list__item--line-separated'),
        profilePictureUrl: getAttr('img.pv-top-card-profile-picture__image', 'src') || getAttr('img.pv-top-card-profile-picture__image', 'data-delayed-url') || getAttr('.presence-entity__image', 'src') || getAttr('.presence-entity__image', 'data-delayed-url') || (getText('h1') ? getAttr(`img[alt="${getText('h1')}"]`, 'src') : null) || getAttr('img[alt="Profile picture"]', 'src'),
        rawText:    document.body.innerText.slice(0, 2000),
      }
    })

    // Download profile picture locally so the browser can display it
    if (profileData.profilePictureUrl) {
      try {
        const imgResponse = await page.goto(profileData.profilePictureUrl)
        const imgBuffer = await imgResponse.buffer()
        const imgId = `profile_${Date.now()}.jpg`
        const imgDir = path.join(os.tmpdir(), 'career-arena-images')
        fs.mkdirSync(imgDir, { recursive: true })
        const imgPath = path.join(imgDir, imgId)
        fs.writeFileSync(imgPath, imgBuffer)
        profileData.profilePictureUrl = `/api/images/${imgId}`
        console.log('[scraper] Saved profile picture:', imgPath)
      } catch (e) {
        console.log('[scraper] Could not download profile picture:', e.message)
      }
    }

    console.log('[scraper] Scraped name:', profileData.name || '(not found)')
    return JSON.stringify(profileData)
  } finally {
    await page.close()
  }
}
