import { useCallback, useEffect, useState } from 'react'

import {
  fetchCurrentUser,
  getAuthToken,
  loginUser,
  registerUser,
  setAuthToken,
  type AuthUser,
} from '@/services/api'

export interface AuthState {
  user: AuthUser | null
  /** False until the stored token (if any) has been verified against /me. */
  ready: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  register: (email: string, password: string) => Promise<AuthUser>
  logout: () => void
}

/**
 * Phase 7 client auth — JWT in localStorage, session restored on boot via
 * GET /api/auth/me (a dead token is cleared silently). register()
 * auto-logins after a successful signup.
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const token = getAuthToken()
    if (!token) {
      setReady(true)
      return
    }
    const controller = new AbortController()
    fetchCurrentUser(token, controller.signal).then((restored) => {
      if (controller.signal.aborted) return
      if (restored) setUser(restored)
      else setAuthToken(null)
      setReady(true)
    })
    return () => controller.abort()
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: loggedIn } = await loginUser(email, password)
    setAuthToken(token)
    setUser(loggedIn)
    return loggedIn
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    await registerUser(email, password)
    // Auto-login after signup — one flow, no extra click.
    const { token, user: created } = await loginUser(email, password)
    setAuthToken(token)
    setUser(created)
    return created
  }, [])

  const logout = useCallback(() => {
    setAuthToken(null)
    setUser(null)
  }, [])

  return { user, ready, login, register, logout }
}
