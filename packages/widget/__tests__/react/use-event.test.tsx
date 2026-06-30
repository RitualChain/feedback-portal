import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { useRitualChainEvent } from '../../src/react/use-event'
import RitualChain from '../../src'

afterEach(() => vi.restoreAllMocks())

describe('useRitualChainEvent', () => {
  it('subscribes on mount and unsubscribes on unmount', () => {
    const unsub = vi.fn()
    const on = vi.spyOn(RitualChain, 'on').mockReturnValue(unsub)
    function C() {
      useRitualChainEvent('vote', () => {})
      return null
    }
    const { unmount } = render(<C />)
    expect(on).toHaveBeenCalledWith('vote', expect.any(Function))
    unmount()
    expect(unsub).toHaveBeenCalled()
  })

  it('resubscribes when the event name changes', () => {
    const unsubA = vi.fn()
    const unsubB = vi.fn()
    const on = vi.spyOn(RitualChain, 'on').mockReturnValueOnce(unsubA).mockReturnValueOnce(unsubB)
    function C({ name }: { name: 'vote' | 'post:created' }) {
      useRitualChainEvent(name, () => {})
      return null
    }
    const { rerender, unmount } = render(<C name="vote" />)
    rerender(<C name="post:created" />)
    expect(unsubA).toHaveBeenCalled()
    expect(on).toHaveBeenLastCalledWith('post:created', expect.any(Function))
    unmount()
  })
})
