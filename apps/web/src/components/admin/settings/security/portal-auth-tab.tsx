import { useState, useTransition, useRef } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import {
  ArrowPathIcon,
  ArrowRightIcon,
  EnvelopeIcon,
  GlobeAltIcon,
  KeyIcon,
  ShieldCheckIcon,
  LockClosedIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { MethodRow } from '@/components/admin/settings/auth-shared/method-row'
import { OAuthProviderGrid } from '@/components/admin/settings/auth-shared/oauth-provider-grid'
import { AuthProviderCredentialsDialog } from '@/components/admin/settings/portal-auth/auth-provider-credentials-dialog'
import { PortalPrivacyDialog } from '@/components/admin/settings/portal-privacy-dialog'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { WarningBox } from '@/components/shared/warning-box'
import { AUTH_PROVIDERS } from '@/lib/shared/auth-providers'
import { updatePortalConfigFn } from '@/lib/server/functions/settings'
import { updatePortalAccessFn } from '@/lib/server/functions/portal-access'
import { listSegmentsFn } from '@/lib/server/functions/admin'
import { InvitePeopleDialog } from '@/components/admin/users/invite-people-dialog'
import { usePortalInvites } from '@/components/admin/users/use-portal-invites'
import { isPathManagedFromBootstrap } from '@/lib/client/config-file'
import { useRouteContext } from '@tanstack/react-router'
import { cn } from '@/lib/shared/utils'
import type { PortalAuthMethods, PortalConfig } from '@/lib/shared/types/settings'

interface PortalAuthTabProps {
  initialOauth: PortalAuthMethods
  credentialStatus: Record<string, boolean> & { _emailConfigured?: boolean }
  customOidcProviderTier: boolean
  portalConfig: PortalConfig
}

/**
 * Portal sign-in tab inside the unified Authentication page.
 *
 * Mirrors the previous standalone /admin/settings/portal-auth page but
 * inlined here so admins don't have to navigate to two separate places
 * to compare team vs portal config. Uses the same `<OAuthProviderGrid>`
 * the Team tab does — clicking "Configure" on any provider opens the
 * shared `AuthProviderCredentialsDialog` (one row in
 * `platform_credentials` powers both surfaces).
 *
 * Differences from the Team tab:
 *  - No SSO card (SSO is admin-only by design — IdPs typically issue
 *    one client secret per Quackback deployment, scoped to team admins
 *    rather than end users).
 *  - Magic Link defaults to off; password defaults to on.
 *  - No enforcement / bootstrap guard — portal is opt-in self-service.
 *
 * The `Sign-in Methods` card includes an explicit info row pointing
 * users to the Team tab for SSO so the absence isn't silent.
 */
// ---------------------------------------------------------------------------
// Visibility option descriptors
// ---------------------------------------------------------------------------

interface VisibilityOption {
  value: 'public' | 'private'
  label: string
  description: string
  icon: typeof LockClosedIcon
}

const VISIBILITY_OPTIONS: VisibilityOption[] = [
  {
    value: 'public',
    label: 'Public',
    description: 'Anyone can view your portal without signing in.',
    icon: GlobeAltIcon,
  },
  {
    value: 'private',
    label: 'Private',
    description: 'Only your team and the groups you authorize below.',
    icon: LockClosedIcon,
  },
]

export function PortalAuthTab({
  initialOauth,
  credentialStatus,
  customOidcProviderTier,
  portalConfig,
}: PortalAuthTabProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [oauthState, setOauthState] = useState<Record<string, boolean | undefined>>(initialOauth)

  // --- Portal visibility + allowed-domains: shared busy lock ---
  //
  // A single `accessBusy` flag covers both visibility and domain saves so
  // the two fields can never race. Refs hold the current logical values so
  // that every call to `applyAccess` reads fresh state regardless of when
  // the closure was created — no stale capture is possible.

  const currentVisibility = (portalConfig.access?.visibility ?? 'public') as 'public' | 'private'
  const [visibility, setVisibility] = useState<'public' | 'private'>(currentVisibility)
  const visibilityRef = useRef(visibility)
  visibilityRef.current = visibility

  const [allowedDomains, setAllowedDomains] = useState<string[]>(
    portalConfig.access?.allowedDomains ?? []
  )
  const allowedDomainsRef = useRef(allowedDomains)
  allowedDomainsRef.current = allowedDomains

  const [widgetSignIn, setWidgetSignIn] = useState<boolean>(
    portalConfig.access?.widgetSignIn ?? false
  )
  const widgetSignInRef = useRef(widgetSignIn)
  widgetSignInRef.current = widgetSignIn

  const [allowedSegmentIds, setAllowedSegmentIds] = useState<string[]>(
    portalConfig.access?.allowedSegmentIds ?? []
  )
  const allowedSegmentIdsRef = useRef(allowedSegmentIds)
  allowedSegmentIdsRef.current = allowedSegmentIds

  const segmentsQuery = useQuery({
    queryKey: ['admin', 'segments'] as const,
    queryFn: () => listSegmentsFn(),
    staleTime: 60_000,
  })

  const [accessBusy, setAccessBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingVisibility, setPendingVisibility] = useState<'public' | 'private' | null>(null)
  const [domainInput, setDomainInput] = useState('')
  const [domainInputError, setDomainInputError] = useState<string | null>(null)

  const isAccessBusy = accessBusy || isPending

  /**
   * Single save path for visibility, domain, and widget sign-in changes.
   *
   * The changed field is supplied explicitly by the caller; all peer fields
   * are read from their refs so stale-closure captures are impossible. This
   * ensures:
   *  - No two saves overlap (`accessBusy` gates all three controls).
   *  - No field persists a stale value: the caller owns its field, refs own
   *    the peers.
   */
  async function applyAccess(
    nextVisibility: 'public' | 'private',
    nextDomains: string[],
    nextWidgetSignIn?: boolean,
    nextSegmentIds?: string[]
  ) {
    const prevVisibility = visibilityRef.current
    const prevDomains = allowedDomainsRef.current
    const prevWidgetSignIn = widgetSignInRef.current
    const prevSegmentIds = allowedSegmentIdsRef.current
    const resolvedWidgetSignIn = nextWidgetSignIn ?? prevWidgetSignIn
    const resolvedSegmentIds = nextSegmentIds ?? prevSegmentIds

    // Optimistic update
    setVisibility(nextVisibility)
    setAllowedDomains(nextDomains)
    setWidgetSignIn(resolvedWidgetSignIn)
    setAllowedSegmentIds(resolvedSegmentIds)
    setAccessBusy(true)

    try {
      await updatePortalAccessFn({
        data: {
          visibility: nextVisibility,
          allowedDomains: nextDomains,
          widgetSignIn: resolvedWidgetSignIn,
          allowedSegmentIds: resolvedSegmentIds,
        },
      })
      startTransition(() => {
        router.invalidate()
      })
    } catch {
      // Revert all fields on error
      setVisibility(prevVisibility)
      setAllowedDomains(prevDomains)
      setWidgetSignIn(prevWidgetSignIn)
      setAllowedSegmentIds(prevSegmentIds)
    } finally {
      setAccessBusy(false)
    }
  }

  function handleVisibilitySelect(next: 'public' | 'private') {
    if (next === visibilityRef.current || isAccessBusy) return

    if (next === 'private') {
      setPendingVisibility('private')
      setDialogOpen(true)
    } else {
      // Changing to public: keep current domains (ref) alongside new visibility
      void applyAccess('public', allowedDomainsRef.current)
    }
  }

  function handleConfirmPrivate() {
    setDialogOpen(false)
    if (pendingVisibility === 'private') {
      setPendingVisibility(null)
      // Changing to private: keep current domains (ref) alongside new visibility
      void applyAccess('private', allowedDomainsRef.current)
    }
  }

  function handleCancelDialog(open: boolean) {
    if (!open) {
      setPendingVisibility(null)
    }
    setDialogOpen(open)
  }

  function handleAddDomain() {
    const raw = domainInput.trim().toLowerCase().replace(/^@/, '')
    if (!raw) return

    // Basic client-side validation matching server normalization rules
    if (raw.includes('://') || raw.includes('@') || /\s/.test(raw) || !raw.includes('.')) {
      setDomainInputError('Enter a valid domain, e.g. acme.com')
      return
    }

    if (allowedDomainsRef.current.includes(raw)) {
      setDomainInputError('Domain already in the list')
      return
    }

    setDomainInputError(null)
    setDomainInput('')
    // Keep current visibility (ref); update domains
    void applyAccess(visibilityRef.current, [...allowedDomainsRef.current, raw])
  }

  function handleRemoveDomain(domain: string) {
    // Keep current visibility (ref); update domains
    void applyAccess(
      visibilityRef.current,
      allowedDomainsRef.current.filter((d) => d !== domain)
    )
  }

  function handleDomainKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddDomain()
    }
  }

  const { managedFieldPaths = [] } =
    (useRouteContext({ from: '__root__' }) as { managedFieldPaths?: string[] }) ?? {}
  const isManaged = (path: string) => isPathManagedFromBootstrap(path, managedFieldPaths)

  const emailConfigured = credentialStatus._emailConfigured !== false
  const passwordEnabled = oauthState.password ?? true
  const magicLinkEnabled = oauthState.magicLink ?? false

  // Last-enabled-method guard. Portal has no locked-on method, so we
  // refuse to disable the only remaining one. Legacy `email` flag is
  // excluded — migration 0049 retired it in favour of magicLink.
  const enabledMethodCount = Object.entries(oauthState).filter(
    ([k, v]) => v && k !== 'email'
  ).length
  const isLastMethod = (id: string) => !!oauthState[id] && enabledMethodCount === 1

  // Gates on what's *usable* (intent flag AND credentials), not on raw
  // intent — a `google: true` flag with no saved credential renders as
  // a "Not configured" tile and isn't a working sign-in surface.
  const noPortalAuthEnabled = (() => {
    if (oauthState.password) return false
    if (oauthState.magicLink && emailConfigured) return false
    return !Object.entries(oauthState).some(([id, enabled]) => {
      if (!enabled) return false
      if (id === 'password' || id === 'magicLink' || id === 'email') return false
      return !!credentialStatus[id]
    })
  })()

  const save = async (patch: Record<string, boolean | undefined>) => {
    setSaving(true)
    try {
      await updatePortalConfigFn({ data: { oauth: patch } })
      startTransition(() => router.invalidate())
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = (id: string, checked: boolean) => {
    setOauthState((prev) => ({ ...prev, [id]: checked }))
    void save({ [id]: checked })
  }

  const [configDialog, setConfigDialog] = useState<{
    credentialType: string
    providerId: string
    providerName: string
    helpUrl?: string
    fields: (typeof AUTH_PROVIDERS)[number]['platformCredentials']
  } | null>(null)

  const openConfigDialog = (provider: (typeof AUTH_PROVIDERS)[number]) => {
    const helpUrl = provider.platformCredentials.find((f) => f.helpUrl)?.helpUrl
    setConfigDialog({
      credentialType: provider.credentialType,
      providerId: provider.id,
      providerName: provider.name,
      helpUrl,
      fields: provider.platformCredentials,
    })
  }

  return (
    <div className="space-y-6">
      {/* ────────────── ACCESS group ────────────── */}
      <SectionHeader label="Access" />

      {/* Portal visibility — sole purpose is the public/private switch. The
          four authorization channels each get their own SettingsCard below
          (only when Private) so each one stands on its own. */}
      <SettingsCard title="Portal visibility" description="Choose who can view your portal.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {VISIBILITY_OPTIONS.map((option) => {
            const isSelected = visibility === option.value
            const Icon = option.icon
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleVisibilitySelect(option.value)}
                disabled={isAccessBusy}
                className={cn(
                  'relative flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border/50 bg-card hover:border-border hover:bg-muted/30',
                  isAccessBusy && 'cursor-not-allowed opacity-60'
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0',
                      isSelected ? 'text-primary' : 'text-muted-foreground'
                    )}
                  />
                  <span className="text-sm font-medium">{option.label}</span>
                  {accessBusy && isSelected && (
                    <ArrowPathIcon className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </button>
            )
          })}
        </div>

        {/* Lives inside the visibility card, directly under the toggles, so
            the team-always-has-access reassurance appears at the exact moment
            an admin picks Private — not as a floating note between cards. */}
        {visibility === 'private' && (
          <p className="mt-4 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Your team always has access.</span> Use
            the cards below to authorize additional visitors.
          </p>
        )}
      </SettingsCard>

      {/* The authorization channels — each a peer card of Portal visibility,
          only shown when Private is selected. Public mode collapses all four
          since they only ever affect non-team visitors on a private portal. */}
      {visibility === 'private' && (
        <>
          <SettingsCard
            title="Allowed email domains"
            description="Anyone signed in with a verified email on these domains can view the portal. Users verify their address by clicking the link in the verification email we send on sign-up."
          >
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    value={domainInput}
                    onChange={(e) => {
                      setDomainInput(e.target.value)
                      if (domainInputError) setDomainInputError(null)
                    }}
                    onKeyDown={handleDomainKeyDown}
                    placeholder="acme.com"
                    disabled={isAccessBusy}
                    aria-label="Add email domain"
                    aria-invalid={!!domainInputError}
                    className={cn(domainInputError && 'border-destructive')}
                  />
                  {domainInputError && (
                    <p className="mt-1 text-xs text-destructive">{domainInputError}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddDomain}
                  disabled={!domainInput.trim() || isAccessBusy}
                  className="h-9 shrink-0"
                >
                  <PlusIcon className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
                {accessBusy && (
                  <div className="flex items-center">
                    <ArrowPathIcon className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>

              {allowedDomains.length > 0 ? (
                <ul className="space-y-1.5" role="list" aria-label="Allowed domains">
                  {allowedDomains.map((domain) => (
                    <li
                      key={domain}
                      className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-3 py-1.5"
                    >
                      <span className="text-sm font-mono">{domain}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveDomain(domain)}
                        disabled={isAccessBusy}
                        className="ml-2 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 transition-colors"
                        aria-label={`Remove ${domain}`}
                      >
                        <XMarkIcon className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No domains added — add one to grant access to everyone with a verified address at
                  that domain.
                </p>
              )}
            </div>
          </SettingsCard>

          <PortalInvitesSection />

          <SettingsCard
            title="Allowed segments"
            description="Members of these segments can view the portal. Segments are defined on the People page."
          >
            {segmentsQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading segments…</p>
            ) : segmentsQuery.isError ? (
              <p className="text-xs text-destructive">
                Could not load segments. Reload the page to try again.
              </p>
            ) : (segmentsQuery.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No segments defined yet. Create segments on the People page.
              </p>
            ) : (
              <div className="space-y-3">
                <SegmentMultiSelect
                  segments={segmentsQuery.data ?? []}
                  value={allowedSegmentIds}
                  onChange={(next) => {
                    void applyAccess(
                      visibilityRef.current,
                      allowedDomainsRef.current,
                      widgetSignInRef.current,
                      next
                    )
                  }}
                  disabled={isAccessBusy}
                />
                {allowedSegmentIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Members of {allowedSegmentIds.length} selected segment
                    {allowedSegmentIds.length === 1 ? '' : 's'} can access this portal.
                  </p>
                )}
              </div>
            )}
          </SettingsCard>

          <SettingsCard
            title="Widget sign-in"
            description="Allow users authenticated through the widget (in verified-identity mode) to view this portal."
            action={
              <Switch
                id="widget-signin-toggle"
                checked={widgetSignIn}
                onCheckedChange={(checked) => {
                  void applyAccess(visibilityRef.current, allowedDomainsRef.current, checked)
                }}
                disabled={isAccessBusy}
                aria-label="Allow widget-authenticated users to access the portal"
              />
            }
          >
            <p className="text-xs text-muted-foreground">
              When enabled, widget users see a &ldquo;Go to portal&rdquo; link to continue in the
              full portal — useful if you want a single source of truth across the widget and the
              portal.
            </p>
          </SettingsCard>
        </>
      )}

      <PortalPrivacyDialog
        open={dialogOpen}
        onOpenChange={handleCancelDialog}
        onConfirm={handleConfirmPrivate}
      />

      {/* ────────────── SIGN-IN group ──────────────
          Section break + boundary helper. The cards below control HOW
          authorized visitors authenticate; the cards in the Access group
          above decide WHO is allowed in. Calling the boundary out once,
          here, replaces the per-card 'this doesn't bypass access' notes
          that would otherwise have to repeat on three separate cards. */}
      <SectionHeader
        label="Sign-in"
        helper="How authorized visitors prove who they are. Access is still gated by the rules above."
      />

      {noPortalAuthEnabled && (
        <WarningBox
          variant="warning"
          title="No portal sign-in enabled"
          description={
            <>
              Visitors can&apos;t sign in or sign up on your portal. Your team can still sign in at{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-[0.85em]">/admin</code>.
            </>
          }
        />
      )}

      {/* Card — Sign-in Methods */}
      <div className="rounded-xl border border-border/50 bg-card shadow-sm">
        <div className="px-6 py-4 border-b border-border/50">
          <h2 className="text-base font-semibold">Sign-in methods</h2>
          <p className="text-xs text-muted-foreground mt-1">
            How visitors sign in to your public feedback portal.
          </p>
        </div>
        <div className="p-6 space-y-4">
          <MethodRow
            icon={KeyIcon}
            label="Password"
            description="Sign in with email and password."
            checked={passwordEnabled}
            onCheckedChange={(v) => handleToggle('password', v)}
            disabled={
              saving ||
              isPending ||
              isManaged('portalConfig.oauth.password') ||
              (passwordEnabled && enabledMethodCount === 1)
            }
            badge={isManaged('portalConfig.oauth.password') ? 'Managed' : undefined}
            badgeTooltip={
              isManaged('portalConfig.oauth.password')
                ? 'Managed by your configuration file.'
                : undefined
            }
          />
          <MethodRow
            icon={EnvelopeIcon}
            label="Email magic link"
            description={
              emailConfigured
                ? 'One-click link or 6-digit code by email.'
                : 'Configure SMTP or Resend to enable email delivery.'
            }
            checked={magicLinkEnabled}
            onCheckedChange={(v) => handleToggle('magicLink', v)}
            disabled={
              saving ||
              isPending ||
              !emailConfigured ||
              isManaged('portalConfig.oauth.magicLink') ||
              (magicLinkEnabled && enabledMethodCount === 1)
            }
          />
        </div>
      </div>

      {/* Card — OAuth Providers (portal-side toggles) */}
      <div className="rounded-xl border border-border/50 bg-card shadow-sm">
        <div className="px-6 py-4 border-b border-border/50">
          <h2 className="text-base font-semibold">Social sign-in</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Let visitors sign in with Google, GitHub, and more.
            {visibility === 'private' && (
              <> Signing in with these providers doesn&apos;t bypass the access rules above.</>
            )}
          </p>
        </div>
        <div className="p-6">
          <OAuthProviderGrid
            enabled={oauthState}
            credentialStatus={credentialStatus}
            isLastMethod={isLastMethod}
            isManaged={(id) => isManaged(`portalConfig.oauth.${id}`)}
            saving={saving || isPending}
            onToggle={handleToggle}
            onConfigure={openConfigDialog}
            excludeProviderIds={['custom-oidc']}
          />
        </div>
      </div>

      {/* Card — Custom OIDC (own surface; not in the social grid) */}
      <CustomOidcCard
        configured={!!credentialStatus['custom-oidc']}
        enabled={!!oauthState['custom-oidc']}
        managed={isManaged('portalConfig.oauth.custom-oidc')}
        lastMethod={isLastMethod('custom-oidc')}
        tierEnabled={customOidcProviderTier}
        saving={saving || isPending}
        onToggle={(v) => handleToggle('custom-oidc', v)}
        onConfigure={() => {
          // Look up by provider id (not credentialType — that's what
          // `getAuthProvider(...)` takes). Inline lookup avoids the wrong
          // helper.
          const provider = AUTH_PROVIDERS.find((p) => p.id === 'custom-oidc')
          if (provider) openConfigDialog(provider)
        }}
      />

      {(saving || isPending) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowPathIcon className="h-4 w-4 animate-spin" />
          <span>Saving…</span>
        </div>
      )}

      {configDialog && (
        <AuthProviderCredentialsDialog
          credentialType={configDialog.credentialType}
          providerId={configDialog.providerId}
          providerName={configDialog.providerName}
          helpUrl={configDialog.helpUrl}
          fields={configDialog.fields}
          open={!!configDialog}
          onOpenChange={(open) => !open && setConfigDialog(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SegmentMultiSelect
// ---------------------------------------------------------------------------

interface SegmentItem {
  id: string
  name: string
  memberCount?: number
}

interface SegmentMultiSelectProps {
  segments: SegmentItem[]
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}

/**
 * Inline multi-select for segments — rendered as a list of checkboxes
 * with segment names and optional member counts.
 */
function SegmentMultiSelect({ segments, value, onChange, disabled }: SegmentMultiSelectProps) {
  const selected = new Set(value)

  function toggle(id: string) {
    if (disabled) return
    const next = selected.has(id) ? value.filter((s) => s !== id) : [...value, id]
    onChange(next)
  }

  return (
    <ul className="space-y-1.5" role="list" aria-label="Segment allowlist">
      {segments.map((seg) => {
        const checked = selected.has(seg.id)
        return (
          <li key={seg.id}>
            <label
              className={cn(
                'flex items-center gap-2.5 rounded-md border px-3 py-2 cursor-pointer transition-colors',
                checked
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border/50 bg-muted/20 hover:bg-muted/40',
                disabled && 'cursor-not-allowed opacity-60'
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(seg.id)}
                disabled={disabled}
                className="h-3.5 w-3.5 rounded border-border accent-primary"
              />
              <span className="flex-1 text-sm">{seg.name}</span>
              {seg.memberCount !== undefined && (
                <span className="text-xs text-muted-foreground">
                  {seg.memberCount} member{seg.memberCount === 1 ? '' : 's'}
                </span>
              )}
            </label>
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// PortalInvitesSection
// ---------------------------------------------------------------------------

/**
 * Compact summary of portal invitations rendered inside the Portal Visibility
 * card. The full list (resend / revoke / copy-link / status filter) lives on
 * /admin/users?invites=pending — this section just shows counts and CTAs:
 *  - [+ Invite people] opens the same dialog that the Invitations view uses
 *  - [Manage invites →] deep-links to the full management view
 *
 * Keeping send-in-place + manage-elsewhere means an admin who just wants to
 * fire off invitations doesn't have to leave the Portal settings page, while
 * the cluttered per-row controls live in their natural home next to People.
 */
function PortalInvitesSection() {
  const portal = usePortalInvites()
  const totalCount = portal.invites.length

  return (
    <SettingsCard
      title="Email invites"
      description="Invite specific people by email. They'll get a magic link to sign in and access the portal."
      action={
        <Button type="button" size="sm" variant="outline" onClick={portal.openDialog}>
          <PlusIcon className="mr-1.5 h-3.5 w-3.5" />
          Invite people
        </Button>
      }
    >
      <div className="space-y-3">
        <InviteSummary
          loading={portal.isLoading}
          totalCount={totalCount}
          pendingCount={portal.pendingCount}
          acceptedCount={portal.acceptedCount}
        />

        {/* Inline success summary after a send — modal closes, this fades. */}
        {portal.lastSentSummary && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400" role="status">
            {portal.lastSentSummary}
          </p>
        )}
      </div>

      <InvitePeopleDialog
        open={portal.dialogOpen}
        onOpenChange={portal.onOpenChange}
        emailsInput={portal.emailsInput}
        messageInput={portal.messageInput}
        emailError={portal.emailError}
        batchResults={portal.batchResults}
        sendBusy={portal.sendBusy}
        onEmailsChange={portal.onEmailsChange}
        onMessageChange={portal.onMessageChange}
        onSend={portal.onSend}
      />
    </SettingsCard>
  )
}

/**
 * One-line summary + Manage link. Splits the load state and the populated
 * state so the layout doesn't jitter once counts arrive.
 */
function InviteSummary({
  loading,
  totalCount,
  pendingCount,
  acceptedCount,
}: {
  loading: boolean
  totalCount: number
  pendingCount: number
  acceptedCount: number
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
        <span>Loading invites…</span>
      </div>
    )
  }

  if (totalCount === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No invites sent yet — use Invite people to send the first one.
      </p>
    )
  }

  const summary = [
    pendingCount > 0 ? `${pendingCount} pending` : null,
    acceptedCount > 0 ? `${acceptedCount} accepted` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">{summary || `${totalCount} invites`}</p>
      <Link
        to="/admin/users"
        search={{ invites: 'pending' as const }}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-4"
      >
        Manage invites
        <ArrowRightIcon className="h-3 w-3" />
      </Link>
    </div>
  )
}

interface CustomOidcCardProps {
  configured: boolean
  enabled: boolean
  managed: boolean
  lastMethod: boolean
  tierEnabled: boolean
  saving: boolean
  onToggle: (next: boolean) => void
  onConfigure: () => void
}

/**
 * Dedicated card for custom OIDC. Separated from the alphabetical social
 * grid because bring-your-own-IdP is a different shape of setup than a
 * social tile — there's a discovery URL, a client secret, and tier gating
 * to surface. Splitting Social vs Enterprise SSO into distinct sections
 * follows the same convention used across most auth-focused admin UIs.
 *
 * Three states drive the layout, in priority order:
 *  - `!tierEnabled`: tier-locked. Lock badge + upgrade hint; Configure is
 *    disabled, no toggle (nothing to toggle into).
 *  - `!configured`: no credentials yet. Primary "Set up" CTA, no toggle.
 *  - `configured`: outlined Edit button + the enable switch, mirroring
 *    the "configured" half of the social grid tiles.
 */
function CustomOidcCard({
  configured,
  enabled,
  managed,
  lastMethod,
  tierEnabled,
  saving,
  onToggle,
  onConfigure,
}: CustomOidcCardProps) {
  const headerBadge = (() => {
    if (!tierEnabled) {
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          <LockClosedIcon className="mr-1 h-2.5 w-2.5" />
          Higher tier
        </Badge>
      )
    }
    if (!configured) return null
    if (enabled) {
      return (
        <Badge
          variant="outline"
          className="border-green-500/30 text-green-600 text-[10px] px-1.5 py-0"
        >
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-600" />
          Active
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
        Configured
      </Badge>
    )
  })()

  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm">
      <div className="flex items-start gap-4 p-6">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            tierEnabled ? 'bg-violet-600/10' : 'bg-muted'
          )}
        >
          <ShieldCheckIcon
            className={cn('h-5 w-5', tierEnabled ? 'text-violet-600' : 'text-muted-foreground/60')}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">Custom identity provider</h2>
            {headerBadge}
          </div>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Let portal users sign in via your own IdP. Works with any OpenID Connect provider —
            Okta, Azure AD, Auth0, Keycloak, and more.
          </p>

          {!tierEnabled ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Available on plans with the custom OIDC feature.
            </p>
          ) : !configured ? (
            <div className="mt-4">
              <Button
                type="button"
                size="sm"
                onClick={onConfigure}
                disabled={managed}
                className="h-9"
              >
                Set up custom OIDC
              </Button>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onConfigure}
                disabled={managed}
                className="h-9"
              >
                Edit configuration
              </Button>
              {managed && (
                <span className="text-xs text-muted-foreground">
                  Managed by your configuration file.
                </span>
              )}
            </div>
          )}
        </div>
        {tierEnabled && configured && (
          <div className="shrink-0">
            <Switch
              id="custom-oidc-toggle"
              checked={enabled}
              onCheckedChange={onToggle}
              disabled={saving || managed || lastMethod}
              aria-label="Enable custom OIDC for the portal"
            />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Sub-section header for the Portal tab, used to split the page into
 * 'Access' (authorization) and 'Sign-in' (authentication) groups. Renders
 * as small-caps text with an optional one-line helper underneath — matches
 * the visual weight of the SEGMENTS subheader on /admin/users.
 *
 * Kept in-file rather than promoted to /components/ui because this is the
 * only Settings page that currently splits cards into sub-sections; the
 * pattern can be extracted if a second consumer appears.
 */
function SectionHeader({ label, helper }: { label: string; helper?: string }) {
  return (
    <div className="pt-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </h3>
      {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
    </div>
  )
}
