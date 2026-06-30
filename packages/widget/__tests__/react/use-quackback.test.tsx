import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRitualChain } from '../../src/react/use-ritualchain'
import RitualChain from '../../src'

describe('useRitualChain', () => {
  it('returns the RitualChain singleton', () => {
    const { result } = renderHook(() => useRitualChain())
    expect(result.current).toBe(RitualChain)
    expect(typeof result.current.open).toBe('function')
    expect(typeof result.current.identify).toBe('function')
  })
})
