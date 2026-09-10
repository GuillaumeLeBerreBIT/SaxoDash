import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import CommandPalette from './CommandPalette'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(window.innerWidth < 1100)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onResize = () => setCollapsed(window.innerWidth < 1100)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <main className="transition-[margin] duration-300 ease-out" style={{ marginLeft: collapsed ? 64 : 220 }}>
        <div className="px-8 py-8 max-w-[1500px] mx-auto animate-pagein">
          <Outlet />
        </div>
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
