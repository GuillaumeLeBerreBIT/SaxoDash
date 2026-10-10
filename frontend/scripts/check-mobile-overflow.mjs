import fs from 'node:fs'
import {
  ROUTES,
  describeGateBlindness,
  describeLoadFailure,
  formatGateBlind,
  formatLoadFailure,
  formatRow,
  measureOverflow,
  parseArgs,
} from '../src/lib/mobileOverflow.js'

const SETTLE_MS = 800
const NETWORK_IDLE_MS = 5000

let args
try {
  args = parseArgs(process.argv.slice(2))
} catch (error) {
  console.error(error.message)
  process.exit(2)
}
if (!args.auth) {
  console.error('usage: node check-mobile-overflow.mjs --base <url> --auth <auth.json> [--width 390] [--account-id 1] [--investor-slug berkshire-hathaway]')
  process.exit(2)
}

let playwright
try {
  playwright = await import('playwright')
} catch {
  console.error('playwright is not installed in this project.')
  console.error('Run this script from an existing install: find ~/.npm/_npx -maxdepth 3 -iname playwright -type d')
  console.error('then copy the script and ../src/lib/mobileOverflow.js next to that node_modules, or install playwright there.')
  process.exit(2)
}

const auth = JSON.parse(fs.readFileSync(args.auth, 'utf8'))
let failed = false

const settle = async (page) => {
  await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_MS }).catch(() => {})
  await page.waitForTimeout(SETTLE_MS)
}

const measure = async (page, label, expectedPath) => {
  await settle(page)
  const hasMain = (await page.locator('main').count()) > 0
  const loadFailure = describeLoadFailure(expectedPath, new URL(page.url()).pathname, hasMain)
  if (loadFailure) {
    failed = true
    console.log(formatLoadFailure(label, loadFailure))
    return
  }
  const { over, offenders, htmlOverflowX, bodyOverflowX } = await page.evaluate(measureOverflow)
  const blind = describeGateBlindness(htmlOverflowX, bodyOverflowX)
  if (blind) {
    failed = true
    console.log(formatGateBlind(label, `${blind} - sideways scroll is hidden, so the width check proves nothing`))
    return
  }
  if (over > 0) failed = true
  console.log(formatRow(label, over, offenders))
}

const attempt = async (label, step) => {
  try {
    await step()
  } catch (error) {
    failed = true
    const reason = String(error.message).split('\n')[0]
    console.log(formatLoadFailure(label, `error: ${reason}`))
  }
}

const browser = await playwright.chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: args.width, height: 844 } })
  const page = await context.newPage()

  await page.goto(args.base + '/')
  await page.evaluate(([access, refresh, username]) => {
    localStorage.setItem('access', access)
    localStorage.setItem('refresh', refresh)
    localStorage.setItem('username', username)
  }, [auth.a, auth.r, auth.u])

  const routes = [...ROUTES, `/accounts/${args.accountId}`, `/investors/${args.investorSlug}`]
  for (const route of routes) {
    await attempt(route, async () => {
      await page.goto(args.base + route)
      await measure(page, route, route)
    })
  }

  for (const tab of ['Risk', 'Projection']) {
    const label = `/analytics [${tab}]`
    await attempt(label, async () => {
      await page.goto(args.base + '/analytics')
      const asTab = page.getByRole('tab', { name: tab, exact: true })
      const target = (await asTab.count()) > 0 ? asTab : page.getByRole('button', { name: tab, exact: true })
      await target.click({ timeout: 5000 })
      await measure(page, label, '/analytics')
    })
  }
} catch (error) {
  failed = true
  console.error(String(error.message).split('\n')[0])
} finally {
  await browser.close()
}

process.exit(failed ? 1 : 0)
