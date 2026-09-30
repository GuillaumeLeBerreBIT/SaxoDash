import { useEffect, useState } from 'react'

import { isTypingTarget } from '../../lib/priceLines'

export function useAnnotationSelection({ containerRef, items, onDelete }) {
  const [selectedId, setSelectedId] = useState(null)
  const selected = items.find((item) => item.id === selectedId) ?? null

  useEffect(() => {
    if (!selected) return undefined
    const onKeyDown = (event) => {
      if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) return
      if (event.key === 'Escape') setSelectedId(null)
      if ((event.key === 'Delete' || event.key === 'Backspace') && onDelete) {
        event.preventDefault()
        setSelectedId(null)
        onDelete(selected)
      }
    }
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setSelectedId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [selected, onDelete, containerRef])

  return { selected, select: setSelectedId, clear: () => setSelectedId(null) }
}
