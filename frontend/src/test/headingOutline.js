import { expect } from 'vitest'

export function headingLevels(container) {
  return [...container.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((heading) => Number(heading.tagName[1]))
}

export function expectValidHeadingOutline(container) {
  const levels = headingLevels(container)
  expect(levels.filter((level) => level === 1)).toHaveLength(1)
  levels.forEach((level, i) => {
    expect(level - (i === 0 ? 0 : levels[i - 1])).toBeLessThanOrEqual(1)
  })
}
