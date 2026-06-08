/**
 * Unit tests for the agent-assist hybrid retriever core.
 *
 * Everything here is PURE: the fusion ranking, the corpus orchestration, and the
 * viewer-scope filter are all dependency-injected, so they exercise with
 * hand-built ranked lists + fakes and need no DB/AI (mirrors functions/embeds.ts).
 */
import { describe, it, expect } from 'vitest'
import {
  RRF_K,
  fuseResults,
  searchAssistResources,
  filterViewableResources,
  type AssistResource,
  type AssistSearchDeps,
  type AssistViewabilityDeps,
  type PostHit,
  type ArticleHit,
} from '../assist-search'

const post = (id: string): AssistResource => ({
  type: 'post',
  id,
  title: `Post ${id}`,
  snippet: null,
  score: 0,
})
const article = (id: string): AssistResource => ({
  type: 'article',
  id,
  categorySlug: 'general',
  title: `Article ${id}`,
  snippet: null,
  score: 0,
})

describe('fuseResults (Reciprocal Rank Fusion)', () => {
  it('ranks an item high in BOTH lists above one high in only one', () => {
    // list1: A then B   list2: B then C
    // B is high in both → must beat A (high in one) and C (low in one).
    const fused = fuseResults(
      [
        [post('A'), post('B')],
        [post('B'), post('C')],
      ],
      10
    )

    expect(fused.map((r) => r.id)).toEqual(['B', 'A', 'C'])
    // B = 1/(k+2) + 1/(k+1); A = 1/(k+1); C = 1/(k+2)
    const b = 1 / (RRF_K + 2) + 1 / (RRF_K + 1)
    expect(fused[0].score).toBeCloseTo(b, 10)
    expect(fused[1].score).toBeCloseTo(1 / (RRF_K + 1), 10)
  })

  it('dedups by (type,id) so a repeated candidate appears once', () => {
    const fused = fuseResults([[post('A')], [post('A')], [post('A')]], 10)
    expect(fused).toHaveLength(1)
    expect(fused[0].id).toBe('A')
    expect(fused[0].score).toBeCloseTo(3 / (RRF_K + 1), 10)
  })

  it('treats the same id under different types as distinct candidates', () => {
    const fused = fuseResults([[post('X'), article('X')]], 10)
    expect(fused).toHaveLength(2)
    expect(new Set(fused.map((r) => r.type))).toEqual(new Set(['post', 'article']))
  })

  it('caps the output at the requested limit', () => {
    const fused = fuseResults([[post('A'), post('B'), post('C'), post('D')]], 2)
    expect(fused).toHaveLength(2)
    expect(fused.map((r) => r.id)).toEqual(['A', 'B'])
  })

  it('keeps first-seen metadata on dedup', () => {
    const a1: AssistResource = { ...post('A'), title: 'First', snippet: 'keep me' }
    const a2: AssistResource = { ...post('A'), title: 'Second', snippet: 'drop me' }
    const fused = fuseResults([[a1], [a2]], 10)
    expect(fused[0].title).toBe('First')
    expect(fused[0].snippet).toBe('keep me')
  })
})

describe('searchAssistResources', () => {
  const ph = (id: string): PostHit => ({ id, title: `Post ${id}`, snippet: `snip ${id}` })
  const ah = (id: string): ArticleHit => ({
    id,
    categorySlug: 'general',
    title: `Article ${id}`,
    snippet: `snip ${id}`,
  })

  const deps = (over: Partial<AssistSearchDeps> = {}): AssistSearchDeps => ({
    keywordPosts: async () => [],
    vectorPosts: async () => [],
    keywordArticles: async () => [],
    vectorArticles: async () => [],
    ...over,
  })

  it('fuses the post AND article corpora into one ranked list', async () => {
    const results = await searchAssistResources(
      'dark mode',
      deps({
        keywordPosts: async () => [ph('P1')],
        vectorPosts: async () => [ph('P1')], // P1 in two post lists
        keywordArticles: async () => [ah('A1')], // A1 in one article list
      }),
      { limit: 10 }
    )
    // P1 (two lists) outranks A1 (one list); both corpora are present.
    expect(results.map((r) => `${r.type}:${r.id}`)).toEqual(['post:P1', 'article:A1'])
    const a1 = results.find((r) => r.id === 'A1')!
    expect(a1.type).toBe('article')
    expect(a1.categorySlug).toBe('general')
    expect(a1.snippet).toBe('snip A1')
  })

  it('respects the limit after fusion', async () => {
    const results = await searchAssistResources(
      'q',
      deps({
        keywordPosts: async () => [ph('P1'), ph('P2'), ph('P3')],
        keywordArticles: async () => [ah('A1'), ah('A2')],
      }),
      { limit: 3 }
    )
    expect(results).toHaveLength(3)
  })

  it('returns [] for a blank query without calling the corpus searches', async () => {
    let called = false
    const results = await searchAssistResources(
      '   ',
      deps({
        keywordPosts: async () => {
          called = true
          return [ph('P1')]
        },
      }),
      { limit: 5 }
    )
    expect(results).toEqual([])
    expect(called).toBe(false)
  })

  it('degrades a single failing corpus search to [] without sinking the rest', async () => {
    const results = await searchAssistResources(
      'q',
      deps({
        vectorPosts: async () => {
          throw new Error('embeddings down')
        },
        keywordPosts: async () => [ph('P1')],
      }),
      { limit: 5 }
    )
    expect(results.map((r) => r.id)).toEqual(['P1'])
  })
})

describe('filterViewableResources (viewer-scope gate)', () => {
  const deps = (postIds: string[], slugs: string[]): AssistViewabilityDeps => ({
    viewablePostIds: async () => new Set(postIds),
    viewableArticleSlugs: async () => new Set(slugs),
  })

  it('drops a post the visitor may not see', async () => {
    const filtered = await filterViewableResources(
      [post('VISIBLE'), post('GATED')],
      deps(['VISIBLE'], [])
    )
    expect(filtered.map((r) => r.id)).toEqual(['VISIBLE'])
  })

  it('drops an article under a private category', async () => {
    const filtered = await filterViewableResources(
      [article('public-slug'), article('private-slug')],
      deps([], ['public-slug'])
    )
    expect(filtered.map((r) => r.id)).toEqual(['public-slug'])
  })

  it('preserves fused order across mixed corpora', async () => {
    const filtered = await filterViewableResources(
      [post('P1'), article('A1'), post('P2'), article('A2')],
      deps(['P1', 'P2'], ['A1', 'A2'])
    )
    expect(filtered.map((r) => `${r.type}:${r.id}`)).toEqual([
      'post:P1',
      'article:A1',
      'post:P2',
      'article:A2',
    ])
  })

  it('returns [] when nothing is viewable', async () => {
    const filtered = await filterViewableResources([post('P1'), article('A1')], deps([], []))
    expect(filtered).toEqual([])
  })
})
