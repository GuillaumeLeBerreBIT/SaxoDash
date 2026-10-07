import {
  Briefcase,
  CalendarClock,
  CandlestickChart,
  ChartNoAxesCombined,
  Compass,
  Landmark,
  LayoutDashboard,
  List,
  PiggyBank,
  Users,
} from 'lucide-react'

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { to: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  { to: '/research', label: 'Research', icon: CandlestickChart },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/earnings', label: 'Earnings', icon: CalendarClock },
  { to: '/investors', label: 'Investors', icon: Users },
  { to: '/transactions', label: 'Transactions', icon: List },
  { to: '/accounts', label: 'Accounts', icon: Landmark },
  { to: '/spending', label: 'Spending', icon: PiggyBank },
]

export const MOBILE_PRIMARY = ['/', '/portfolio', '/research', '/spending']

export function mobileOverflow(items = NAV_ITEMS) {
  return items.filter((item) => !MOBILE_PRIMARY.includes(item.to))
}
