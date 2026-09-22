// Split by backend app (portfolio/transactions/accounts/core/analytics/saxo/
// enablebanking/research), mirroring api/client/ - see docs/design-system.md.
// Nothing outside `api/` should import a domain file directly; import from
// here so the split stays an internal implementation detail.
export { unwrap } from './shared'
export * from './portfolio'
export * from './transactions'
export * from './accounts'
export * from './core'
export * from './analytics'
export * from './saxo'
export * from './enablebanking'
export * from './research'

import { accountsKeys } from './accounts'
import { analyticsKeys } from './analytics'
import { coreKeys } from './core'
import { enableBankingKeys } from './enablebanking'
import { portfolioKeys } from './portfolio'
import { researchKeys } from './research'
import { saxoKeys } from './saxo'
import { transactionsKeys } from './transactions'

// Flat merge of every domain's keys, kept for anything still reaching for a
// single `queryKeys` namespace - each domain file above is the source of
// truth for its own slice.
export const queryKeys = {
  ...portfolioKeys,
  ...transactionsKeys,
  ...accountsKeys,
  ...coreKeys,
  ...analyticsKeys,
  ...saxoKeys,
  ...enableBankingKeys,
  ...researchKeys,
}
