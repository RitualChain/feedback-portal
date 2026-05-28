// @vitest-environment happy-dom
/**
 * <BoardAccessForm> — R3 permissions matrix.
 *
 * Covers:
 *   - Matrix is always visible (no preset-collapse)
 *   - Preset is derived from grid (no sticky state)
 *   - "Public" preset is asymmetric (view=anon, vote/comment/submit=auth)
 *   - "Private" preset locks everything to team
 *   - Custom tile is a non-interactive status indicator
 *   - Tier hierarchy: raising View auto-clamps Vote/Comment/Submit
 *   - Workspace anonymous-* feature flags block the Anyone cell + banner
 *   - Auto-bump when workspace flips off while a cell sits on Anonymous
 *   - Save payload preserves `moderation` round-trip
 *
 * The mutation, segments, and portalConfig queries are mocked. The
 * portalConfig mock is mutable so tests can flip workspace flags between
 * renders.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BoardAccessForm } from '../board-access-form'
import { DEFAULT_BOARD_ACCESS, type BoardAccess } from '@/lib/shared/db-types'
import type { BoardId } from '@quackback/ids'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    className,
  }: {
    to: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}))

const mutate = vi.fn()
vi.mock('@/lib/client/mutations', () => ({
  useUpdateBoardAccess: () => ({
    mutate,
    isPending: false,
    isError: false,
    error: null,
  }),
}))

vi.mock('@/lib/client/hooks/use-segments-queries', () => ({
  useSegments: () => ({
    data: [
      { id: 'seg_alpha', name: 'Alpha', memberCount: 3, description: 'Alpha description' },
      { id: 'seg_beta', name: 'Beta', memberCount: 0, description: null },
    ],
    isLoading: false,
    isError: false,
  }),
}))

// Mutable portal-config state — tests flip these flags via setWsFlags()
// before the render to drive workspace-ceiling behaviour. The
// `requireApproval` field powers the Moderation tab's "Inherit" sub-pill.
//
// After M1 the workspace-level toggles collapsed into a single
// `allowAnonymous` master switch (migration 0084). The per-action knobs
// here mirror the master flag so the existing tests keep their original
// intent — flipping any of them off effectively flips the master off,
// which is what BoardAccessForm now sees.
const wsFlagsState = {
  anonymousVoting: true,
  anonymousCommenting: true,
  anonymousPosting: true,
  requireApproval: 'none' as 'none' | 'anonymous' | 'authenticated' | 'all',
}
function setWsFlags(next: Partial<typeof wsFlagsState>) {
  Object.assign(wsFlagsState, next)
}

function deriveAllowAnonymous(): boolean {
  // The master switch is off if *any* of the legacy knobs is off — the
  // M1 form blocks all three rows together. Tests that flipped a single
  // legacy knob to false therefore still observe the row being disabled.
  return (
    wsFlagsState.anonymousVoting &&
    wsFlagsState.anonymousCommenting &&
    wsFlagsState.anonymousPosting
  )
}

vi.mock('@/lib/client/queries/settings', () => ({
  settingsQueries: {
    portalConfig: () => ({
      queryKey: ['settings', 'portalConfig'],
      queryFn: async () => ({
        features: {
          allowAnonymous: deriveAllowAnonymous(),
          allowEditAfterEngagement: false,
          allowDeleteAfterEngagement: false,
          showPublicEditHistory: false,
        },
        moderationDefault: { requireApproval: wsFlagsState.requireApproval },
        oauth: {},
        access: {
          visibility: 'public' as const,
          allowedDomains: [],
          widgetSignIn: false,
          allowedSegmentIds: [],
        },
      }),
    }),
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BOARD_ID = 'brd_test' as BoardId

function renderForm(access: BoardAccess = DEFAULT_BOARD_ACCESS) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <BoardAccessForm board={{ id: BOARD_ID, access }} />
    </QueryClientProvider>
  )
}

/** Click a tier cell in the matrix by action label + tier label. */
function clickTierCell(actionLabel: string, tierLabel: string) {
  const btn = screen.getByRole('button', { name: `${actionLabel}: ${tierLabel}` })
  fireEvent.click(btn)
  return btn
}

/** True iff the named matrix cell button is currently selected. */
function isCellSelected(actionLabel: string, tierLabel: string) {
  const btn = screen.getByRole('button', { name: `${actionLabel}: ${tierLabel}` })
  return btn.getAttribute('aria-pressed') === 'true'
}

/** Default-public BoardAccess matching the new "Public" preset. */
const PUBLIC_ACCESS: BoardAccess = {
  view: 'anonymous',
  vote: 'authenticated',
  comment: 'authenticated',
  submit: 'authenticated',
  segments: { view: [], vote: [], comment: [], submit: [] },
  moderation: { anonPosts: 'inherit', signedPosts: 'inherit', comments: 'inherit' },
}

beforeEach(() => {
  mutate.mockReset()
  setWsFlags({
    anonymousVoting: true,
    anonymousCommenting: true,
    anonymousPosting: true,
    requireApproval: 'none',
  })
})

// ---------------------------------------------------------------------------
// Matrix visibility
// ---------------------------------------------------------------------------

describe('<BoardAccessForm> matrix visibility', () => {
  it('matrix is always visible, even for a preset-matching board', () => {
    renderForm(PUBLIC_ACCESS)
    expect(screen.getByRole('button', { name: 'View: Anyone' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vote: Signed-in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Comment: Signed-in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit posts: Signed-in' })).toBeInTheDocument()
  })

  it('exposes all four action rows in the matrix', () => {
    renderForm(PUBLIC_ACCESS)
    // Each action × Anyone column should exist
    expect(screen.getByRole('button', { name: 'View: Anyone' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vote: Anyone' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Comment: Anyone' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit posts: Anyone' })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Presets (derived, not sticky)
// ---------------------------------------------------------------------------

describe('<BoardAccessForm> presets', () => {
  it('renders Public preset as active for asymmetric Public access', () => {
    renderForm(PUBLIC_ACCESS)
    const publicBtn = screen.getByRole('button', { name: 'Public' })
    expect(publicBtn.getAttribute('aria-pressed')).toBe('true')
  })

  it('renders Private preset as active when all four actions = team', () => {
    renderForm({
      view: 'team',
      vote: 'team',
      comment: 'team',
      submit: 'team',
      segments: { view: [], vote: [], comment: [], submit: [] },
      moderation: { anonPosts: 'inherit', signedPosts: 'inherit', comments: 'inherit' },
    })
    const privateBtn = screen.getByRole('button', { name: 'Private' })
    expect(privateBtn.getAttribute('aria-pressed')).toBe('true')
  })

  it('clicking "Public" preset applies the asymmetric shape (view=anon, others=auth)', () => {
    renderForm({
      view: 'team',
      vote: 'team',
      comment: 'team',
      submit: 'team',
      segments: { view: [], vote: [], comment: [], submit: [] },
      moderation: { anonPosts: 'inherit', signedPosts: 'inherit', comments: 'inherit' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Public' }))
    expect(isCellSelected('View', 'Anyone')).toBe(true)
    expect(isCellSelected('Vote', 'Signed-in')).toBe(true)
    expect(isCellSelected('Comment', 'Signed-in')).toBe(true)
    expect(isCellSelected('Submit posts', 'Signed-in')).toBe(true)
  })

  it('preset flips to Custom after editing a cell, and back to Public when restored', () => {
    renderForm(PUBLIC_ACCESS)
    // Start in Public
    expect(screen.getByRole('button', { name: 'Public' }).getAttribute('aria-pressed')).toBe('true')
    // Tweak Vote → Team only ⇒ Custom
    clickTierCell('Vote', 'Team only')
    expect(screen.getByRole('button', { name: 'Public' }).getAttribute('aria-pressed')).toBe(
      'false'
    )
    // Restore Vote → Signed-in ⇒ Public again
    clickTierCell('Vote', 'Signed-in')
    expect(screen.getByRole('button', { name: 'Public' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('Custom tile is non-interactive (role=status, not button)', () => {
    renderForm({
      view: 'anonymous',
      vote: 'authenticated',
      comment: 'team', // divergent ⇒ Custom
      submit: 'team',
      segments: { view: [], vote: [], comment: [], submit: [] },
      moderation: { anonPosts: 'inherit', signedPosts: 'inherit', comments: 'inherit' },
    })
    // No button labelled "Custom" — only a status element.
    expect(screen.queryByRole('button', { name: 'Custom' })).not.toBeInTheDocument()
    const status = screen.getByRole('status', { name: 'Custom' })
    expect(status).toBeInTheDocument()
    expect(status.getAttribute('aria-pressed')).toBe('true')
  })

  it('Auth-only and Team-only preset tiles are removed', () => {
    renderForm(PUBLIC_ACCESS)
    expect(screen.queryByRole('button', { name: 'Auth only' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Team only' })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Tier hierarchy
// ---------------------------------------------------------------------------

describe('<BoardAccessForm> tier hierarchy', () => {
  it('raising View tier auto-clamps Vote, Comment, and Submit', () => {
    renderForm({
      view: 'anonymous',
      vote: 'anonymous',
      comment: 'anonymous',
      submit: 'anonymous',
      segments: { view: [], vote: [], comment: [], submit: [] },
      moderation: { anonPosts: 'inherit', signedPosts: 'inherit', comments: 'inherit' },
    })
    clickTierCell('View', 'Team only')
    expect(isCellSelected('View', 'Team only')).toBe(true)
    expect(isCellSelected('Vote', 'Team only')).toBe(true)
    expect(isCellSelected('Comment', 'Team only')).toBe(true)
    expect(isCellSelected('Submit posts', 'Team only')).toBe(true)
  })

  it('disables cells below View rank on derived action rows', () => {
    renderForm({
      view: 'team',
      vote: 'team',
      comment: 'team',
      submit: 'team',
      segments: { view: [], vote: [], comment: [], submit: [] },
      moderation: { anonPosts: 'inherit', signedPosts: 'inherit', comments: 'inherit' },
    })
    expect(screen.getByRole('button', { name: 'Vote: Anyone' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Comment: Anyone' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Submit posts: Anyone' })).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Workspace ceiling
// ---------------------------------------------------------------------------

describe('<BoardAccessForm> workspace ceiling', () => {
  it('disables Anyone cell on a row whose workspace flag is off', async () => {
    setWsFlags({ anonymousVoting: false })
    renderForm({
      view: 'anonymous',
      vote: 'authenticated',
      comment: 'anonymous',
      submit: 'anonymous',
      segments: { view: [], vote: [], comment: [], submit: [] },
      moderation: { anonPosts: 'inherit', signedPosts: 'inherit', comments: 'inherit' },
    })
    await waitFor(() => {
      const voteAnon = screen.getByRole('button', { name: 'Vote: Anyone' })
      expect(voteAnon).toBeDisabled()
      expect(voteAnon.getAttribute('data-disabled-reason')).toBe('workspace')
    })
    // View row's Anyone cell is unaffected — view has no workspace ceiling.
    expect(screen.getByRole('button', { name: 'View: Anyone' })).not.toBeDisabled()
  })

  it('shows the workspace-policy banner listing each blocked action', async () => {
    setWsFlags({ anonymousVoting: false, anonymousCommenting: false })
    renderForm(PUBLIC_ACCESS)
    await waitFor(() => {
      const banner = screen.getByText(/Workspace policy disables the/i)
      expect(banner).toBeInTheDocument()
      expect(banner.textContent).toMatch(/Vote/)
      expect(banner.textContent).toMatch(/Comment/)
      expect(banner.textContent).not.toMatch(/\bView\b/)
    })
  })

  it('auto-bumps Anonymous cells when the workspace master switch is off', async () => {
    // M1: workspace anonymous toggles collapsed into a single
    // `allowAnonymous` master switch. Flipping any of the legacy mock
    // knobs off here is equivalent to flipping the master off — every
    // anonymous row auto-bumps to "Signed-in" together. M2 will reshape
    // the ceiling-check logic in BoardAccessForm itself.
    setWsFlags({ anonymousVoting: false })
    renderForm({
      view: 'anonymous',
      vote: 'anonymous',
      comment: 'anonymous',
      submit: 'anonymous',
      segments: { view: [], vote: [], comment: [], submit: [] },
      moderation: { anonPosts: 'inherit', signedPosts: 'inherit', comments: 'inherit' },
    })
    await waitFor(() => {
      expect(isCellSelected('Vote', 'Signed-in')).toBe(true)
    })
    expect(isCellSelected('Comment', 'Signed-in')).toBe(true)
    expect(isCellSelected('Submit posts', 'Signed-in')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Save / discard
// ---------------------------------------------------------------------------

describe('<BoardAccessForm> save', () => {
  it('Save dock is collapsed until form is dirty', () => {
    renderForm(PUBLIC_ACCESS)
    const region = screen.getByRole('region', { name: /save changes/i })
    expect(region.getAttribute('data-dirty')).toBeNull()
  })

  it('Save dock surfaces once the form is dirty', () => {
    renderForm(PUBLIC_ACCESS)
    clickTierCell('Comment', 'Team only')
    const region = screen.getByRole('region', { name: /save changes/i })
    expect(region.getAttribute('data-dirty')).toBe('true')
  })

  it('disables Save when any action is on Segments tier with empty list', () => {
    renderForm(PUBLIC_ACCESS)
    // Pick Segments on View — empty list ⇒ save disabled
    clickTierCell('View', 'Segments')
    const save = screen.getByRole('button', { name: /save changes/i })
    expect(save).toBeDisabled()
  })

  it('submits the BoardAccess payload preserving moderation overrides', async () => {
    renderForm({
      view: 'anonymous',
      vote: 'authenticated',
      comment: 'authenticated',
      submit: 'authenticated',
      segments: { view: [], vote: [], comment: [], submit: [] },
      // Non-default moderation values to verify the form preserves them on save.
      moderation: { anonPosts: 'on', signedPosts: 'on', comments: 'off' },
    })
    // Mark dirty by tweaking a cell.
    clickTierCell('Comment', 'Team only')
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({
        boardId: BOARD_ID,
        access: expect.objectContaining({
          comment: 'team',
          segments: expect.objectContaining({
            view: expect.any(Array),
            vote: expect.any(Array),
            comment: expect.any(Array),
            submit: expect.any(Array),
          }),
          moderation: { anonPosts: 'on', signedPosts: 'on', comments: 'off' },
        }),
      })
    )
  })

  it('Discard restores the original access', () => {
    renderForm(PUBLIC_ACCESS)
    clickTierCell('Comment', 'Team only')
    expect(isCellSelected('Comment', 'Team only')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /discard/i }))
    expect(isCellSelected('Comment', 'Signed-in')).toBe(true)
    expect(isCellSelected('Comment', 'Team only')).toBe(false)
  })

  it('clicking a preset clears stale segment selections', async () => {
    renderForm({
      view: 'segments',
      vote: 'segments',
      comment: 'segments',
      submit: 'segments',
      segments: {
        view: ['seg_alpha'],
        vote: ['seg_alpha'],
        comment: ['seg_alpha'],
        submit: ['seg_alpha'],
      },
      moderation: { anonPosts: 'inherit', signedPosts: 'inherit', comments: 'inherit' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Public' }))
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          access: expect.objectContaining({
            segments: { view: [], vote: [], comment: [], submit: [] },
          }),
        })
      )
    )
  })
})

// ---------------------------------------------------------------------------
// Moderation sub-tab (R4)
// ---------------------------------------------------------------------------

const MOD_RULE_LABELS = {
  anonPosts: 'Require approval for anonymous posts',
  signedPosts: 'Require approval for signed-in posts',
  comments: 'Require approval for new comments',
} as const

/** Switch sub-tabs. Radix Tabs activates on mouseDown, not click. */
function gotoTab(label: 'access' | 'moderation') {
  fireEvent.mouseDown(screen.getByRole('tab', { name: new RegExp(label, 'i') }))
}

describe('<BoardAccessForm> moderation tab', () => {
  it('switching to the Moderation tab renders the three rule rows', () => {
    renderForm(PUBLIC_ACCESS)
    gotoTab('moderation')
    expect(screen.getByText(MOD_RULE_LABELS.anonPosts)).toBeInTheDocument()
    expect(screen.getByText(MOD_RULE_LABELS.signedPosts)).toBeInTheDocument()
    expect(screen.getByText(MOD_RULE_LABELS.comments)).toBeInTheDocument()
  })

  it('renders the "inheriting" banner when every rule is inherit', () => {
    renderForm(PUBLIC_ACCESS)
    gotoTab('moderation')
    expect(screen.getByText(/inheriting all workspace defaults/i)).toBeInTheDocument()
    expect(screen.queryByText(/overrides/i)).not.toBeInTheDocument()
  })

  it('selecting "On" for anonPosts dirties the form and shows the Override badge', () => {
    renderForm(PUBLIC_ACCESS)
    gotoTab('moderation')
    fireEvent.click(screen.getByRole('radio', { name: `${MOD_RULE_LABELS.anonPosts}: On` }))
    expect(screen.getByText('Override')).toBeInTheDocument()
    // Banner switches to the "overrides" copy. Text is split across spans
    // — match the leaf banner div by its full textContent.
    const banners = screen.getAllByText(
      (_, el) =>
        el?.tagName === 'DIV' &&
        !!el.textContent &&
        /overrides some workspace defaults/i.test(el.textContent)
    )
    expect(banners.length).toBeGreaterThan(0)
    const region = screen.getByRole('region', { name: /save changes/i })
    expect(region.getAttribute('data-dirty')).toBe('true')
  })

  it('Inherit sub-pill reflects the workspace default ("none" → all Off)', async () => {
    setWsFlags({ requireApproval: 'none' })
    renderForm(PUBLIC_ACCESS)
    gotoTab('moderation')
    await waitFor(() => {
      const anonInherit = screen.getByRole('radio', {
        name: `${MOD_RULE_LABELS.anonPosts}: Inherit`,
      })
      expect(anonInherit.textContent).toMatch(/Off/)
    })
    const signedInherit = screen.getByRole('radio', {
      name: `${MOD_RULE_LABELS.signedPosts}: Inherit`,
    })
    expect(signedInherit.textContent).toMatch(/Off/)
    const commentsInherit = screen.getByRole('radio', {
      name: `${MOD_RULE_LABELS.comments}: Inherit`,
    })
    expect(commentsInherit.textContent).toMatch(/Off/)
  })

  it('Inherit sub-pill reflects the workspace default ("all" → all On)', async () => {
    setWsFlags({ requireApproval: 'all' })
    renderForm(PUBLIC_ACCESS)
    gotoTab('moderation')
    await waitFor(() => {
      const anonInherit = screen.getByRole('radio', {
        name: `${MOD_RULE_LABELS.anonPosts}: Inherit`,
      })
      expect(anonInherit.textContent).toMatch(/On/)
    })
    const signedInherit = screen.getByRole('radio', {
      name: `${MOD_RULE_LABELS.signedPosts}: Inherit`,
    })
    expect(signedInherit.textContent).toMatch(/On/)
    const commentsInherit = screen.getByRole('radio', {
      name: `${MOD_RULE_LABELS.comments}: Inherit`,
    })
    expect(commentsInherit.textContent).toMatch(/On/)
  })

  it('save payload includes moderation tri-state choices', async () => {
    renderForm(PUBLIC_ACCESS)
    gotoTab('moderation')
    fireEvent.click(screen.getByRole('radio', { name: `${MOD_RULE_LABELS.anonPosts}: On` }))
    fireEvent.click(screen.getByRole('radio', { name: `${MOD_RULE_LABELS.comments}: Off` }))
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({
        boardId: BOARD_ID,
        access: expect.objectContaining({
          moderation: { anonPosts: 'on', signedPosts: 'inherit', comments: 'off' },
        }),
      })
    )
  })

  it('preserves access-tab edits when switching back from Moderation', () => {
    renderForm(PUBLIC_ACCESS)
    // Make an Access-tab edit
    clickTierCell('Comment', 'Team only')
    expect(isCellSelected('Comment', 'Team only')).toBe(true)
    // Switch tabs and back — edit should still be there
    gotoTab('moderation')
    gotoTab('access')
    expect(isCellSelected('Comment', 'Team only')).toBe(true)
  })
})
