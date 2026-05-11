import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { authClient } from '@/lib/client/auth-client'

const searchSchema = z.object({
  callbackUrl: z.string().optional(),
})

export const Route = createFileRoute('/auth/two-factor')({
  validateSearch: searchSchema,
  component: TwoFactorPage,
})

function TwoFactorPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [useBackup, setUseBackup] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const { error: betterErr } = useBackup
        ? await authClient.twoFactor.verifyBackupCode({ code })
        : await authClient.twoFactor.verifyTotp({ code })
      if (betterErr) throw new Error(betterErr.message ?? 'Code rejected.')
      const dest =
        search.callbackUrl && search.callbackUrl.startsWith('/') ? search.callbackUrl : '/'
      void navigate({ to: dest })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code rejected.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16 space-y-4 p-6">
      <h1 className="text-lg font-semibold">
        {useBackup ? 'Enter a backup code' : 'Two-factor code'}
      </h1>
      <p className="text-sm text-muted-foreground">
        {useBackup
          ? 'Use one of the one-time backup codes you saved during setup.'
          : 'Open your authenticator app and enter the 6-digit code.'}
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Label htmlFor="tf-input" className="sr-only">
          {useBackup ? 'Backup code' : 'Code'}
        </Label>
        <Input
          id="tf-input"
          inputMode={useBackup ? 'text' : 'numeric'}
          pattern={useBackup ? undefined : '\\d{6}'}
          maxLength={useBackup ? 16 : 6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          required
        />
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={pending || !code}>
          {pending ? 'Verifying…' : 'Continue'}
        </Button>
      </form>
      <button
        type="button"
        onClick={() => setUseBackup(!useBackup)}
        className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
      >
        {useBackup ? 'Use authenticator code instead' : 'Use a backup code instead'}
      </button>
    </div>
  )
}
