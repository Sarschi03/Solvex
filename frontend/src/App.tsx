import './App.css'
import { useHashRoute } from './hooks/useHashRoute'
import { useAuth } from './hooks/useAuth'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import CustomerDashboardPage from './pages/customer/CustomerDashboardPage'

export default function App() {
  const auth = useAuth()
  const route = useHashRoute()
  if (auth.account?.role === 'customer' || route === '#lastnik' || route.startsWith('#lastnik/')) {
    return <CustomerDashboardPage route={route} account={auth.account?.role === 'customer' ? auth.account : null} onAccountChange={auth.setAccount} onLogout={async () => {
      if (await auth.logout()) window.location.hash = 'prijava'
    }} />
  }
  if (!auth.employee && route === '#registracija') return <RegisterPage />
  return auth.employee
    ? <DashboardPage employee={auth.employee} account={auth.account} onAccountChange={auth.setAccount} onLogout={auth.logout} />
    : <LoginPage auth={auth} />
}
