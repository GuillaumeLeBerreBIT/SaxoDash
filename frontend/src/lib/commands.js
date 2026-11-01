import { NAV_ITEMS, SETTINGS_ITEM } from './navigation'

export const PAGE_COMMANDS = [...NAV_ITEMS, SETTINGS_ITEM].map(({ to, label }) => ({ to, label }))
