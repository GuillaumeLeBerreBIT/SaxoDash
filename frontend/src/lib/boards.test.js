import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  COLS,
  MIN_H,
  MIN_W,
  PANEL_TYPES,
  ROW_H,
  addPanel,
  createBoard,
  defaultBoards,
  followSymbol,
  loadBoards,
  moveTo,
  normaliseBoard,
  removePanel,
  resizeTo,
  saveBoards,
  settle,
  snapTarget,
  stepVertically,
} from './boards'

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

function expectNoOverlap(panels) {
  for (let i = 0; i < panels.length; i += 1) {
    for (let j = i + 1; j < panels.length; j += 1) {
      expect(overlap(panels[i], panels[j]), `${panels[i].id} vs ${panels[j].id}`).toBe(false)
    }
  }
}

function expectInGrid(panels) {
  for (const p of panels) {
    expect(p.x).toBeGreaterThanOrEqual(0)
    expect(p.x + p.w).toBeLessThanOrEqual(COLS)
    expect(p.y).toBeGreaterThanOrEqual(0)
    expect(p.w).toBeGreaterThanOrEqual(MIN_W)
    expect(p.h).toBeGreaterThanOrEqual(MIN_H)
  }
}

function mulberry32(seed) {
  let a = seed
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const morning = () => defaultBoards().find((b) => b.id === 'morning')
const byId = (board, id) => board.panels.find((p) => p.id === id)

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('PANEL_TYPES', () => {
  it('lists the twelve panel types with a name, blurb and default size', () => {
    expect(Object.keys(PANEL_TYPES)).toEqual([
      'watchlist', 'chart', 'heatmap', 'earnings', 'news', 'symbol',
      'positions', 'allocation', 'shelf', 'funds', 'performance', 'networth',
    ])
    for (const t of Object.values(PANEL_TYPES)) {
      expect(typeof t.name).toBe('string')
      expect(typeof t.blurb).toBe('string')
      expect(t.w).toBeGreaterThanOrEqual(MIN_W)
      expect(t.h).toBeGreaterThanOrEqual(MIN_H)
    }
    expect(PANEL_TYPES.chart).toMatchObject({ name: 'Price chart', w: 6, h: 6 })
  })
})

describe('defaultBoards', () => {
  it('returns Morning check and Semiconductors with the prototype layouts', () => {
    const boards = defaultBoards()
    expect(boards.map((b) => [b.id, b.name, b.sym])).toEqual([
      ['morning', 'Morning check', 'GOOGL'],
      ['semis', 'Semiconductors', 'NVDA'],
    ])
    expect(byId(boards[0], 'p3')).toEqual({ id: 'p3', type: 'heatmap', x: 9, y: 0, w: 3, h: 6 })
    expect(byId(boards[1], 'p2').cfg).toEqual({ list: ['NVDA', 'AMD', 'TSM', 'AVGO', 'ASML'], title: 'Chips' })
    expect(byId(boards[1], 'p3').cfg).toEqual({ shelf: 'above-moving-averages' })
    boards.forEach((b) => {
      expectNoOverlap(b.panels)
      expectInGrid(b.panels)
    })
  })

  it('returns fresh objects each call', () => {
    expect(defaultBoards()).not.toBe(defaultBoards())
    expect(defaultBoards()[0].panels).not.toBe(defaultBoards()[0].panels)
  })
})

describe('settle', () => {
  it('pushes a dropped-on panel below and compacts', () => {
    const moved = moveTo(morning(), 'p3', 6, 5)
    expect(byId(moved, 'p2').y).toBeGreaterThanOrEqual(11)
    expectNoOverlap(moved.panels)
  })

  it('compacts panels upward into free space', () => {
    const panels = [
      { id: 'a', type: 'news', x: 0, y: 7, w: 4, h: 3 },
      { id: 'b', type: 'news', x: 4, y: 2, w: 4, h: 3 },
    ]
    const out = settle(panels)
    expect(out.map((p) => p.y)).toEqual([0, 0])
  })

  it('does not mutate its input', () => {
    const panels = morning().panels
    const frozen = JSON.stringify(panels)
    settle(panels, panels[2])
    expect(JSON.stringify(panels)).toBe(frozen)
  })

  it('keeps input order', () => {
    const panels = morning().panels
    expect(settle(panels).map((p) => p.id)).toEqual(panels.map((p) => p.id))
  })
})

describe('normaliseBoard', () => {
  it('drops unknown types and clamps width', () => {
    const board = normaliseBoard({
      id: 'x',
      name: 'X',
      sym: 'AAPL',
      panels: [
        { id: 'a', type: 'radar', x: 0, y: 0, w: 3, h: 3 },
        { id: 'b', type: 'news', x: 10, y: 0, w: 6, h: 4 },
      ],
    })
    expect(board.panels.map((p) => p.id)).toEqual(['b'])
    expect(board.panels[0]).toMatchObject({ x: 6, w: 6 })
  })

  it('enforces minimum size and caps width at the grid', () => {
    const board = normaliseBoard({
      id: 'x',
      name: 'X',
      panels: [{ id: 'a', type: 'news', x: 3, y: 0, w: 1, h: 1 }, { id: 'b', type: 'chart', x: 0, y: 9, w: 40, h: 4 }],
    })
    expect(byId(board, 'a')).toMatchObject({ w: MIN_W, h: MIN_H })
    expect(byId(board, 'b')).toMatchObject({ x: 0, w: COLS })
  })

  it('resolves overlaps by settling', () => {
    const board = normaliseBoard({
      id: 'x',
      name: 'X',
      panels: [
        { id: 'a', type: 'news', x: 0, y: 0, w: 4, h: 4 },
        { id: 'b', type: 'chart', x: 2, y: 1, w: 4, h: 4 },
      ],
    })
    expectNoOverlap(board.panels)
  })

  it('drops panels without an id and duplicate ids, and keeps cfg', () => {
    const board = normaliseBoard({
      id: 'x',
      name: 'X',
      panels: [
        { type: 'news', x: 0, y: 0, w: 3, h: 3 },
        { id: 'a', type: 'shelf', x: 0, y: 0, w: 3, h: 3, cfg: { shelf: 'oversold' } },
        { id: 'a', type: 'news', x: 6, y: 0, w: 3, h: 3 },
      ],
    })
    expect(board.panels).toHaveLength(1)
    expect(board.panels[0].cfg).toEqual({ shelf: 'oversold' })
  })

  it('tolerates missing or malformed panels and numbers', () => {
    expect(normaliseBoard({ id: 'x', name: 'X' }).panels).toEqual([])
    const board = normaliseBoard({ id: 'x', name: 'X', panels: [{ id: 'a', type: 'news', x: 'no', y: null }] })
    expect(board.panels[0]).toMatchObject({ x: 0, y: 0, w: PANEL_TYPES.news.w, h: PANEL_TYPES.news.h })
  })
})

describe('operations', () => {
  it('addPanel puts the panel under the lowest one at x=0 with the default size', () => {
    const board = morning()
    const lowest = Math.max(...board.panels.map((p) => p.y + p.h))
    const next = addPanel(board, 'positions')
    const added = next.panels.at(-1)
    expect(added).toMatchObject({ type: 'positions', x: 0, y: lowest, w: PANEL_TYPES.positions.w, h: PANEL_TYPES.positions.h })
    expect(new Set(next.panels.map((p) => p.id)).size).toBe(next.panels.length)
    expect(board.panels).toHaveLength(6)
  })

  it('addPanel ignores an unknown type and works on an empty board', () => {
    const board = morning()
    expect(addPanel(board, 'radar')).toBe(board)
    const empty = addPanel({ id: 'e', name: 'E', sym: 'X', panels: [] }, 'networth')
    expect(empty.panels[0]).toMatchObject({ x: 0, y: 0 })
  })

  it('removePanel drops the panel and compacts', () => {
    const next = removePanel(morning(), 'p2')
    expect(next.panels.find((p) => p.id === 'p2')).toBeUndefined()
    expect(byId(next, 'p5').y).toBe(0)
  })

  it('resizeTo clamps to the minimum and the grid edge', () => {
    const board = morning()
    expect(byId(resizeTo(board, 'p6', 1, 1), 'p6')).toMatchObject({ w: MIN_W, h: MIN_H })
    expect(byId(resizeTo(board, 'p6', 9, 5), 'p6')).toMatchObject({ x: 9, w: 3 })
  })

  it('moveTo clamps into the grid', () => {
    const next = moveTo(morning(), 'p1', 50, -4)
    expect(byId(next, 'p1').x).toBe(COLS - 3)
    expect(byId(next, 'p1').y).toBeGreaterThanOrEqual(0)
  })

  it('moveTo keeps the current position for a coordinate that is not a finite number', () => {
    const board = morning()
    const before = byId(board, 'p6')
    expect(byId(moveTo(board, 'p6', Number.NaN, Infinity), 'p6')).toMatchObject({ x: before.x, y: before.y })
    expect(byId(moveTo(board, 'p6', 'x', undefined), 'p6')).toMatchObject({ x: before.x, y: before.y })
  })

  it('resizeTo keeps the current size for a dimension that is not a finite number', () => {
    const board = morning()
    const before = byId(board, 'p6')
    expect(byId(resizeTo(board, 'p6', Number.NaN, -Infinity), 'p6')).toMatchObject({ w: before.w, h: before.h })
  })

  it('unknown ids return the board unchanged', () => {
    const board = morning()
    expect(moveTo(board, 'nope', 1, 1)).toBe(board)
    expect(resizeTo(board, 'nope', 4, 4)).toBe(board)
    expect(removePanel(board, 'nope')).toBe(board)
  })

  it('followSymbol sets the followed symbol without touching panels', () => {
    const board = morning()
    const next = followSymbol(board, 'NVDA')
    expect(next.sym).toBe('NVDA')
    expect(next.panels).toBe(board.panels)
    expect(board.sym).toBe('GOOGL')
  })

  it('never mutates the input board', () => {
    const board = morning()
    const frozen = JSON.stringify(board)
    moveTo(board, 'p3', 6, 5)
    resizeTo(board, 'p1', 8, 8)
    addPanel(board, 'news')
    removePanel(board, 'p1')
    followSymbol(board, 'X')
    expect(JSON.stringify(board)).toBe(frozen)
  })

  it('never leaves overlapping or out-of-grid panels after random operations', () => {
    const rand = mulberry32(20261031)
    const types = Object.keys(PANEL_TYPES)
    let board = morning()
    for (let i = 0; i < 50; i += 1) {
      const pick = board.panels[Math.floor(rand() * board.panels.length)]
      const roll = rand()
      if (roll < 0.6 && pick) board = moveTo(board, pick.id, Math.floor(rand() * 14) - 1, Math.floor(rand() * 20) - 2)
      else if (roll < 0.8 && pick) board = resizeTo(board, pick.id, Math.floor(rand() * 14), Math.floor(rand() * 9))
      else if (roll < 0.9) board = addPanel(board, types[Math.floor(rand() * types.length)])
      else if (pick && board.panels.length > 2) board = removePanel(board, pick.id)
      expectNoOverlap(board.panels)
      expectInGrid(board.panels)
    }
  })
})

describe('loadBoards and saveBoards', () => {
  it('returns the defaults when storage is empty', () => {
    expect(loadBoards()).toEqual(defaultBoards())
  })

  it('falls back to the defaults on bad JSON', () => {
    localStorage.setItem('saxodash:boards', '{nope')
    expect(loadBoards()).toEqual(defaultBoards())
  })

  it('falls back to the defaults when stored JSON is not an array', () => {
    localStorage.setItem('saxodash:boards', '{"id":"a"}')
    expect(loadBoards()).toEqual(defaultBoards())
  })

  it('falls back to the defaults when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadBoards()).toEqual(defaultBoards())
  })

  it('round-trips saved boards', () => {
    const boards = [followSymbol(morning(), 'NVDA')]
    expect(saveBoards(boards)).toBe(true)
    expect(loadBoards()).toEqual(boards)
    expect(JSON.parse(localStorage.getItem('saxodash:boards'))).toEqual(boards)
  })

  it('keeps an empty saved list rather than restoring defaults', () => {
    saveBoards([])
    expect(loadBoards()).toEqual([])
  })

  it('normalises stored boards and drops entries without an id or name', () => {
    localStorage.setItem(
      'saxodash:boards',
      JSON.stringify([
        null,
        'x',
        { name: 'No id', panels: [] },
        { id: 'noname', panels: [] },
        { id: 'ok', name: 'OK', sym: 'AAPL', panels: [{ id: 'a', type: 'radar' }, { id: 'b', type: 'news', x: 11, y: 0, w: 5, h: 4 }] },
      ]),
    )
    const boards = loadBoards()
    expect(boards).toHaveLength(1)
    expect(boards[0].panels).toHaveLength(1)
    expect(boards[0].panels[0]).toMatchObject({ x: 7, w: 5 })
  })

  it('drops a board whose id repeats an earlier one', () => {
    localStorage.setItem(
      'saxodash:boards',
      JSON.stringify([
        { id: 'a', name: 'First', panels: [] },
        { id: 'a', name: 'Second', panels: [] },
        { id: 'b', name: 'Third', panels: [] },
      ]),
    )
    expect(loadBoards().map((b) => b.name)).toEqual(['First', 'Third'])
  })

  it('swallows storage errors on save and reports false', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(saveBoards(defaultBoards())).toBe(false)
  })
})

describe('createBoard', () => {
  it('makes an empty Untitled board whose id collides with none of the existing ones', () => {
    const boards = [{ id: 'board-1', name: 'A', sym: '', panels: [] }, { id: 'board-2', name: 'B', sym: '', panels: [] }]
    const board = createBoard(boards, 'NVDA')
    expect(board).toEqual({ id: 'board-3', name: 'Untitled board', sym: 'NVDA', panels: [] })
  })

  it('never reuses the chart workspace id', () => {
    expect(createBoard([]).id).not.toBe('chart')
    expect(createBoard([]).sym).toBe('')
  })
})

describe('snapTarget', () => {
  const panel = { id: 'p1', type: 'chart', x: 2, y: 1, w: 4, h: 4 }
  const grid = { colWidth: 88, gap: 12 }

  it('uses 64 px rows', () => {
    expect(ROW_H).toBe(64)
  })

  it('moves by whole columns of width plus gap and rows of 64 px plus gap', () => {
    expect(snapTarget('move', panel, { dx: 200, dy: 152 }, grid)).toEqual({ ...panel, x: 4, y: 3 })
    expect(snapTarget('move', panel, { dx: 40, dy: 30 }, grid)).toEqual(panel)
  })

  it('keeps a moved panel inside the grid', () => {
    expect(snapTarget('move', panel, { dx: -2000, dy: -2000 }, grid)).toMatchObject({ x: 0, y: 0 })
    expect(snapTarget('move', panel, { dx: 5000, dy: 0 }, grid)).toMatchObject({ x: COLS - panel.w })
  })

  it('resizes from the corner within the minimum size and the right edge', () => {
    expect(snapTarget('resize', panel, { dx: 100, dy: 76 }, grid)).toEqual({ ...panel, w: 5, h: 5 })
    expect(snapTarget('resize', panel, { dx: -5000, dy: -5000 }, grid)).toMatchObject({ w: MIN_W, h: MIN_H })
    expect(snapTarget('resize', panel, { dx: 5000, dy: 0 }, grid)).toMatchObject({ w: COLS - panel.x })
  })
})

describe('stepVertically', () => {
  const stacked = () => ({
    id: 's',
    name: 'S',
    sym: '',
    panels: [
      { id: 'top', type: 'networth', x: 0, y: 0, w: 4, h: 3 },
      { id: 'low', type: 'news', x: 2, y: 3, w: 5, h: 5 },
      { id: 'side', type: 'symbol', x: 8, y: 0, w: 3, h: 5 },
    ],
  })

  it('moves a panel down past the neighbour below it, which moves up', () => {
    const next = stepVertically(stacked(), 'top', 1)
    expect(byId(next, 'top').y).toBe(5)
    expect(byId(next, 'low').y).toBe(0)
  })

  it('moves a panel up past the neighbour above it, which moves down', () => {
    const next = stepVertically(stacked(), 'low', -1)
    expect(byId(next, 'low').y).toBe(0)
    expect(byId(next, 'top').y).toBe(5)
  })

  it('leaves the board as it is with nothing to pass', () => {
    const board = stacked()
    expect(stepVertically(board, 'side', 1)).toBe(board)
    expect(stepVertically(board, 'top', -1)).toBe(board)
    expect(stepVertically(board, 'nope', 1)).toBe(board)
  })
})
