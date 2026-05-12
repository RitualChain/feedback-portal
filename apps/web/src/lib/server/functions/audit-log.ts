/**
 * Admin-only server function for paginated audit_log reads.
 *
 * Filters (event_type, actor_user_id, time range) compose with AND.
 * Results are ordered by occurred_at DESC and bounded by limit. We
 * request `limit + 1` rows so the caller can advertise hasMore without
 * a second count query (cheap on the (occurred_at DESC) index).
 *
 * CSV export shares the same handler — the UI just stops paginating
 * when hasMore=false and serialises the rows on the client.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { UserId } from '@quackback/ids'
import { and, auditLog, db, desc, eq, gte, lte } from '@/lib/server/db'
import type { SQL } from 'drizzle-orm'
import { requireAuth } from './auth-helpers'

type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[]

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

const listAuditEventsInput = z.object({
  eventType: z.string().optional(),
  actorUserId: z
    .string()
    .regex(/^user_/)
    .optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().positive().optional(),
})

export type AuditEventRow = {
  id: string
  occurredAt: string
  actorUserId: string | null
  actorEmail: string | null
  actorRole: string | null
  actorIp: string | null
  actorUserAgent: string | null
  eventType: string
  eventOutcome: string
  targetType: string | null
  targetId: string | null
  beforeValue: JsonValue | null
  afterValue: JsonValue | null
  metadata: JsonValue | null
}

export const listAuditEventsFn = createServerFn({ method: 'GET' })
  .inputValidator(listAuditEventsInput)
  .handler(async ({ data }) => {
    await requireAuth({ roles: ['admin'] })

    const requested = Math.min(data.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
    const lookahead = requested + 1

    const conditions: SQL[] = []
    if (data.eventType) conditions.push(eq(auditLog.eventType, data.eventType))
    if (data.actorUserId) conditions.push(eq(auditLog.actorUserId, data.actorUserId as UserId))
    if (data.from) conditions.push(gte(auditLog.occurredAt, new Date(data.from)))
    if (data.to) conditions.push(lte(auditLog.occurredAt, new Date(data.to)))

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const rows = (await db
      .select()
      .from(auditLog)
      .where(whereClause)
      .orderBy(desc(auditLog.occurredAt))
      .limit(lookahead)) as Array<Record<string, unknown>>

    const hasMore = rows.length > requested
    const visible = hasMore ? rows.slice(0, requested) : rows

    const events: AuditEventRow[] = visible.map((row) => ({
      id: String(row.id ?? ''),
      occurredAt:
        row.occurredAt instanceof Date
          ? row.occurredAt.toISOString()
          : String(row.occurredAt ?? ''),
      actorUserId: (row.actorUserId as string | null) ?? null,
      actorEmail: (row.actorEmail as string | null) ?? null,
      actorRole: (row.actorRole as string | null) ?? null,
      actorIp: (row.actorIp as string | null) ?? null,
      actorUserAgent: (row.actorUserAgent as string | null) ?? null,
      eventType: String(row.eventType ?? ''),
      eventOutcome: String(row.eventOutcome ?? ''),
      targetType: (row.targetType as string | null) ?? null,
      targetId: (row.targetId as string | null) ?? null,
      beforeValue: (row.beforeValue as JsonValue | null) ?? null,
      afterValue: (row.afterValue as JsonValue | null) ?? null,
      metadata: (row.metadata as JsonValue | null) ?? null,
    }))

    return { events, hasMore }
  })
