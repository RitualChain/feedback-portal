export { useRitualChainInit } from './use-init'
export type { UseRitualChainInitOptions } from './use-init'
export { useRitualChain } from './use-ritualchain'
export { useRitualChainEvent } from './use-event'

// Re-export the singleton + types so users can import everything from one subpath.
export { default as RitualChain } from '../index'
export type {
  InitOptions,
  Identity,
  OpenOptions,
  WidgetUser,
  EventName,
  EventMap,
  EventHandler,
  Unsubscribe,
} from '../types'
