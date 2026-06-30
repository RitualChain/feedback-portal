import { useEffect, useRef } from 'react'
import RitualChain from '../index'
import type { InitOptions, Identity } from '../types'

export interface UseRitualChainInitOptions extends Omit<InitOptions, 'identity'> {
  identity?: Identity
  /** Skip init while `false`. Flipping to `true` later inits on that render. */
  shouldInitialize?: boolean
  /** Defer init by N milliseconds after mount (for perf). */
  initializeDelay?: number
}

/**
 * Boots the RitualChain widget when the host component mounts, and tears it
 * down on unmount. Identity changes (by structural equality via JSON key) fire
 * a follow-up `identify` call. Other init options are captured at mount — if
 * you need to change them, call `RitualChain.destroy()` and re-mount the host.
 */
export function useRitualChainInit(options: UseRitualChainInitOptions): void {
  const { identity, shouldInitialize, initializeDelay, instanceUrl } = options
  const shouldInit = shouldInitialize !== false

  // Latest options live in a ref so the effect below can read current values
  // at startup time without adding every field to its dependency array.
  const optsRef = useRef(options)
  optsRef.current = options

  useEffect(() => {
    if (!shouldInit) return

    let cancelled = false
    let started = false

    const start = () => {
      if (cancelled) return
      started = true
      const latest = optsRef.current
      const { shouldInitialize: _s, initializeDelay: _d, ...init } = latest
      RitualChain.init(init as InitOptions)
    }

    if (initializeDelay && initializeDelay > 0) {
      const id = setTimeout(start, initializeDelay)
      return () => {
        cancelled = true
        clearTimeout(id)
        if (started) RitualChain.destroy()
      }
    }
    start()
    return () => {
      if (started) RitualChain.destroy()
    }
  }, [instanceUrl, shouldInit, initializeDelay])

  // Structural key for identity — a stable-shape object won't retrigger even
  // if the reference changes each render.
  const identityKey = identity === undefined ? null : JSON.stringify(identity)
  const identityRef = useRef(identity)
  identityRef.current = identity

  useEffect(() => {
    if (!shouldInit) return
    if (identityKey === null) return
    RitualChain.identify(identityRef.current)
  }, [identityKey, shouldInit])
}
