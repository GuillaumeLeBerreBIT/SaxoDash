import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'

import { getVerdict, getVerdictSummary, getVerdictTrackRecord } from '../client'

export const verdictKeys = {
  summaries: ['verdicts', 'summary'],
  summary: (tickers) => ['verdicts', 'summary', tickers.join(',')],
  detail: (ticker) => ['verdicts', 'detail', ticker],
  trackRecord: ['verdicts', 'track-record'],
}

export const MAX_VERDICT_TICKERS = 200

function chunked(items, size) {
  const chunks = []
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size))
  return chunks
}

function merged(summaries) {
  if (summaries.length === 0) return undefined
  return Object.assign({}, ...summaries.map((summary) => summary.verdicts))
}

const mergeSummaries = (results) => {
  const answered = results.filter((result) => result.data)
  if (answered.length === 0) return { data: undefined, isLoading: results.some((result) => result.isLoading) }
  return { data: merged(answered.map((result) => result.data)), isLoading: false }
}

export function useVerdictSummary(tickers) {
  const queryClient = useQueryClient()
  const cachedSummaries = () => {
    const verdicts = merged(
      queryClient
        .getQueriesData({ queryKey: verdictKeys.summaries })
        .map(([, data]) => data)
        .filter(Boolean),
    )
    return verdicts && { verdicts }
  }
  return useQueries({
    queries: chunked(tickers, MAX_VERDICT_TICKERS).map((chunk) => ({
      queryKey: verdictKeys.summary(chunk),
      queryFn: () => getVerdictSummary(chunk),
      placeholderData: cachedSummaries,
    })),
    combine: mergeSummaries,
  })
}

export function useVerdict(ticker) {
  return useQuery({
    queryKey: verdictKeys.detail(ticker),
    queryFn: () => getVerdict(ticker),
    enabled: Boolean(ticker),
    select: (answer) => answer.verdict,
  })
}

export function useVerdictTrackRecord() {
  return useQuery({ queryKey: verdictKeys.trackRecord, queryFn: getVerdictTrackRecord })
}
