import { describe, expect, it } from 'vitest'
import {
  breadth,
  dayMoves,
  daySummary,
  groupBySector,
  labelLevel,
  layoutPortfolio,
  rankDayMoves,
  sincePurchaseSummary,
  sortByMove,
  squarify,
} from './heatmap'

const rect = { x: 0, y: 0, width: 600, height: 400 }
const area = (t) => t.width * t.height
const overlap = (a, b) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

describe('squarify', () => {
  const items = [6, 6, 4, 3, 2, 2, 1].map((value, id) => ({ id, value }))

  it('gives each tile an area proportional to its value', () => {
    for (const tile of squarify(items, rect)) {
      expect(area(tile)).toBeCloseTo((tile.value / 24) * 240_000, 6)
    }
  })

  it('covers the rect exactly, inside its bounds, without overlaps', () => {
    const tiles = squarify(items, rect)
    expect(tiles.reduce((sum, t) => sum + area(t), 0)).toBeCloseTo(240_000, 6)
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(-1e-9)
      expect(t.y).toBeGreaterThanOrEqual(-1e-9)
      expect(t.x + t.width).toBeLessThanOrEqual(600 + 1e-9)
      expect(t.y + t.height).toBeLessThanOrEqual(400 + 1e-9)
    }
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) expect(overlap(tiles[i], tiles[j])).toBeLessThan(1e-6)
    }
  })

  it('keeps equal items near square', () => {
    const tiles = squarify(Array.from({ length: 6 }, (_, id) => ({ id, value: 1 })), rect)
    for (const t of tiles) expect(Math.max(t.width / t.height, t.height / t.width)).toBeLessThan(3)
  })

  it('drops zero, negative and non-numeric values instead of drawing NaN', () => {
    const tiles = squarify([{ value: 0 }, { value: -2 }, { value: NaN }, { value: 5 }], rect)
    expect(tiles).toHaveLength(1)
    expect(tiles[0]).toMatchObject({ x: 0, y: 0, width: 600, height: 400 })
  })

  it('returns nothing for an empty list or an empty rect', () => {
    expect(squarify([], rect)).toEqual([])
    expect(squarify(items, { x: 0, y: 0, width: 0, height: 400 })).toEqual([])
  })
})

describe('groupBySector', () => {
  it('buckets a blank sector as Unknown and orders groups by value', () => {
    const groups = groupBySector([
      { ticker: 'A', sector: 'Tech', value: '100' },
      { ticker: 'B', sector: '', value: '300' },
      { ticker: 'C', sector: 'Tech', value: '50' },
      { ticker: 'D', sector: null, value: '10' },
    ])
    expect(groups.map((g) => [g.sector, g.value])).toEqual([['Unknown', 310], ['Tech', 150]])
  })

  it('leaves out positions with no positive value', () => {
    const groups = groupBySector([
      { ticker: 'A', sector: 'Tech', value: '0' },
      { ticker: 'B', sector: 'Tech', value: '-5' },
      { ticker: 'C', sector: 'Tech', value: '20' },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].positions.map((p) => p.ticker)).toEqual(['C'])
  })
})

describe('layoutPortfolio', () => {
  const positions = [
    { ticker: 'NVDA', sector: 'Technology', value: '6000' },
    { ticker: 'MSFT', sector: 'Technology', value: '3000' },
    { ticker: 'KO', sector: 'Staples', value: '1000' },
  ]

  it('gives every position one tile tagged with its sector', () => {
    const { tiles } = layoutPortfolio(positions, { width: 760, height: 280 })
    expect(tiles.map((t) => [t.position.ticker, t.sector]).sort()).toEqual([
      ['KO', 'Staples'], ['MSFT', 'Technology'], ['NVDA', 'Technology'],
    ])
  })

  it('heads a sector tall enough to carry a label, with its share', () => {
    const { sectors } = layoutPortfolio(positions, { width: 760, height: 280 })
    expect(sectors[0]).toMatchObject({ sector: 'Technology', headed: true })
    expect(sectors[0].pct).toBeCloseTo(90, 6)
  })

  it('drops the header on a sector too short for one', () => {
    const { sectors } = layoutPortfolio(positions, { width: 760, height: 30 })
    expect(sectors.every((s) => !s.headed)).toBe(true)
  })

  it('lays out nothing for an empty book', () => {
    expect(layoutPortfolio([], { width: 760, height: 280 })).toEqual({ sectors: [], tiles: [] })
  })
})

describe('labelLevel', () => {
  it('fits ticker and move, then ticker only, then nothing', () => {
    expect(labelLevel(56, 34)).toBe('full')
    expect(labelLevel(55, 34)).toBe('ticker')
    expect(labelLevel(36, 18)).toBe('ticker')
    expect(labelLevel(35, 40)).toBe('none')
  })
})

describe('dayMoves', () => {
  const quotes = new Map([[1, { uic: 1, change_pct: 5 }]])

  it("turns a % move into today's euro effect on the current value", () => {
    const [move] = dayMoves([{ ticker: 'A', uic: 1, value: '1050.00' }], quotes)
    expect(move.changePct).toBe(5)
    expect(move.impactEur).toBeCloseTo(50, 9)
  })

  it('leaves a position with no uic or no quote unknown, not zero', () => {
    const moves = dayMoves([{ ticker: 'B', uic: null, value: '10' }, { ticker: 'C', uic: 9, value: '10' }], quotes)
    expect(moves.map((m) => [m.changePct, m.impactEur])).toEqual([[null, null], [null, null]])
  })
})

describe('daySummary', () => {
  const move = (ticker, value, changePct, impactEur) => ({ position: { ticker, value }, changePct, impactEur })

  it('sums the euro effect and names the biggest driver by size', () => {
    const summary = daySummary([move('A', '1050', 5, 50), move('B', '980', -2, -20), move('C', '10', null, null)])
    expect(summary.impactEur).toBeCloseTo(30, 9)
    expect(summary.pct).toBeCloseTo(1.5, 9)
    expect(summary.driver.position.ticker).toBe('A')
  })

  it('is null when no position has a move', () => {
    expect(daySummary([move('C', '10', null, null)])).toBeNull()
  })
})

describe('rankDayMoves', () => {
  const move = (ticker, changePct) => ({ position: { ticker }, changePct, impactEur: changePct })

  it('keeps gainers and losers apart and skips unknown moves', () => {
    const { best, worst } = rankDayMoves([move('A', 1), move('B', 4), move('C', -2), move('D', null), move('E', -5)])
    expect(best.map((m) => m.position.ticker)).toEqual(['B', 'A'])
    expect(worst.map((m) => m.position.ticker)).toEqual(['E', 'C'])
  })

  it('takes at most three a side', () => {
    const { best } = rankDayMoves([1, 2, 3, 4].map((c) => move(`T${c}`, c)))
    expect(best.map((m) => m.position.ticker)).toEqual(['T4', 'T3', 'T2'])
  })
})

describe('sincePurchaseSummary', () => {
  it('names the largest euro gain and the largest euro loss', () => {
    const summary = sincePurchaseSummary([
      { ticker: 'A', pnl: '100' }, { ticker: 'B', pnl: '-40' }, { ticker: 'C', pnl: '2500' },
    ])
    expect(summary.contributor.ticker).toBe('C')
    expect(summary.drag.ticker).toBe('B')
  })

  it('has no drag when nothing is under water', () => {
    expect(sincePurchaseSummary([{ ticker: 'A', pnl: '100' }]).drag).toBeNull()
  })

  it('is null for an empty book', () => {
    expect(sincePurchaseSummary([])).toBeNull()
  })
})

describe('sortByMove', () => {
  it('orders by move, biggest gain first, unknown last, ties by symbol', () => {
    const items = ['KO', 'AAPL', 'NVDA', 'TSLA', 'MSFT'].map((symbol, uic) => ({ symbol, uic }))
    const quotes = new Map([
      [0, { change_pct: 1 }], [1, { change_pct: 1 }], [2, { change_pct: 3 }], [3, { change_pct: -2 }],
    ])
    expect(sortByMove(items, quotes).map((i) => i.symbol)).toEqual(['NVDA', 'AAPL', 'KO', 'TSLA', 'MSFT'])
  })
})

describe('breadth', () => {
  it('counts risers and fallers, leaving flat and unknown out', () => {
    expect(breadth([2, 0.05, -1, null, 0, -0.2, 0.1])).toEqual({ up: 2, down: 2 })
  })
})
