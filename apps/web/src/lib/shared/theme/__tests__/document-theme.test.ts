import { describe, it, expect } from 'vitest'
import { resolveDocumentTheme } from '../index'

// resolveDocumentTheme decides what `class` and `color-scheme` the server puts
// on <html> so the very first paint already matches the chosen theme. Without
// it the browser shows its default (light) canvas during load and we get a
// white flash before next-themes' inline script swaps in the dark class.
describe('resolveDocumentTheme', () => {
  it('renders the dark class and a dark UA canvas for an explicit dark theme', () => {
    // The server knows the answer (forced-dark portal, or a `theme=dark`
    // cookie), so it must commit to it — color-scheme:dark stops the white
    // canvas even on a light-mode OS.
    expect(resolveDocumentTheme('dark')).toEqual({ className: 'dark', colorScheme: 'dark' })
  })

  it('renders the light class and a light UA canvas for an explicit light theme', () => {
    // Mirrors what next-themes adds client-side (the `light` class) so the
    // class never flips on hydration.
    expect(resolveDocumentTheme('light')).toEqual({ className: 'light', colorScheme: 'light' })
  })

  it('defers the class but lets the OS pick the canvas for system theme', () => {
    // The resolved value is unknowable server-side, so we leave the class off
    // (the inline script adds it) but advertise `light dark` so the browser
    // paints the canvas from the OS preference instead of defaulting to white.
    expect(resolveDocumentTheme('system')).toEqual({
      className: undefined,
      colorScheme: 'light dark',
    })
  })
})
