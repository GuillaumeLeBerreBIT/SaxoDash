import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Briefcase, List, LineChart, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { getUsername } from '../api/client'

const items = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { to: '/transactions', label: 'Transactions', icon: List },
]

export default function Sidebar({ collapsed, setCollapsed }) {
  const username = getUsername() || 'Account'
  const initials = username.slice(0, 2).toUpperCase()
  const width = collapsed ? 64 : 220
  const labelCls = `whitespace-nowrap overflow-hidden transition-[opacity,width] duration-300 ease-out ${
    collapsed ? 'opacity-0 w-0' : 'opacity-100'
  }`

  return (
    <aside
      className="fixed left-0 top-0 h-screen border-r border-white/[0.06] bg-gradient-to-b from-zinc-950 to-[#0b0b0e] flex flex-col z-30 transition-[width] duration-300 ease-out"
      style={{ width }}
    >
      <div className={`h-14 flex items-center border-b border-white/[0.06] ${collapsed ? 'justify-center' : 'px-4'}`}>
        <div className="w-7 h-7 rounded-md bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
          <LineChart size={15} strokeWidth={2} />
        </div>
        <span className={`ml-2.5 text-[15px] font-medium tracking-tight text-zinc-50 ${labelCls} ${collapsed ? 'ml-0' : ''}`}>
          SaxoDash
        </span>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="ml-auto w-6 h-6 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 flex items-center justify-center"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={14} />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="mx-2 mt-2 h-7 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 flex items-center justify-center"
          title="Expand sidebar"
        >
          <PanelLeftOpen size={14} />
        </button>
      )}

      <nav className={`flex-1 ${collapsed ? 'px-2' : 'px-3'} py-3 space-y-0.5`}>
        {items.map(({ to, label, icon: ItemIcon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `relative w-full h-9 flex items-center rounded-md text-[13px] ${
                collapsed ? 'justify-center' : 'px-3 gap-3'
              } ${
                isActive
                  ? 'bg-blue-500/10 text-blue-400'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-blue-500" />
                )}
                <ItemIcon size={16} strokeWidth={1.75} />
                <span className={`font-medium ${labelCls}`}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className={`border-t border-white/[0.06] ${collapsed ? 'p-2' : 'p-3'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
          <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-[11px] font-medium flex items-center justify-center shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[13px] text-zinc-100 font-medium leading-tight truncate">{username}</div>
              <div className="text-[11px] text-zinc-500 leading-tight">Personal</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
