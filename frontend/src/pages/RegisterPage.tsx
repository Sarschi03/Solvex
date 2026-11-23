import { useRegistration } from '../hooks/useRegistration'
import { LoginMosaic } from '../components/LoginMosaic'
import './LoginPage.css'

export default function RegisterPage() {
  const { notice, isSubmitting, registered, register } = useRegistration()
  return (
    <main className="login-page registration-page">
      <section className="login-panel" aria-labelledby="registration-title">
        <div className="login-panel-content">
          <h1 id="registration-title">Registracija</h1>
          <p className="login-intro">Ustvari račun lastnika sončne elektrarne.<br />Prijava zaposlenih ostaja ločena.</p>
          {!registered && (
            <form className="auth-form login-form registration-form" onSubmit={register}>
              <div className="field"><label htmlFor="firstName">Ime</label>
                <input id="firstName" name="firstName" autoComplete="given-name" maxLength={100} required /></div>
              <div className="field"><label htmlFor="lastName">Priimek</label>
                <input id="lastName" name="lastName" autoComplete="family-name" maxLength={100} required /></div>
              <div className="field registration-wide"><label htmlFor="registerEmail">E-poštni naslov</label>
                <input id="registerEmail" name="email" type="email" autoComplete="email" maxLength={254} required /></div>
              <div className="field registration-wide"><label htmlFor="registerPassword">Geslo (vsaj 8 znakov)</label>
                <input id="registerPassword" name="password" type="password" autoComplete="new-password" minLength={8} required /></div>
              <div className="field registration-wide"><label htmlFor="address">Naslov</label>
                <input id="address" name="address" autoComplete="street-address" required /></div>
              <div className="field"><label htmlFor="postalCode">Poštna številka</label>
                <input id="postalCode" name="postalCode" inputMode="numeric" pattern="[0-9]+" autoComplete="postal-code" maxLength={20} required /></div>
              <div className="field"><label htmlFor="city">Kraj</label>
                <input id="city" name="city" autoComplete="address-level2" maxLength={100} required /></div>
              <button className="submit-button registration-wide" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Ustvarjanje računa ...' : 'Ustvari račun'}
              </button>
            </form>
          )}
          {notice && <p className="form-notice" role="status">{notice}</p>}
          <p className="login-note">Že imaš račun? <a href="#prijava">Prijava</a></p>
        </div>
      </section>
      <LoginMosaic />
    </main>
  )
}
