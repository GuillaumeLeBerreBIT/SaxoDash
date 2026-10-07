import fs from 'node:fs'
import { ROUTES, formatRow, measureOverflow, parseArgs } from '../src/lib/mobileOverflow.js'

const SETTLE_MS = 1800

const args = parseArgs(process.argv.slice(2))
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
const browser = await playwright.chromium.launch()
const context = await browser.newContext({ viewport: { width: args.width, height: 844 } })
const page = await context.newPage()

await page.goto(args.base + '/')
await page.evaluate(([access, refresh, username]) => {
  localStorage.setItem('access', access)
  localStorage.setItem('refresh', refresh)
  localStorage.setItem('username', username)
}, [auth.a, auth.r, auth.u])

const rows = []
const record = async (label) => {
  await page.waitForTimeout(SETTLE_MS)
  const { over, offenders } = await page.evaluate(measureOverflow)
  rows.push({ over })
  console.log(formatRow(label, over, offenders))
}

const visit = async (route) => {
  await page.goto(args.base + route)
  await record(route)
}

const routes = [...ROUTES, `/accounts/${args.accountId}`, `/investors/${args.investorSlug}`]
for (const route of routes) await visit(route)

for (const tab of ['Risk', 'Projection']) {
  await page.goto(args.base + '/analytics')
  await page.getByRole('button', { name: tab, exact: true }).click()
  await record(`/analytics [${tab}]`)
}

await browser.close()
process.exit(rows.some((row) => row.over > 0) ? 1 : 0)
