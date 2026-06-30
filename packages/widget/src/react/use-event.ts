import { useEffect } from 'react'
import RitualChain from '../index'
import type { EventName, EventHandler } from '../types'

/**
 * Subscribe to a widget event for the component's lifetime. The handler
 * fires synchronously when the event is emitted.
 */
export function useRitualChainEvent<T extends EventName>(name: T, handler: EventHandler<T>): void {
  useEffect(() => {
    const unsub = RitualChain.on(name, handler)
    return unsub
  }, [name, handler])
}
