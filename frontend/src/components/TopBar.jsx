import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { getUsername, logout } from '../api/client'
import { useNetWorth, usePortfolioSummary, useSaxoStatus } from '../api/queries'
import { fmtEur } from '../lib/format'
import { NAV_ITEMS, pageTitle } from '../lib/navigation'
import { deriveSaxoStatus } from '../lib/saxoStatus'
import { MenuContent, MenuItem, MenuLabel, MenuRoot, MenuSeparator, MenuTrigger } from './overlays'
import { useConnectSaxo } from '../lib/useConnectSaxo'
import { StatusDot, Tag } from './ui'
import FilingAlerts from './investors/FilingAlerts'

const PILL = 'items-center gap-2 h-9 px-3.5 rounded-[10px] bg-pill text-[14px] whitespace-nowrap'
const FIGURE_PILL = `${PILL} text-ink font-bold num`

const STATUS_TONE = {
  connected: 'ok',
  sync_degraded: 'warn',
  reconnecting: 'warn',
  needs_reauth: 'warn',
  not_connected: 'off',
}

const SAXO_ACTION = {
  not_connected: 'Connect',
  needs_reauth: 'Reconnect',
  reconnecting: 'Reconnect',
}

function saxoAccountValue(summary, netWorth) {
  if (summary?.total_value == null || netWorth?.broker_cash == null) return null
  return Number(summary.total_value) + Number(netWorth.broker_cash)
}

function Tabs() {
  return (
    <nav
      aria-label="Pages"
      className="hidden min-[760px]:flex items-center gap-x-[22px] min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {NAV_ITEMS.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `py-1 text-[17px] font-bold whitespace-nowrap rounded-sm ${isActive ? 'text-ink' : 'text-ink-3 hover:text-ink'}`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

function AccountMenu() {
  const navigate = useNavigate()
  const { data: status } = useSaxoStatus()
  const saxo = deriveSaxoStatus(status)
  const username = getUsername() || 'Account'
  const action = saxo && SAXO_ACTION[saxo.kind]
  const { connect, failed } = useConnectSaxo()

  const signOut = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <MenuRoot>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={saxo ? `Account, ${saxo.sentence}` : 'Account'}
          className={`${FIGURE_PILL} inline-flex relative w-9 px-0 justify-center`}
        >
          <span aria-hidden="true">{username.slice(0, 1).toUpperCase()}</span>
          {saxo && (
            <StatusDot
              tone={STATUS_TONE[saxo.kind]}
              className="absolute right-[5px] bottom-[5px] shadow-[0_0_0_2px_var(--sd-pill)]"
            />
          )}
        </button>
      </MenuTrigger>
      <MenuContent align="end" width={300}>
        <MenuLabel>{username}</MenuLabel>
        {saxo && (
          <MenuItem
            onSelect={
              action
                ? (event) => {
                    event.preventDefault()
                    connect()
                  }
                : () => navigate('/settings?section=connections')
            }
          >
            <StatusDot tone={STATUS_TONE[saxo.kind]} />
            <span className="min-w-0 flex-1 truncate">{saxo.sentence}</span>
            {failed && <Tag tone="down">Connection failed</Tag>}
            {action && !failed && <span className="text-ink font-semibold">{action}</span>}
          </MenuItem>
        )}
        <MenuItem onSelect={() => navigate('/settings')}>Theme and colours</MenuItem>
        <MenuItem onSelect={() => navigate('/settings?section=sync')}>Sync health</MenuItem>
        <MenuItem danger onSelect={signOut}>
          Sign out
        </MenuItem>
        <MenuSeparator />
        <MenuItem asChild className="h-7 text-[12px] text-ink-3">
          <a href="https://elbstream.com/logos" target="_blank" rel="noreferrer">
            Logos by elbstream.com
          </a>
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  )
}

export default function TopBar({ onOpenPalette }) {
  const { pathname } = useLocation()
  const { data: summary } = usePortfolioSummary()
  const { data: netWorth } = useNetWorth()
  const accountValue = saxoAccountValue(summary, netWorth)

  return (
    <header className="sd-header sd-gutter sticky top-[env(safe-area-inset-top)] z-30 flex items-center gap-x-[26px] gap-y-4 py-3.5 max-[759px]:gap-x-2.5">
      <p className="min-[760px]:hidden min-w-0 flex-1 truncate text-[20px] font-bold text-ink">{pageTitle(pathname)}</p>
      <Tabs />
      <div className="ml-auto flex items-center gap-2 shrink-0">
        <button
          type="button"
          aria-label="Search"
          onClick={onOpenPalette}
          className={`${PILL} inline-flex w-9 px-0 justify-center min-[760px]:hidden text-ink-2`}
        >
          <Search size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onOpenPalette}
          className={`${PILL} hidden min-[760px]:inline-flex min-w-[150px] text-ink-3 font-medium`}
        >
          <Search size={15} aria-hidden="true" />
          <span>Search</span>
          <kbd className="ml-auto font-mono text-[11px] px-1.5 py-px rounded-[5px] bg-track text-ink-2">⌘K</kbd>
        </button>
        <Link to="/portfolio" title="Saxo account value" className={`${FIGURE_PILL} inline-flex`}>
          <span className="sr-only">Saxo account value</span>
          {fmtEur(accountValue)}
        </Link>
        <Link
          to="/money"
          title="Cash across accounts"
          className={`${FIGURE_PILL} hidden min-[1420px]:inline-flex`}
        >
          <span className="sr-only">Cash across accounts</span>
          {fmtEur(netWorth?.bank_total ?? null)}
        </Link>
        <FilingAlerts side="below" />
        <AccountMenu />
      </div>
    </header>
  )
}
