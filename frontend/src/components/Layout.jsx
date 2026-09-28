import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import CommandPalette from './CommandPalette'
import { useCommandPalette } from './useCommandPalette'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(window.innerWidth < 1100)
  const palette = useCommandPalette()

  useEffect(() => {
    const onResize = () => setCollapsed(window.innerWidth < 1100)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        onOpenPalette={() => palette.setOpen(true)}
      />
      <main className="transition-[margin] duration-300 ease-out" style={{ marginLeft: collapsed ? 64 : 220 }}>
        <div
          className="mx-auto py-6 2xl:py-8 animate-pagein"
          style={{ maxWidth: 2200, paddingLeft: 'clamp(24px, 4vw, 96px)', paddingRight: 'clamp(24px, 4vw, 96px)' }}
        >
          <Outlet />
        </div>
      </main>
      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} />
    </div>
  )
}
