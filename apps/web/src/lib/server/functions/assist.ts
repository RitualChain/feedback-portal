/**
 * Server function for agent-assist "suggested resources".
 *
 * When an agent is viewing a support conversation, this surfaces the most
 * relevant help-center articles + feedback posts for the visitor's recent
 * message text. It is strictly AGENT-ONLY: gated to team roles via
 * `requireAuth({ roles: ['admin','member'] })` and re-checked against the
 * conversation via `assertConversationViewable`. The suggestions are NEVER
 * exposed to the visitor — there is no visitor-callable counterpart and the
 * result never enters the visitor DTO or SSE stream.
 *
 * The results are VIEWER-SCOPED to the conversation's VISITOR (not the agent):
 * the retriever filters to what the visitor may see, so a later "share in chat"
 * can never leak a gated post or a private article into the visitor's thread.
 */
import { z } from 'zod'
import { createServerFn } from '@tanstack/react-start'
import type { ConversationId } from '@quackback/ids'
import { requireAuth, policyActorFromAuth } from './auth-helpers'
import type { AssistResource } from '@/lib/server/domains/assist/assist-search'

/** How many suggestions the agent panel shows. */
const SUGGESTION_LIMIT = 5
/** Retrieve more than we display so the audience filter can drop gated items
 *  without starving the visible top {@link SUGGESTION_LIMIT}. */
const RETRIEVAL_LIMIT = 20

export const suggestResourcesFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ conversationId: z.string() }))
  .handler(async ({ data }): Promise<AssistResource[]> => {
    // AGENT-ONLY: team roles, re-checked independent of the route guard. A
    // visitor session can never reach the retriever or its results.
    const auth = await requireAuth({ roles: ['admin', 'member'] })
    const agentActor = await policyActorFromAuth(auth)

    const conversationId = data.conversationId as ConversationId

    const { assertConversationViewable } = await import('@/lib/server/domains/chat/chat.service')
    const conversation = await assertConversationViewable(conversationId, agentActor)

    const {
      buildVisitorActor,
      buildAssistSearchDeps,
      buildAssistViewabilityDeps,
      loadRecentVisitorText,
    } = await import('@/lib/server/domains/assist/assist-queries')
    const { searchAssistResources, filterViewableResources } =
      await import('@/lib/server/domains/assist/assist-search')

    // The visitor's recent message text is the query. Nothing said yet → no
    // suggestions (never throw for an empty/blank query).
    const query = await loadRecentVisitorText(conversationId)
    if (!query) return []

    // Resolve the VISITOR's actor server-side and scope both the search and the
    // final gate to it, so only items the visitor may see are returned.
    const visitorActor = await buildVisitorActor(conversation.visitorPrincipalId)

    const fused = await searchAssistResources(query, buildAssistSearchDeps(visitorActor), {
      limit: RETRIEVAL_LIMIT,
    })
    const viewable = await filterViewableResources(fused, buildAssistViewabilityDeps(visitorActor))

    return viewable.slice(0, SUGGESTION_LIMIT)
  })
