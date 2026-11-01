import { Outlet } from 'react-router-dom'
import TopBar from './TopBar'
import MobileNav from './MobileNav'
import CommandPalette from './CommandPalette'
import { useCommandPalette } from './useCommandPalette'

export default function Layout() {
  const palette = useCommandPalette()
  const openPalette = () => palette.setOpen(true)

  return (
    <div className="min-h-screen text-ink">
      <TopBar onOpenPalette={openPalette} />
      <main>
        <div className="sd-gutter pt-2 pb-24 min-[760px]:pb-8 animate-pagein">
          <Outlet context={{ openPalette }} />
        </div>
      </main>
      <MobileNav onOpenPalette={openPalette} />
      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} />
    </div>
  )
}
