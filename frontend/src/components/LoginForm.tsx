import type { AuthState } from '../hooks/useAuth'

export function LoginForm({ auth }: { auth: AuthState }) {
  return (
    <>
      <form className="auth-form login-form" onSubmit={auth.login}>
        <div className="field">
          <label htmlFor="email">Službeni e-poštni naslov</label>
          <input id="email" name="email" type="email" autoComplete="username"
            placeholder="ime@primer.si" value={auth.email}
            onChange={(event) => auth.setEmail(event.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">Geslo</label>
          <input id="password" name="password" type="password" autoComplete="current-password"
            placeholder="Vnesi svoje geslo" value={auth.password}
            onChange={(event) => auth.setPassword(event.target.value)} required />
        </div>
        <button className="submit-button" type="submit" disabled={auth.isSubmitting}>
          {auth.isSubmitting ? 'Prijavljanje ...' : 'Prijava'}
        </button>
      </form>
      {auth.notice && <p className="form-notice" role="status">{auth.notice}</p>}
    </>
  )
}
