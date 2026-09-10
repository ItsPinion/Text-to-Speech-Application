import { useState, type FormEvent } from 'react'

import { ErrorMessage } from '@/components/tts/ErrorMessage'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { StatusDot } from '@/components/ui/StatusDot'
import { TerminalWindow } from '@/components/ui/TerminalWindow'
import { ApiError } from '@/services/api'
import type { AuthState } from '@/hooks/useAuth'

interface AuthPanelProps {
  auth: AuthState
}

/**
 * Phase 7 ACCESS terminal — sign in / create account. Account creation
 * auto-logins. When authed it shows the session (email + LOGOUT).
 * Passwords never persist anywhere except the server's scrypt hash.
 */
export function AuthPanel({ auth }: AuthPanelProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') await auth.login(email, password)
      else await auth.register(email, password)
      setPassword('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unexpected error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <TerminalWindow
      title="SYS://ACCESS"
      actions={<Badge variant="magenta">JWT · SCRYPT</Badge>}
      footer="TOKENS LIVE IN LOCALSTORAGE · PASSWORDS ONLY AS SERVER-SIDE SCRYPT HASHES"
    >
      {auth.user ? (
        <div className="grid gap-4">
          <p className="font-mono text-sm text-chrome">
            <span aria-hidden="true" className="text-cyan">
              &gt;{' '}
            </span>
            OPERATOR:{' '}
            <span className="text-cyan text-glow-cyan">{auth.user.email}</span>
          </p>
          <p className="font-mono text-xs uppercase tracking-widest text-chrome/50">
            SESSION ACTIVE — GENERATIONS ARE SAVED TO SYS://ARCHIVE
          </p>
          <div>
            <Button variant="outline" size="sm" onClick={auth.logout}>
              LOG OUT
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="flex gap-2" role="tablist" aria-label="Authentication mode">
            {(['login', 'register'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={mode === option}
                onClick={() => {
                  setMode(option)
                  setError(null)
                }}
                className={`px-3 py-1.5 font-mono text-xs uppercase tracking-widest transition-all duration-200 ease-linear ${
                  mode === option
                    ? 'border-2 border-cyan text-cyan shadow-glow-cyan-sm'
                    : 'border-2 border-line text-chrome/50 hover:border-cyan/40 hover:text-chrome'
                }`}
              >
                {option === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
              </button>
            ))}
          </div>

          <div>
            <label
              htmlFor="auth-email"
              className="mb-2 block font-mono text-xs uppercase tracking-widest text-chrome/60"
            >
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="operator@tts.dev"
              className="w-full border-b-2 border-magenta bg-black px-3 py-2 font-mono text-lg text-cyan transition-all duration-200 ease-linear placeholder:text-magenta/50 focus-visible:border-cyan focus-visible:shadow-glow-cyan focus-visible:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="auth-password"
              className="mb-2 block font-mono text-xs uppercase tracking-widest text-chrome/60"
            >
              Password {mode === 'register' && <span className="text-chrome/40">(MIN 8 CHARS)</span>}
            </label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="w-full border-b-2 border-magenta bg-black px-3 py-2 font-mono text-lg text-cyan transition-all duration-200 ease-linear placeholder:text-magenta/50 focus-visible:border-cyan focus-visible:shadow-glow-cyan focus-visible:outline-none"
            />
          </div>

          {error && <ErrorMessage message={error} />}

          <div className="flex items-center gap-4">
            <Button type="submit" variant="primary" size="default" disabled={busy}>
              {busy
                ? 'AUTHENTICATING…'
                : mode === 'login'
                  ? 'SIGN IN'
                  : 'CREATE & SIGN IN'}
            </Button>
            <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-chrome/50">
              <StatusDot tone="sunset" pulse={false} />
              {mode === 'login'
                ? 'SIGNING IN ENABLES SYS://ARCHIVE'
                : 'ACCOUNT CREATES ACCESS TO SYS://ARCHIVE'}
            </p>
          </div>
        </form>
      )}
    </TerminalWindow>
  )
}
