const SAME_DAY_SESSIONS = new Set(['bmo', 'dmh'])

function pct(after, before) {
  if (after == null || !before) return null
  return Math.round(((after - before) / before) * 10000) / 100
}

export function earningsMove(reportDate, session, bars) {
  let previous = null
  let sameDay = null
  let following = null
  for (const bar of bars) {
    if (bar.date < reportDate) previous = bar.close
    else if (bar.date === reportDate) sameDay ??= bar.close
    else following ??= bar.close
  }
  const [value, basis] = SAME_DAY_SESSIONS.has(session)
    ? [pct(sameDay, previous), '1d']
    : session === 'amc'
      ? [pct(following, sameDay), '1d']
      : [pct(following, previous), '2d']
  return value == null ? null : { pct: value, basis }
}
