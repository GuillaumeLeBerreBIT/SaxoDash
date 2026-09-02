import '@testing-library/jest-dom/vitest'

// jsdom has no layout engine and no ResizeObserver; the chart's useWidth needs
// the constructor to exist and falls back to its default width without it.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
