/**
 * RitualChain feedback source — auto-provisioned passive connector.
 *
 * One ritualchain source exists per deployment. Created on startup if absent.
 * All new posts (including widget-submitted) are ingested automatically
 * via the feedback_pipeline event hook on post.created.
 */

import { db, eq, feedbackSources } from '@/lib/server/db'
import { sql } from 'drizzle-orm'
import { hashCode } from '@/lib/server/utils'
import { logger } from '@/lib/server/logger'

const log = logger.child({ component: 'ritualchain-source' })

/**
 * Ensure the ritualchain feedback source exists.
 * Uses an advisory lock to prevent duplicate sources from concurrent startups.
 */
export async function ensureRitualChainFeedbackSource(): Promise<void> {
  await db.transaction(async (tx) => {
    // Advisory lock scoped to this transaction prevents concurrent creation
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${sql.raw(String(hashCode('ritualchain_feedback_source')))})`
    )

    const existing = await tx.query.feedbackSources.findFirst({
      where: eq(feedbackSources.sourceType, 'ritualchain'),
      columns: { id: true },
    })

    if (existing) {
      log.debug({ source_id: existing.id }, 'ritualchain feedback source already exists')
      return
    }

    const [legacy] = await tx
      .select({ id: feedbackSources.id })
      .from(feedbackSources)
      .where(sql`${feedbackSources.sourceType} = 'quackback'`)
      .limit(1)

    if (legacy) {
      await tx
        .update(feedbackSources)
        .set({ sourceType: 'ritualchain', name: 'RitualChain' })
        .where(eq(feedbackSources.id, legacy.id))
      log.info({ source_id: legacy.id }, 'renamed legacy quackback feedback source to ritualchain')
      return
    }

    const [created] = await tx
      .insert(feedbackSources)
      .values({
        sourceType: 'ritualchain',
        deliveryMode: 'passive',
        name: 'RitualChain',
        enabled: true,
        config: {},
      })
      .returning({ id: feedbackSources.id })

    log.info({ source_id: created.id }, 'created ritualchain feedback source')
  })
}
