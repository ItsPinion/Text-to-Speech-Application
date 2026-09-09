import { useState } from 'react';

/**
 * AuthPanel (Phase 7) — login/register when signed out; identity + logout
 * when signed in. Errors render inline (no alerts).
 */
export default function AuthPanel({ user, onLogin, onLogout }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (user) {
    return (
      <div className="auth-panel panel" aria-label="Account">
        <div className="auth-signed-in">
          <span>
            👤 <strong>{user.email}</strong>
          </span>
          <button type="button" className="clear-btn" onClick={onLogout}>
            Sign out
          </button>
        </div>
        <p className="muted small">Your generations are saved to history · favorite voices with ★</p>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onLogin(mode, email.trim(), password);
      setEmail('');
      setPassword('');
    } catch (err) {
      setError({ message: err.message, status: err.status });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-panel panel" aria-label="Sign in">
      <form onSubmit={submit} className="auth-form">
        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(null); }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError(null); }}
          >
            Create account
          </button>
        </div>

        <div className="auth-fields">
          <div className="field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="auth-password">
              Password <span className="muted">(min 8 chars)</span>
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
        </div>

        <div className="auth-actions">
          <button type="submit" className="generate-btn" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          <span className="muted small">
            Optional — you can generate speech without an account.
          </span>
        </div>

        {error && (
          <p className="auth-error" role="alert">
            ⚠️ {error.message}
          </p>
        )}
      </form>
    </div>
  );
}
