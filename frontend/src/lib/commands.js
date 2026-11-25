import { NAV_ITEMS, SETTINGS_ITEM } from './navigation'

export const DEEP_LINK_COMMANDS = [
  { to: '/portfolio?view=transactions', label: 'Transactions' },
]

export const PAGE_COMMANDS = [
  ...[...NAV_ITEMS, SETTINGS_ITEM].map(({ to, label }) => ({ to, label })),
  ...DEEP_LINK_COMMANDS,
]
