const SHARE_CLASS = /\s*\(?\bclass\s+[a-z]\)?\s*$/i
const LEGAL = /[\s,]+(inc\.?|incorporated|corp\.?|corporation|co\.?|company|plc|n\.?v\.?|ltd\.?|limited|s\.?a\.?|ag|se)$/i
const INVERTED = /^([\w&.-]+)\s+\(([\w&.-]+)\)$/

export function displayName(name) {
  if (!name) return ''
  const original = String(name).trim()
  const inverted = original.match(INVERTED)
  if (inverted) return `${inverted[2]} ${inverted[1]}`
  let clean = original
  for (let i = 0; i < 3; i += 1) clean = clean.replace(SHARE_CLASS, '').replace(LEGAL, '').trim()
  return clean || original
}
