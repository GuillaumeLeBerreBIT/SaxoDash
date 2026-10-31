const TABLE = {
  pageTop: ['#25211C', '#0F131A', '#F3F4F6'],
  page: ['#171512', '#0A0C0F', '#F3F4F6'],
  pane: ['#12100E', '#101318', '#FFFFFF'],
  raised: ['#1A1A1A', '#161B22', '#FFFFFF'],
  hover: ['#1A1A1A', '#141922', '#F3F5F8'],
  selected: ['#171717', '#121925', '#EAF0FB'],
  tile: ['#181818', '#141922', '#F6F7F9'],
  pill: ['#1D1B19', '#141922', '#FFFFFF'],
  track: ['#080605', '#07090C', '#ECEEF1'],
  bar: ['#1D1D1D', '#161B22', '#FFFFFF'],
  ink: ['#FFFFFF', '#E6E9ED', '#111827'],
  ink2: ['#929191', '#8B95A3', '#4B5563'],
  ink3: ['#7E7B78', '#77818F', '#6B7280'],
  onAccent: ['#12100E', '#0A0C0F', '#FFFFFF'],
  disabled: ['#2C2A2A', '#3D4550', '#A3A9B3'],
  line: ['#1A1A1A', '#1C2129', '#E5E7EB'],
  lineInput: ['#6B6865', '#5E6876', '#8A919C'],
  focus: ['#FFFFFF', '#7FB2FF', '#1F5FD1'],
  accent: ['#FFFFFF', '#7FB2FF', '#1F5FD1'],
  accentHover: ['#E6E5E3', '#A9CBFF', '#1A4FB0'],
  accentSubtle: ['#171717', '#17243A', '#E3EBFA'],
  up: ['#5BC860', '#3FB27F', '#12733A'],
  down: ['#EB503F', '#E5534B', '#C0362C'],
  upSubtle: ['#1E2E1A', '#12291F', '#EAF5EE'],
  downSubtle: ['#2A120F', '#2D1517', '#FBECEA'],
  flat: ['#929191', '#8B95A3', '#6B7280'],
  warn: ['#F5C542', '#E8A23A', '#B88A00'],
  warnText: ['#F5C542', '#E8A23A', '#8A6700'],
  ok: ['#5BC860', '#3FB27F', '#12733A'],
  error: ['#EB503F', '#E5534B', '#C0362C'],
  earn: ['#B69CFF', '#D86BD0', '#9B4DCA'],
  earnSubtle: ['#221C33', '#2A1730', '#F3EAFA'],
  held: ['#FFFFFF', '#7FB2FF', '#1F5FD1'],
  grid: ['#211F1D', '#161A21', '#EEF0F3'],
  crosshair: ['#9D9CA0', '#8B95A3', '#4B5563'],
  bench: ['#929191', '#8B95A3', '#6B7280'],
  primaryLine: ['#FFFFFF', '#7FB2FF', '#1F5FD1'],
  heatD3: ['#3D1C19', '#5C2A29', '#E58A80'],
  heatD2: ['#311611', '#45201F', '#F2B3AB'],
  heatD1: ['#1B0607', '#2A1718', '#F8DCD8'],
  heat0: ['#171512', '#262B33', '#EDEDED'],
  heatU1: ['#192316', '#16302A', '#DDF0E3'],
  heatU2: ['#2F5F2F', '#1F4A38', '#A9D9B9'],
  heatU3: ['#408040', '#2C7A58', '#6FBF8E'],
}

const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']

const THEME_NAMES = ['republic', 'blue', 'light']

function build(index, series) {
  const theme = {}
  for (const [role, values] of Object.entries(TABLE)) theme[role] = values[index]
  series.forEach((hex, i) => {
    theme[`s${i + 1}`] = hex
  })
  return theme
}

export const THEMES = {
  republic: build(0, SERIES_DARK),
  blue: build(1, SERIES_DARK),
  light: build(2, SERIES_LIGHT),
}

export const ROLES = Object.keys(THEMES.republic)

export const MOVES = {
  'green-red': {},
  cvd: {
    dark: {
      up: '#4C9AFF',
      down: '#FF9A3C',
      upSubtle: '#152238',
      downSubtle: '#3A220F',
      heatD3: '#4A2A12',
      heatD2: '#3A220F',
      heatD1: '#24160A',
      heatU1: '#152238',
      heatU2: '#1F3A66',
      heatU3: '#2C5BA0',
    },
    light: {
      up: '#1F5FD1',
      down: '#C2570C',
      upSubtle: '#E3EBFA',
      downSubtle: '#FBEADF',
      heatD3: '#E59A63',
      heatD2: '#F2C29F',
      heatD1: '#F7D8C2',
      heatU1: '#DCE6F8',
      heatU2: '#A9C2EE',
      heatU3: '#6E97E2',
    },
  },
}

export const DENSITY = {
  comfortable: { rowH: 46, gap: 12 },
  compact: { rowH: 38, gap: 8 },
}

export const DEFAULT_APPEARANCE = { theme: 'republic', moves: 'green-red', density: 'comfortable' }

const SERIES_ROLE = /^s\d$/

export function cssVarName(role) {
  if (SERIES_ROLE.test(role)) return `--sd-${role}`
  const kebab = role.replace(/([A-Z])/g, '-$1').replace(/([a-z])(\d)/g, '$1-$2')
  return `--sd-${kebab.toLowerCase()}`
}

function overridesFor(theme, moves) {
  if (moves === 'cvd') return MOVES.cvd[theme === 'light' ? 'light' : 'dark']
  return MOVES[moves] ?? {}
}

export function themeVars(theme, moves = 'green-red') {
  const resolved = { ...THEMES[theme], ...overridesFor(theme, moves) }
  const vars = {}
  for (const role of ROLES) vars[cssVarName(role)] = resolved[role]
  return vars
}

function channel(value) {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

export function contrastRatio(hexA, hexB) {
  const [hi, lo] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

export function readAppearance(raw) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = null
  }
  const source = parsed && typeof parsed === 'object' ? parsed : {}
  return {
    theme: THEME_NAMES.includes(source.theme) ? source.theme : DEFAULT_APPEARANCE.theme,
    moves: Object.hasOwn(MOVES, source.moves) ? source.moves : DEFAULT_APPEARANCE.moves,
    density: Object.hasOwn(DENSITY, source.density) ? source.density : DEFAULT_APPEARANCE.density,
  }
}
