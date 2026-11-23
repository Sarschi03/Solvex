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
  if (route === '#lastnik' || route.startsWith('#lastnik/')) {
    return <CustomerDashboardPage route={route} onLogout={() => {
      auth.logout()
      window.location.hash = 'prijava'
    }} />
  }
  if (!auth.employee && route === '#registracija') return <RegisterPage />
  return auth.employee
    ? <DashboardPage employee={auth.employee} onLogout={auth.logout} />
    : <LoginPage auth={auth} />
}
