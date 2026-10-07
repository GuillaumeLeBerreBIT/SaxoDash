import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'
import MobileTopBar from './MobileTopBar'
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
      <MobileTopBar onOpenPalette={() => palette.setOpen(true)} />
      <main
        className="md:ml-[var(--rail)] transition-[margin] duration-300 ease-out"
        style={{ '--rail': `${collapsed ? 64 : 220}px` }}
      >
        <div
          className="mx-auto py-6 pb-24 md:pb-6 2xl:py-8 animate-pagein"
          style={{ maxWidth: 2200, paddingLeft: 'clamp(16px, 4vw, 96px)', paddingRight: 'clamp(16px, 4vw, 96px)' }}
        >
          <Outlet />
        </div>
      </main>
      <MobileNav onOpenPalette={() => palette.setOpen(true)} />
      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} />
    </div>
  )
}
