/**
 * Agent-assist hybrid retriever — pure, dependency-injected core.
 *
 * When a visitor messages a support conversation, the AGENT (never the visitor)
 * is shown the most relevant help-center articles + feedback posts. This module
 * holds the dependency-free logic: a Reciprocal-Rank-Fusion (RRF) core, the
 * corpus orchestration, and the viewer-scope gate. All DB/AI access is injected
 * (wired in assist-queries.ts), so this file unit-tests with hand-built ranked
 * lists + fakes — exactly like the embed resolver in functions/embeds.ts.
 *
 * Viewer-scoping is non-negotiable: the suggestions are filtered to what the
 * conversation's VISITOR may see, so a later "share in chat" can never leak a
 * gated post or a private article.
 */

/** A single surfaced resource: a feedback post or a help-center article. */
export interface AssistResource {
  type: 'post' | 'article'
  /** Post → the postId. Article → the article slug (categorySlug carries its parent). */
  id: string
  /** Set only for articles — the parent help-center category slug. */
  categorySlug?: string
  title: string
  snippet: string | null
  score: number
}

/** Raw post hit from a single corpus search (keyword or vector). */
export interface PostHit {
  id: string
  title: string
  snippet: string | null
}

/** Raw article hit from a single corpus search (keyword or vector). */
export interface ArticleHit {
  id: string
  categorySlug: string
  title: string
  snippet: string | null
}

/**
 * Per-corpus searches injected into {@link searchAssistResources}. Each returns
 * an ALREADY-RANKED list (best first); fusion reads position, not raw score, so
 * the heterogeneous keyword (`ts_rank`) and vector (cosine) scales never need to
 * be reconciled. Wired to the real DB/embedding infra in assist-queries.ts;
 * replaced with fakes in tests.
 */
export interface AssistSearchDeps {
  keywordPosts: (q: string, limit: number) => Promise<PostHit[]>
  vectorPosts: (q: string, limit: number) => Promise<PostHit[]>
  keywordArticles: (q: string, limit: number) => Promise<ArticleHit[]>
  vectorArticles: (q: string, limit: number) => Promise<ArticleHit[]>
}

/**
 * Viewer-scope gate injected into {@link filterViewableResources}. Each resolver
 * takes the candidate ids/slugs and returns the subset the conversation's
 * VISITOR is allowed to see — the same public/audience read gates the portal
 * uses. Wired to batched DB queries in assist-queries.ts; faked in tests.
 */
export interface AssistViewabilityDeps {
  viewablePostIds: (ids: string[]) => Promise<Set<string>>
  viewableArticleSlugs: (slugs: string[]) => Promise<Set<string>>
}

/**
 * Reciprocal Rank Fusion constant. 60 is the canonical default: it damps any
 * single list's contribution enough that an item ranked highly in TWO lists
 * outranks one ranked highly in only one.
 */
export const RRF_K = 60

/**
 * Fuse several ranked candidate lists into one ordered list via Reciprocal Rank
 * Fusion: each candidate scores `Σ 1/(k + rank)` over every list it appears in
 * (rank is 1-based). Candidates dedup by `(type,id)` — first-seen metadata wins
 * — then sort by descending fused score, capped at `limit`.
 */
export function fuseResults(rankedLists: AssistResource[][], limit: number): AssistResource[] {
  const fused = new Map<string, AssistResource>()
  for (const list of rankedLists) {
    list.forEach((item, index) => {
      const key = `${item.type}:${item.id}`
      const contribution = 1 / (RRF_K + index + 1)
      const existing = fused.get(key)
      if (existing) {
        existing.score += contribution
      } else {
        // Clone so the caller's input list isn't mutated and so the running
        // score starts from this list's contribution alone.
        fused.set(key, { ...item, score: contribution })
      }
    })
  }
  return Array.from(fused.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit))
}

function postHitToResource(hit: PostHit): AssistResource {
  return { type: 'post', id: hit.id, title: hit.title, snippet: hit.snippet, score: 0 }
}

function articleHitToResource(hit: ArticleHit): AssistResource {
  return {
    type: 'article',
    id: hit.id,
    categorySlug: hit.categorySlug,
    title: hit.title,
    snippet: hit.snippet,
    score: 0,
  }
}

/** Resolve a corpus search to [] on rejection so one failing list (e.g. the AI
 *  provider being down for the vector path) never sinks the whole retrieval. */
function settle<T>(p: Promise<T[]>): Promise<T[]> {
  return p.then(
    (r) => r,
    () => []
  )
}

/**
 * Hybrid retrieve over both corpora. Per corpus, a KEYWORD list and a VECTOR
 * list are fetched, then all four lists are fused via RRF and capped at `limit`.
 * A blank query (or non-positive limit) short-circuits to `[]` without touching
 * the deps.
 */
export async function searchAssistResources(
  query: string,
  deps: AssistSearchDeps,
  opts: { limit: number }
): Promise<AssistResource[]> {
  const q = query.trim()
  const { limit } = opts
  if (!q || limit <= 0) return []

  const [keywordPosts, vectorPosts, keywordArticles, vectorArticles] = await Promise.all([
    settle(deps.keywordPosts(q, limit)),
    settle(deps.vectorPosts(q, limit)),
    settle(deps.keywordArticles(q, limit)),
    settle(deps.vectorArticles(q, limit)),
  ])

  return fuseResults(
    [
      keywordPosts.map(postHitToResource),
      vectorPosts.map(postHitToResource),
      keywordArticles.map(articleHitToResource),
      vectorArticles.map(articleHitToResource),
    ],
    limit
  )
}

/**
 * Drop every resource the visitor may not see, preserving fused order. This is
 * the authoritative audience gate at the return boundary: even if a corpus
 * search ever over-returns, a gated post or private article can never reach the
 * agent — and therefore can never be shared into the visitor's thread.
 */
export async function filterViewableResources(
  resources: AssistResource[],
  deps: AssistViewabilityDeps
): Promise<AssistResource[]> {
  const postIds = resources.filter((r) => r.type === 'post').map((r) => r.id)
  const articleSlugs = resources.filter((r) => r.type === 'article').map((r) => r.id)

  const [allowedPosts, allowedArticles] = await Promise.all([
    postIds.length ? deps.viewablePostIds(postIds) : Promise.resolve(new Set<string>()),
    articleSlugs.length
      ? deps.viewableArticleSlugs(articleSlugs)
      : Promise.resolve(new Set<string>()),
  ])

  return resources.filter((r) =>
    r.type === 'post' ? allowedPosts.has(r.id) : allowedArticles.has(r.id)
  )
}
