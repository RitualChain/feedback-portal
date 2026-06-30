import { describe, it, expect } from 'vitest'
import { getDeprecatedConfigKeys, parseRitualChainConfig, ritualchainConfigSchema } from '../schema'

describe('parseRitualChainConfig', () => {
  it('accepts a fully-populated valid config', () => {
    const result = parseRitualChainConfig({
      apiVersion: 'ritual.net/v1',
      kind: 'RitualChainConfig',
      metadata: { source: 'test' },
      spec: {
        workspace: { name: 'Acme', slug: 'acme', useCase: 'saas' },
        tierLimits: {
          maxBoards: 10,
          maxPosts: null,
          aiTokensPerMonth: 100000,
          features: { customDomain: true, integrations: false },
        },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.spec.workspace?.name).toBe('Acme')
      expect(result.data.spec.tierLimits?.maxBoards).toBe(10)
      expect(result.data.spec.tierLimits?.features?.customDomain).toBe(true)
    }
  })

  it('accepts an empty spec', () => {
    const result = parseRitualChainConfig({
      apiVersion: 'ritual.net/v1',
      kind: 'RitualChainConfig',
      spec: {},
    })
    expect(result.success).toBe(true)
  })

  it('rejects a missing apiVersion', () => {
    const result = parseRitualChainConfig({ kind: 'RitualChainConfig', spec: {} })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown apiVersion', () => {
    const result = parseRitualChainConfig({
      apiVersion: 'ritual.net/v2',
      kind: 'RitualChainConfig',
      spec: {},
    })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid useCase', () => {
    const result = parseRitualChainConfig({
      apiVersion: 'ritual.net/v1',
      kind: 'RitualChainConfig',
      spec: { workspace: { useCase: 'bogus' } },
    })
    expect(result.success).toBe(false)
  })

  it('rejects unknown top-level spec keys (no boards/posts here)', () => {
    const result = parseRitualChainConfig({
      apiVersion: 'ritual.net/v1',
      kind: 'RitualChainConfig',
      spec: { boards: [{ name: 'x' }] } as unknown,
    })
    expect(result.success).toBe(false)
  })

  it('accepts deprecated auth and features keys without treating them as schema errors', () => {
    const result = parseRitualChainConfig({
      apiVersion: 'ritual.net/v1',
      kind: 'RitualChainConfig',
      spec: {
        workspace: { name: 'Acme', slug: 'acme' },
        features: { helpCenter: true },
        auth: {
          oauth: { google: true },
          openSignup: false,
          ssoOidc: {
            enabled: true,
            discoveryUrl: 'https://idp.example.com/.well-known/openid-configuration',
            clientId: 'client-id',
          },
        },
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.spec.workspace?.name).toBe('Acme')
      expect(getDeprecatedConfigKeys(result.data.spec)).toEqual(['auth', 'features'])
    }
  })

  it('reports no deprecated keys for a modern config', () => {
    const result = parseRitualChainConfig({
      apiVersion: 'ritual.net/v1',
      kind: 'RitualChainConfig',
      spec: { workspace: { name: 'Acme' } },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(getDeprecatedConfigKeys(result.data.spec)).toEqual([])
    }
  })
})

const baseConfig = {
  apiVersion: 'ritual.net/v1' as const,
  kind: 'RitualChainConfig' as const,
  spec: {},
}

describe('tierLimits.notice', () => {
  it('accepts a full notice', () => {
    const r = ritualchainConfigSchema.safeParse({
      ...baseConfig,
      spec: {
        tierLimits: {
          maxBoards: null,
          notice: {
            label: 'Free trial',
            expiresAt: '2026-06-24T00:00:00.000Z',
            actionUrl: 'https://billing.example.com/plan',
            actionLabel: 'Choose your plan',
          },
        },
      },
    })
    expect(r.success).toBe(true)
  })

  it('accepts a label-only notice', () => {
    const r = ritualchainConfigSchema.safeParse({
      ...baseConfig,
      spec: { tierLimits: { notice: { label: 'Maintenance window' } } },
    })
    expect(r.success).toBe(true)
  })

  it('still rejects unknown keys inside tierLimits and notice', () => {
    expect(
      ritualchainConfigSchema.safeParse({
        ...baseConfig,
        spec: { tierLimits: { notice: { label: 'x', bogus: true } } },
      }).success
    ).toBe(false)
    expect(
      ritualchainConfigSchema.safeParse({
        ...baseConfig,
        spec: { tierLimits: { bogus: true } },
      }).success
    ).toBe(false)
  })
})
