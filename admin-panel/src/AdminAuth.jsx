import { useCallback, useState } from 'react'
import { ADMIN_API, ADMIN_LOGIN_EMAIL_DISPLAY } from './api.js'

/** Login + password reset (no signup). Only the configured admin email is accepted. */
export default function AdminAuth({ onLoggedIn }) {
  const [view, setView] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const canonicalEmailOk = useCallback((value) => {
    return String(value || '').trim().toLowerCase() === ADMIN_LOGIN_EMAIL_DISPLAY.trim().toLowerCase()
  }, [])

  const onSubmitLogin = async (e) => {
    e.preventDefault()
    setErr('')
    setInfo('')
    setBusy(true)
    try {
      const res = await fetch(ADMIN_API.login, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok || !data.token) {
        throw new Error(data.error || 'Could not sign in')
      }
      onLoggedIn(String(data.token))
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  const onSubmitResetStep1 = async (e) => {
    e.preventDefault()
    setErr('')
    setInfo('')
    if (!canonicalEmailOk(email)) {
      setErr(`Enter exactly: ${ADMIN_LOGIN_EMAIL_DISPLAY}`)
      return
    }
    setBusy(true)
    try {
      const res = await fetch(ADMIN_API.resetPasswordChallenge, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok || !data.resetToken) {
        throw new Error(data.error || 'Could not continue')
      }
      setResetToken(String(data.resetToken))
      setNewPassword('')
      setConfirmPassword('')
      setView('reset-confirm')
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Could not continue')
    } finally {
      setBusy(false)
    }
  }

  const onSubmitResetStep2 = async (e) => {
    e.preventDefault()
    setErr('')
    if (newPassword.length < 8) {
      setErr('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setErr('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(ADMIN_API.resetPasswordConfirm, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resetToken,
          newPassword,
          confirmPassword,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Could not update password')
      }
      setView('login')
      setPassword('')
      setErr('')
      setResetToken('')
      setInfo('Password updated. Sign in with your new password.')
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Could not update password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img className="auth-brand__logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
          <div>
            <p className="auth-brand__eyebrow">
              ONYX<span className="brand__eyebrow-ai"> AI</span>
            </p>
            <h1 className="auth-brand__title">Admin</h1>
          </div>
        </div>

        {view === 'login' ? (
          <form className="auth-form" onSubmit={onSubmitLogin}>
            <p className="auth-lead">Sign in to the admin panel. There is no self-signup.</p>
            <label className="auth-label">
              Email
              <input
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={ADMIN_LOGIN_EMAIL_DISPLAY}
                required
              />
            </label>
            <label className="auth-label">
              Password
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {err ? (
              <p className="auth-err" role="alert">
                {err}
              </p>
            ) : null}
            <button type="submit" className="btn-primary auth-submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              className="btn-ghost auth-link"
              onClick={() => {
                setView('reset-email')
                setErr('')
                setInfo('')
                setEmail('')
                setPassword('')
              }}
            >
              Forgot password
            </button>
          </form>
        ) : null}

        {view === 'reset-email' ? (
          <form className="auth-form" onSubmit={onSubmitResetStep1}>
            <p className="auth-lead">Enter the admin email to reset your password.</p>
            <label className="auth-label">
              Email
              <input
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={ADMIN_LOGIN_EMAIL_DISPLAY}
                required
              />
            </label>
            {err ? (
              <p className="auth-err" role="alert">
                {err}
              </p>
            ) : null}
            <button type="submit" className="btn-primary auth-submit" disabled={busy}>
              {busy ? 'Please wait…' : 'Continue'}
            </button>
            <button
              type="button"
              className="btn-ghost auth-link"
              onClick={() => {
                setView('login')
                setErr('')
                setInfo('')
              }}
            >
              Back to sign in
            </button>
          </form>
        ) : null}

        {view === 'reset-confirm' ? (
          <form className="auth-form" onSubmit={onSubmitResetStep2}>
            <p className="auth-lead">
              Choose a new password for <strong>{ADMIN_LOGIN_EMAIL_DISPLAY}</strong>. This step expires in about 15 minutes.
            </p>
            <label className="auth-label">
              New password
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            <label className="auth-label">
              Confirm password
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            {err ? (
              <p className="auth-err" role="alert">
                {err}
              </p>
            ) : null}
            <button type="submit" className="btn-primary auth-submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save new password'}
            </button>
            <button
              type="button"
              className="btn-ghost auth-link"
              onClick={() => {
                setView('reset-email')
                setErr('')
                setResetToken('')
              }}
            >
              Start over
            </button>
          </form>
        ) : null}
      </div>
    </div>
  )
}
