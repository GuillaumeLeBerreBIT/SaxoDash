import { NAV_ITEMS, SETTINGS_ITEM } from './navigation'

export const DEEP_LINK_COMMANDS = [
  { to: '/portfolio?view=transactions', label: 'Transactions' },
  { to: '/money?section=accounts', label: 'Accounts' },
  { to: '/money?section=spending', label: 'Spending', ownerOnly: true },
]

export const PAGE_COMMANDS = [
  ...[...NAV_ITEMS, SETTINGS_ITEM].map(({ to, label, ownerOnly }) => ({ to, label, ...(ownerOnly ? { ownerOnly } : {}) })),
  ...DEEP_LINK_COMMANDS,
]
