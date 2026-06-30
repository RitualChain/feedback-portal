/**
 * Per-request log context — re-exported from the shared @ritualchain/logger
 * package so the web app, @ritualchain/db and @ritualchain/email all share one
 * AsyncLocalStorage instance (and therefore one request_id/tenant_id scope).
 *
 * Server-only: the underlying module imports node:async_hooks.
 */
export { getLogContext, runWithLogContext, setLogContext, type LogContext } from '@ritualchain/logger'
