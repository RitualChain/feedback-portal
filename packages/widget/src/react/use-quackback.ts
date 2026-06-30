import RitualChain from '../index'

/**
 * Returns the RitualChain singleton. Equivalent to importing it directly —
 * exists for React-idiomatic usage.
 */
export function useRitualChain(): typeof RitualChain {
  return RitualChain
}
