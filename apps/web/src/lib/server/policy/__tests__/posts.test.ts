import { describe, it, expect } from 'vitest'
import { canViewPost, canCreatePost } from '../posts'
import { ANONYMOUS_ACTOR, type Actor } from '../types'
import type { SegmentId, PrincipalId } from '@quackback/ids'
import type { BoardAudience, BoardModeration } from '@/lib/server/db'

const teamActor: Actor = {
  principalId: 'principal_team' as PrincipalId,
  role: 'admin',
  principalType: 'user',
  segmentIds: new Set(),
}

const trustedPortalActor: Actor = {
  principalId: 'principal_trusted' as PrincipalId,
  role: 'user',
  principalType: 'user',
  segmentIds: new Set(['segment_trusted' as SegmentId]),
}

const newPortalActor: Actor = {
  principalId: 'principal_new' as PrincipalId,
  role: 'user',
  principalType: 'user',
  segmentIds: new Set(),
}

const publicBoard = { audience: { kind: 'public' } as BoardAudience }
const teamBoard = { audience: { kind: 'team' } as BoardAudience }

describe('canViewPost', () => {
  it('blocks portal users on team-audience boards', () => {
    const post = { moderationState: 'published' as const }
    expect(canViewPost(newPortalActor, post, teamBoard).allowed).toBe(false)
  })

  it('hides pending posts from non-team viewers', () => {
    const post = {
      moderationState: 'pending' as const,
      principalId: 'principal_other' as PrincipalId,
    }
    expect(canViewPost(newPortalActor, post, publicBoard).allowed).toBe(false)
  })

  it('shows the author their own pending posts', () => {
    const post = {
      moderationState: 'pending' as const,
      principalId: newPortalActor.principalId,
    }
    expect(canViewPost(newPortalActor, post, publicBoard).allowed).toBe(true)
  })

  it('shows team all pending posts on viewable boards', () => {
    const post = {
      moderationState: 'pending' as const,
      principalId: 'principal_other' as PrincipalId,
    }
    expect(canViewPost(teamActor, post, publicBoard).allowed).toBe(true)
  })

  it('hides spam from non-team', () => {
    expect(
      canViewPost(
        newPortalActor,
        { moderationState: 'spam', principalId: newPortalActor.principalId },
        publicBoard
      ).allowed
    ).toBe(false)
  })
})

const requireAllModeration: BoardModeration = {
  requireApproval: 'all',
  trustedSegmentIds: [],
}
const requireAnonModeration: BoardModeration = {
  requireApproval: 'anonymous',
  trustedSegmentIds: [],
}
const trustedBypass: BoardModeration = {
  requireApproval: 'all',
  trustedSegmentIds: ['segment_trusted'],
}

describe('canCreatePost', () => {
  it('returns requiresApproval=false when moderation is none', () => {
    const decision = canCreatePost(newPortalActor, {
      audience: { kind: 'public' },
      moderation: { requireApproval: 'none', trustedSegmentIds: [] },
    })
    expect(decision.allowed).toBe(true)
    if (decision.allowed) expect(decision.requiresApproval).toBe(false)
  })

  it('flags pre-publish approval when board requires it', () => {
    const decision = canCreatePost(newPortalActor, {
      audience: { kind: 'public' },
      moderation: requireAllModeration,
    })
    expect(decision.allowed).toBe(true)
    if (decision.allowed) expect(decision.requiresApproval).toBe(true)
  })

  it('skips approval for trusted-segment members even on require-all', () => {
    const decision = canCreatePost(trustedPortalActor, {
      audience: { kind: 'public' },
      moderation: trustedBypass,
    })
    expect(decision.allowed).toBe(true)
    if (decision.allowed) expect(decision.requiresApproval).toBe(false)
  })

  it('only gates anonymous on require-anonymous', () => {
    expect(
      canCreatePost(newPortalActor, {
        audience: { kind: 'public' },
        moderation: requireAnonModeration,
      })
    ).toEqual({ allowed: true, requiresApproval: false })
    expect(
      canCreatePost(ANONYMOUS_ACTOR, {
        audience: { kind: 'public' },
        moderation: requireAnonModeration,
      })
    ).toEqual({ allowed: true, requiresApproval: true })
  })

  it('denies create when actor cannot view the board', () => {
    const decision = canCreatePost(ANONYMOUS_ACTOR, {
      audience: { kind: 'authenticated' },
      moderation: { requireApproval: 'none', trustedSegmentIds: [] },
    })
    expect(decision.allowed).toBe(false)
  })
})
