import { describe, it, expect } from 'vitest'
import RitualChain, { type InitOptions } from '../src'

describe('public API', () => {
  it('exports the expected surface', () => {
    expect(typeof RitualChain.init).toBe('function')
    expect(typeof RitualChain.identify).toBe('function')
    expect(typeof RitualChain.logout).toBe('function')
    expect(typeof RitualChain.open).toBe('function')
    expect(typeof RitualChain.close).toBe('function')
    expect(typeof RitualChain.showLauncher).toBe('function')
    expect(typeof RitualChain.hideLauncher).toBe('function')
    expect(typeof RitualChain.isOpen).toBe('function')
    expect(typeof RitualChain.getUser).toBe('function')
    expect(typeof RitualChain.isIdentified).toBe('function')
    expect(typeof RitualChain.on).toBe('function')
    expect(typeof RitualChain.off).toBe('function')
    expect(typeof RitualChain.metadata).toBe('function')
    expect(typeof RitualChain.destroy).toBe('function')
  })

  it('init throws when instanceUrl is missing', () => {
    expect(() => RitualChain.init({} as InitOptions)).toThrow(/instanceUrl/)
  })
})
