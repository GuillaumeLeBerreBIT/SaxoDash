// DRF paginates some list endpoints and not others, so callers used to write
// `res.results ?? res` at every site. Centralised here instead.
export const unwrap = (res) => res?.results ?? res
