/**
 * Real-infra wiring for the agent-assist retriever.
 *
 * Implements the injected {@link AssistSearchDeps} (keyword + vector search over
 * each corpus) and {@link AssistViewabilityDeps} (the visitor audience gate)
 * against the live DB + embedding services. The pure fusion/orchestration lives
 * in assist-search.ts; this module is the only part that touches Postgres or the
 * AI provider.
 *
 * Corpus searches:
 *   - posts keyword  → `websearch_to_tsquery` over the GIN-indexed
 *     `posts.search_vector` generated column, cross-board.
 *   - posts vector   → cosine over `posts.embedding`. NOTE: the existing
 *     `findSimilarPostsByText` is board-scoped (it filters to one boardId), but
 *     a support conversation isn't tied to a board, so we reuse its building
 *     block `generateEmbedding` + the same cosine pattern across all boards.
 *   - articles       → `help-center-search.service` already combines keyword +
 *     vector into ONE hybrid list and exposes no split keyword/vector exports,
 *     so we issue the two article lists here directly against the same public
 *     read predicate (published + public category) that `getPublicArticleBySlug`
 *     enforces. Both the GIN tsvector index and the pgvector column already
 *     exist — no new index is introduced.
 *
 * Audience scoping: every post path is filtered with `postViewFilter(actor)` —
 * the exact predicate the public post list uses — and every article path with
 * the public help-center read predicate, so only items the visitor may see are
 * ever returned.
 */
import {
  db,
  posts,
  boards,
  principal,
  chatMessages,
  helpCenterArticles,
  helpCenterCategories,
  and,
  eq,
  isNull,
  isNotNull,
  inArray,
  lte,
  desc,
  sql,
} from '@/lib/server/db'
import type { PostId, PrincipalId, ConversationId } from '@quackback/ids'
import { postViewFilter } from '@/lib/server/policy'
import {
  ANONYMOUS_ACTOR,
  type Actor,
  type PrincipalType,
  type Role,
} from '@/lib/server/policy/types'
import { segmentIdsForPrincipal } from '@/lib/server/domains/segments/segment-membership.service'
import { generateEmbedding } from '@/lib/server/domains/embeddings/embedding.service'
import { generateKbEmbedding } from '@/lib/server/domains/help-center/help-center-embedding.service'
import { contentPreview } from '@/lib/shared/utils/string'
import type { AssistSearchDeps, AssistViewabilityDeps, PostHit, ArticleHit } from './assist-search'

/** Cosine-similarity floors keep clearly-unrelated vector hits out of the
 *  candidate pool (every row has an embedding, so an unfiltered vector search
 *  always returns `limit` rows however weak the match). The post floor mirrors
 *  the merge-suggestion precedent; the article floor mirrors the help-center
 *  hybrid search. */
const POST_VECTOR_MIN_SIMILARITY = 0.3
const ARTICLE_VECTOR_MIN_SIMILARITY = 0.5

/** How many recent visitor messages to concatenate into the retrieval query. A
 *  single short message ("it crashed") retrieves poorly; the last few give the
 *  fusion more signal without dragging in stale topics. */
const VISITOR_MESSAGE_WINDOW = 3

const SNIPPET_LENGTH = 160

function snippetOf(text: string | null | undefined): string | null {
  if (!text) return null
  return contentPreview(text, SNIPPET_LENGTH) || null
}

function vectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

// ---------------------------------------------------------------------------
// Post corpus
// ---------------------------------------------------------------------------

async function keywordPostHits(actor: Actor, query: string, limit: number): Promise<PostHit[]> {
  const tsQuery = sql`websearch_to_tsquery('english', ${query})`
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      content: posts.content,
    })
    .from(posts)
    .innerJoin(boards, eq(posts.boardId, boards.id))
    .where(
      and(
        isNull(posts.deletedAt),
        isNull(boards.deletedAt),
        // Skip posts merged into a canonical — the canonical is the shareable one.
        isNull(posts.canonicalPostId),
        // Visitor audience gate (same predicate the public post list uses).
        postViewFilter(actor),
        sql`${posts.searchVector} @@ ${tsQuery}`
      )
    )
    .orderBy(desc(sql`ts_rank(${posts.searchVector}, ${tsQuery})`))
    .limit(limit)

  return rows.map((r) => ({ id: String(r.id), title: r.title, snippet: snippetOf(r.content) }))
}

async function vectorPostHits(actor: Actor, query: string, limit: number): Promise<PostHit[]> {
  const embedding = await generateEmbedding(query)
  if (!embedding) return []
  const vec = vectorLiteral(embedding)

  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      content: posts.content,
    })
    .from(posts)
    .innerJoin(boards, eq(posts.boardId, boards.id))
    .where(
      and(
        isNull(posts.deletedAt),
        isNull(boards.deletedAt),
        isNull(posts.canonicalPostId),
        isNotNull(posts.embedding),
        postViewFilter(actor),
        sql`1 - (${posts.embedding} <=> ${vec}::vector) >= ${POST_VECTOR_MIN_SIMILARITY}`
      )
    )
    .orderBy(desc(sql`1 - (${posts.embedding} <=> ${vec}::vector)`))
    .limit(limit)

  return rows.map((r) => ({ id: String(r.id), title: r.title, snippet: snippetOf(r.content) }))
}

// ---------------------------------------------------------------------------
// Article corpus
// ---------------------------------------------------------------------------

/** The public help-center read predicate: published, not future-scheduled, not
 *  deleted, under a non-deleted PUBLIC category. Mirrors `getPublicArticleBySlug`
 *  + the help-center hybrid search so a slug can't be surfaced here when a direct
 *  public lookup would deny it. */
function publicArticleConditions() {
  return [
    isNotNull(helpCenterArticles.publishedAt),
    lte(helpCenterArticles.publishedAt, new Date()),
    isNull(helpCenterArticles.deletedAt),
    isNull(helpCenterCategories.deletedAt),
    eq(helpCenterCategories.isPublic, true),
  ]
}

async function keywordArticleHits(query: string, limit: number): Promise<ArticleHit[]> {
  const tsQuery = sql`websearch_to_tsquery('english', ${query})`
  const rows = await db
    .select({
      slug: helpCenterArticles.slug,
      title: helpCenterArticles.title,
      description: helpCenterArticles.description,
      content: helpCenterArticles.content,
      categorySlug: helpCenterCategories.slug,
    })
    .from(helpCenterArticles)
    .innerJoin(helpCenterCategories, eq(helpCenterArticles.categoryId, helpCenterCategories.id))
    .where(and(...publicArticleConditions(), sql`${helpCenterArticles.searchVector} @@ ${tsQuery}`))
    .orderBy(desc(sql`ts_rank(${helpCenterArticles.searchVector}, ${tsQuery})`))
    .limit(limit)

  return rows.map((r) => ({
    id: r.slug,
    categorySlug: r.categorySlug,
    title: r.title,
    snippet: snippetOf(r.description || r.content),
  }))
}

async function vectorArticleHits(query: string, limit: number): Promise<ArticleHit[]> {
  const embedding = await generateKbEmbedding(query)
  if (!embedding) return []
  const vec = vectorLiteral(embedding)

  const rows = await db
    .select({
      slug: helpCenterArticles.slug,
      title: helpCenterArticles.title,
      description: helpCenterArticles.description,
      content: helpCenterArticles.content,
      categorySlug: helpCenterCategories.slug,
    })
    .from(helpCenterArticles)
    .innerJoin(helpCenterCategories, eq(helpCenterArticles.categoryId, helpCenterCategories.id))
    .where(
      and(
        ...publicArticleConditions(),
        isNotNull(helpCenterArticles.embedding),
        sql`1 - (${helpCenterArticles.embedding} <=> ${vec}::vector) >= ${ARTICLE_VECTOR_MIN_SIMILARITY}`
      )
    )
    .orderBy(desc(sql`1 - (${helpCenterArticles.embedding} <=> ${vec}::vector)`))
    .limit(limit)

  return rows.map((r) => ({
    id: r.slug,
    categorySlug: r.categorySlug,
    title: r.title,
    snippet: snippetOf(r.description || r.content),
  }))
}

// ---------------------------------------------------------------------------
// Viewer-scope gate (batched re-check at the return boundary)
// ---------------------------------------------------------------------------

async function viewablePostIds(actor: Actor, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await db
    .select({ id: posts.id })
    .from(posts)
    .innerJoin(boards, eq(posts.boardId, boards.id))
    .where(
      and(
        inArray(posts.id, ids as PostId[]),
        isNull(posts.deletedAt),
        isNull(boards.deletedAt),
        isNull(posts.canonicalPostId),
        postViewFilter(actor)
      )
    )
  return new Set(rows.map((r) => String(r.id)))
}

async function viewableArticleSlugs(slugs: string[]): Promise<Set<string>> {
  if (slugs.length === 0) return new Set()
  const rows = await db
    .select({ slug: helpCenterArticles.slug })
    .from(helpCenterArticles)
    .innerJoin(helpCenterCategories, eq(helpCenterArticles.categoryId, helpCenterCategories.id))
    .where(and(inArray(helpCenterArticles.slug, slugs), ...publicArticleConditions()))
  return new Set(rows.map((r) => r.slug))
}

// ---------------------------------------------------------------------------
// Public builders consumed by the agent-only server fn
// ---------------------------------------------------------------------------

function normalizePrincipalType(raw: string | null | undefined): PrincipalType {
  if (raw === 'service') return 'service'
  if (raw === 'anonymous') return 'anonymous'
  return 'user'
}

/**
 * Build the policy {@link Actor} for the conversation's VISITOR, resolved
 * server-side from the stored `visitorPrincipalId` (the viewer here is the
 * visitor, not the request's agent caller — mirror of how getEmbedPreviewFn
 * resolves a viewer actor, but pinned to the visitor). A missing principal
 * degrades to the anonymous actor (sees only fully public content).
 */
export async function buildVisitorActor(visitorPrincipalId: PrincipalId): Promise<Actor> {
  const row = await db.query.principal.findFirst({
    where: eq(principal.id, visitorPrincipalId),
    columns: { role: true, type: true },
  })
  if (!row) return ANONYMOUS_ACTOR
  const segmentIds = await segmentIdsForPrincipal(visitorPrincipalId)
  return {
    principalId: visitorPrincipalId,
    role: (row.role as Role | null) ?? null,
    principalType: normalizePrincipalType(row.type),
    segmentIds,
  }
}

/** Concatenate the latest visitor messages (newest first) into a retrieval
 *  query. Internal notes and deleted messages are excluded. Empty when the
 *  visitor hasn't said anything yet. */
export async function loadRecentVisitorText(
  conversationId: ConversationId,
  window = VISITOR_MESSAGE_WINDOW
): Promise<string> {
  const rows = await db
    .select({ content: chatMessages.content })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.conversationId, conversationId),
        eq(chatMessages.senderType, 'visitor'),
        isNull(chatMessages.deletedAt),
        eq(chatMessages.isInternal, false)
      )
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(window)

  return rows
    .map((r) => r.content?.trim())
    .filter((c): c is string => !!c)
    .join('\n')
    .trim()
}

/** Wire the four corpus searches to the live infra, viewer-scoped to the
 *  visitor (the post paths gate on `postViewFilter(visitorActor)`). */
export function buildAssistSearchDeps(visitorActor: Actor): AssistSearchDeps {
  return {
    keywordPosts: (q, limit) => keywordPostHits(visitorActor, q, limit),
    vectorPosts: (q, limit) => vectorPostHits(visitorActor, q, limit),
    keywordArticles: (q, limit) => keywordArticleHits(q, limit),
    vectorArticles: (q, limit) => vectorArticleHits(q, limit),
  }
}

/** Wire the authoritative audience gate to the live infra. */
export function buildAssistViewabilityDeps(visitorActor: Actor): AssistViewabilityDeps {
  return {
    viewablePostIds: (ids) => viewablePostIds(visitorActor, ids),
    viewableArticleSlugs: (slugs) => viewableArticleSlugs(slugs),
  }
}
