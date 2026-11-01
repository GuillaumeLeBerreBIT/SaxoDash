export const COLS = 12
export const MIN_W = 2
export const MIN_H = 3
export const ROW_H = 64
export const NEW_BOARD_NAME = 'Untitled board'

const STORAGE_KEY = 'saxodash:boards'

export const PANEL_TYPES = {
  watchlist: { name: 'Watchlist', blurb: 'Your list with sparklines; drives linked panels', w: 3, h: 6 },
  chart: { name: 'Price chart', blurb: 'Follows the watchlist, or a fixed symbol', w: 6, h: 6 },
  heatmap: { name: 'Today heatmap', blurb: 'Your positions sized by value, coloured by move', w: 3, h: 6 },
  earnings: { name: 'Your earnings', blurb: 'Reports from holdings and watchlist', w: 4, h: 4 },
  news: { name: 'News', blurb: 'Company news for the followed symbol', w: 5, h: 5 },
  symbol: { name: 'Symbol stats', blurb: 'Returns and 52-week range of the followed symbol', w: 3, h: 5 },
  positions: { name: 'Positions', blurb: 'Compact table of what you own', w: 6, h: 5 },
  allocation: { name: 'Allocation', blurb: 'Weights against your cap', w: 3, h: 5 },
  shelf: { name: 'Discover shelf', blurb: 'Any lens from Discover, live with the scan', w: 6, h: 5 },
  funds: { name: 'Smart money', blurb: 'Fund share changes in your names', w: 4, h: 5 },
  performance: { name: 'Vs the US 500', blurb: 'Time-weighted return against the index', w: 4, h: 4 },
  networth: { name: 'Net worth', blurb: 'Headline number with today’s move', w: 3, h: 3 },
}

const SEMICONDUCTORS = ['NVDA', 'AMD', 'TSM', 'AVGO', 'ASML']

export function defaultBoards() {
  return [
    {
      id: 'morning',
      name: 'Morning check',
      sym: 'GOOGL',
      panels: [
        { id: 'p1', type: 'watchlist', x: 0, y: 0, w: 3, h: 6 },
        { id: 'p2', type: 'chart', x: 3, y: 0, w: 6, h: 6 },
        { id: 'p3', type: 'heatmap', x: 9, y: 0, w: 3, h: 6 },
        { id: 'p4', type: 'earnings', x: 0, y: 6, w: 4, h: 5 },
        { id: 'p5', type: 'news', x: 4, y: 6, w: 5, h: 5 },
        { id: 'p6', type: 'symbol', x: 9, y: 6, w: 3, h: 5 },
      ],
    },
    {
      id: 'semis',
      name: 'Semiconductors',
      sym: 'NVDA',
      panels: [
        { id: 'p1', type: 'chart', x: 0, y: 0, w: 8, h: 6 },
        { id: 'p2', type: 'watchlist', x: 8, y: 0, w: 4, h: 6, cfg: { list: [...SEMICONDUCTORS], title: 'Chips' } },
        { id: 'p3', type: 'shelf', x: 0, y: 6, w: 7, h: 5, cfg: { shelf: 'above-moving-averages' } },
        { id: 'p4', type: 'symbol', x: 7, y: 6, w: 5, h: 5 },
      ],
    },
  ]
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

const readingOrder = (a, b) => a.y - b.y || a.x - b.x

export function settle(panels, moved = null) {
  const copies = panels.map((p) => ({ ...p }))
  const anchor = moved ? copies.find((p) => p.id === moved.id) : null
  const placed = anchor ? [anchor] : []
  copies
    .filter((p) => p !== anchor)
    .sort(readingOrder)
    .forEach((p) => {
      while (placed.some((q) => overlaps(p, q))) p.y += 1
      placed.push(p)
    })
  const done = []
  ;[...copies].sort(readingOrder).forEach((p) => {
    while (p.y > 0 && !done.some((q) => overlaps({ ...p, y: p.y - 1 }, q))) p.y -= 1
    done.push(p)
  })
  return copies
}

function whole(value, fallback) {
  return Number.isFinite(value) ? Math.round(value) : fallback
}

function normalisePanel(raw) {
  if (!raw || typeof raw !== 'object') return null
  const type = PANEL_TYPES[raw.type]
  if (!type || typeof raw.id !== 'string' || !raw.id) return null
  const w = Math.min(COLS, Math.max(MIN_W, whole(raw.w, type.w)))
  const h = Math.max(MIN_H, whole(raw.h, type.h))
  const x = Math.min(COLS - w, Math.max(0, whole(raw.x, 0)))
  const y = Math.max(0, whole(raw.y, 0))
  const panel = { id: raw.id, type: raw.type, x, y, w, h }
  if (raw.cfg && typeof raw.cfg === 'object' && !Array.isArray(raw.cfg)) panel.cfg = { ...raw.cfg }
  return panel
}

export function normaliseBoard(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const seen = new Set()
  const panels = (Array.isArray(source.panels) ? source.panels : [])
    .map(normalisePanel)
    .filter((p) => {
      if (!p || seen.has(p.id)) return false
      seen.add(p.id)
      return true
    })
  return {
    id: source.id,
    name: source.name,
    sym: typeof source.sym === 'string' ? source.sym : '',
    panels: settle(panels),
  }
}

function withPanel(board, id, change) {
  const current = board.panels.find((p) => p.id === id)
  if (!current) return board
  const next = { ...current, ...change(current) }
  const panels = board.panels.map((p) => (p.id === id ? next : p))
  return { ...board, panels: settle(panels, next) }
}

export function moveTo(board, id, x, y) {
  return withPanel(board, id, (p) => ({
    x: Math.min(COLS - p.w, Math.max(0, whole(x, p.x))),
    y: Math.max(0, whole(y, p.y)),
  }))
}

export function resizeTo(board, id, w, h) {
  return withPanel(board, id, (p) => ({
    w: Math.min(COLS - p.x, Math.max(MIN_W, whole(w, p.w))),
    h: Math.max(MIN_H, whole(h, p.h)),
  }))
}

export function snapTarget(mode, panel, { dx, dy }, { colWidth, gap }) {
  const cols = whole(dx / (colWidth + gap), 0)
  const rows = whole(dy / (ROW_H + gap), 0)
  if (mode === 'resize') {
    return {
      ...panel,
      w: Math.max(MIN_W, Math.min(COLS - panel.x, panel.w + cols)),
      h: Math.max(MIN_H, panel.h + rows),
    }
  }
  return {
    ...panel,
    x: Math.max(0, Math.min(COLS - panel.w, panel.x + cols)),
    y: Math.max(0, panel.y + rows),
  }
}

function nextPanelId(panels) {
  const highest = panels.reduce((max, p) => {
    const n = /^p(\d+)$/.exec(p.id)
    return n ? Math.max(max, Number(n[1])) : max
  }, 0)
  return `p${highest + 1}`
}

export function addPanel(board, type) {
  const spec = PANEL_TYPES[type]
  if (!spec) return board
  const y = board.panels.reduce((max, p) => Math.max(max, p.y + p.h), 0)
  const panel = { id: nextPanelId(board.panels), type, x: 0, y, w: spec.w, h: spec.h }
  return { ...board, panels: settle([...board.panels, panel]) }
}

export function removePanel(board, id) {
  if (!board.panels.some((p) => p.id === id)) return board
  return { ...board, panels: settle(board.panels.filter((p) => p.id !== id)) }
}

export function followSymbol(board, sym) {
  return { ...board, sym }
}

export function createBoard(boards, sym = '') {
  const taken = new Set(boards.map((b) => b.id))
  let n = boards.length + 1
  while (taken.has(`board-${n}`)) n += 1
  return { id: `board-${n}`, name: NEW_BOARD_NAME, sym, panels: [] }
}

export function loadBoards() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (!Array.isArray(stored)) return defaultBoards()
    const seen = new Set()
    return stored
      .filter((b) => b && typeof b === 'object' && typeof b.id === 'string' && b.id && typeof b.name === 'string' && b.name)
      .filter((b) => {
        if (seen.has(b.id)) return false
        seen.add(b.id)
        return true
      })
      .map(normaliseBoard)
  } catch {
    return defaultBoards()
  }
}

export function saveBoards(boards) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boards))
    return true
  } catch {
    return false
  }
}
