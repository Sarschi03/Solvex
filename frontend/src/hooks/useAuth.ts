import { useState, type SubmitEvent } from 'react'
import { apiBase } from '../lib/api'
import type { Employee } from '../types'

export function useAuth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function login(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('')
    setIsSubmitting(true)
    try {
      const response = await fetch(`${apiBase}/employees/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const result = (await response.json().catch(() => ({}))) as {
        message?: string
        employee?: Employee
      }
      if (!response.ok) {
        setNotice(result.message ?? 'Prijava ni uspela.')
        return
      }
      if (!result.employee) {
        setNotice('Prijava ni uspela. Poskusi znova.')
        return
      }
      setEmployee(result.employee)
      setPassword('')
    } catch {
      setNotice('Backend trenutno ni dosegljiv. Poskusi znova.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function logout() {
    setEmployee(null)
    setEmail('')
    setPassword('')
    setNotice('')
  }

  return { email, setEmail, password, setPassword, employee, notice, isSubmitting, login, logout }
}

export type AuthState = ReturnType<typeof useAuth>
