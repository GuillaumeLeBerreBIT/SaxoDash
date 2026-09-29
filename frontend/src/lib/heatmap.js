import { FLAT_MOVE } from './charts'

export const SECTOR_HEADER = 18
const MIN_HEADED_GROUP = 40

function worst(row, side, scale) {
  const areas = row.map((item) => item.value * scale)
  const sum = areas.reduce((total, a) => total + a, 0)
  const side2 = side * side
  const sum2 = sum * sum
  return Math.max((side2 * Math.max(...areas)) / sum2, sum2 / (side2 * Math.min(...areas)))
}

function placeRow(row, free, scale, placed) {
  const rowArea = row.reduce((total, item) => total + item.value * scale, 0)
  if (free.width >= free.height) {
    const width = rowArea / free.height
    let y = free.y
    for (const item of row) {
      const height = (item.value * scale) / width
      placed.push({ ...item, x: free.x, y, width, height })
      y += height
    }
    return { x: free.x + width, y: free.y, width: free.width - width, height: free.height }
  }
  const height = rowArea / free.width
  let x = free.x
  for (const item of row) {
    const width = (item.value * scale) / height
    placed.push({ ...item, x, y: free.y, width, height })
    x += width
  }
  return { x: free.x, y: free.y + height, width: free.width, height: free.height - height }
}

export function squarify(items, rect) {
  const sized = items
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => b.value - a.value)
  const total = sized.reduce((sum, item) => sum + item.value, 0)
  if (!total || !(rect.width > 0) || !(rect.height > 0)) return []

  const scale = (rect.width * rect.height) / total
  const placed = []
  let free = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  let row = []
  for (const item of sized) {
    const side = Math.min(free.width, free.height)
    if (row.length === 0 || worst([...row, item], side, scale) <= worst(row, side, scale)) {
      row.push(item)
    } else {
      free = placeRow(row, free, scale, placed)
      row = [item]
    }
  }
  if (row.length) placeRow(row, free, scale, placed)
  return placed
}

export function groupBySector(positions) {
  const groups = new Map()
  for (const position of positions) {
    const value = Number(position.value)
    if (!(value > 0)) continue
    const sector = (position.sector || '').trim() || 'Unknown'
    const group = groups.get(sector) ?? { sector, value: 0, positions: [] }
    group.value += value
    group.positions.push(position)
    groups.set(sector, group)
  }
  return [...groups.values()].sort((a, b) => b.value - a.value)
}

export function layoutPortfolio(positions, { width, height }) {
  const groups = groupBySector(positions)
  const total = groups.reduce((sum, group) => sum + group.value, 0)
  const tiles = []
  const sectors = squarify(groups, { x: 0, y: 0, width, height }).map((group) => {
    const headed = group.height >= MIN_HEADED_GROUP
    const inner = headed
      ? { x: group.x, y: group.y + SECTOR_HEADER, width: group.width, height: group.height - SECTOR_HEADER }
      : { x: group.x, y: group.y, width: group.width, height: group.height }
    const members = group.positions.map((position) => ({ position, value: Number(position.value) }))
    for (const tile of squarify(members, inner)) tiles.push({ ...tile, sector: group.sector })
    return {
      sector: group.sector,
      pct: (group.value / total) * 100,
      headed,
      x: group.x,
      y: group.y,
      width: group.width,
      height: group.height,
    }
  })
  return { sectors, tiles }
}

export function labelLevel(width, height) {
  if (width >= 56 && height >= 34) return 'full'
  if (width >= 36 && height >= 18) return 'ticker'
  return 'none'
}

export function dayMoves(positions, quotes) {
  return positions.map((position) => {
    const changePct = quotes.get(position.uic)?.change_pct ?? null
    const value = Number(position.value)
    const impactEur = changePct == null ? null : (value * changePct) / (100 + changePct)
    return { position, changePct, impactEur }
  })
}

export function daySummary(moves) {
  const known = moves.filter((move) => move.impactEur != null)
  if (known.length === 0) return null
  const impactEur = known.reduce((sum, move) => sum + move.impactEur, 0)
  const before = known.reduce((sum, move) => sum + Number(move.position.value) - move.impactEur, 0)
  const driver = known.reduce((best, move) => (Math.abs(move.impactEur) > Math.abs(best.impactEur) ? move : best))
  return { impactEur, pct: before ? (impactEur / before) * 100 : null, driver }
}

export function rankDayMoves(moves, count = 3) {
  const known = moves.filter((move) => move.changePct != null)
  return {
    best: known.filter((m) => m.changePct > 0).sort((a, b) => b.changePct - a.changePct).slice(0, count),
    worst: known.filter((m) => m.changePct < 0).sort((a, b) => a.changePct - b.changePct).slice(0, count),
  }
}

export function sincePurchaseSummary(positions) {
  const ranked = positions.filter((p) => p.pnl != null).sort((a, b) => Number(b.pnl) - Number(a.pnl))
  if (ranked.length === 0) return null
  const top = ranked[0]
  const bottom = ranked[ranked.length - 1]
  return {
    contributor: Number(top.pnl) > 0 ? top : null,
    drag: Number(bottom.pnl) < 0 ? bottom : null,
  }
}

export function sortByMove(items, quotes) {
  const change = (item) => quotes.get(item.uic)?.change_pct ?? null
  return [...items].sort((a, b) => {
    const ca = change(a)
    const cb = change(b)
    if (ca == null && cb == null) return a.symbol.localeCompare(b.symbol)
    if (ca == null) return 1
    if (cb == null) return -1
    return cb - ca || a.symbol.localeCompare(b.symbol)
  })
}

export function breadth(changes) {
  let up = 0
  let down = 0
  for (const change of changes) {
    if (change == null) continue
    if (change >= FLAT_MOVE) up += 1
    else if (change <= -FLAT_MOVE) down += 1
  }
  return { up, down }
}
