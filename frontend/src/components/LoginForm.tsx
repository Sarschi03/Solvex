import type { AuthState } from '../hooks/useAuth'

export function LoginForm({ auth }: { auth: AuthState }) {
  return (
    <>
      <form className="auth-form login-form" onSubmit={auth.login}>
        <fieldset className="login-role-picker" disabled={auth.isSubmitting}>
          <legend className="visually-hidden">Vrsta računa</legend>
          <button type="button" aria-pressed={auth.role === 'customer'} onClick={() => auth.setRole('customer')}>Lastnik</button>
          <button type="button" aria-pressed={auth.role === 'employee'} onClick={() => auth.setRole('employee')}>Zaposleni</button>
          <button type="button" aria-pressed={auth.role === 'manager'} onClick={() => auth.setRole('manager')}>Vodja servisa</button>
        </fieldset>
        <div className="field">
          <label htmlFor="email">{auth.role === 'customer' ? 'E-poštni naslov' : 'Službeni e-poštni naslov'}</label>
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
