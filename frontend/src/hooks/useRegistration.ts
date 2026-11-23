import { useState, type SubmitEvent } from 'react'
import { apiBase } from '../lib/api'

export function useRegistration() {
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [registered, setRegistered] = useState(false)

  async function register(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form))
    setNotice('')
    setIsSubmitting(true)
    try {
      const response = await fetch(`${apiBase}/customers/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = (await response.json().catch(() => ({}))) as { message?: string; customer?: { id: string } }
      if (!response.ok || !result.customer?.id) {
        setNotice(result.message ?? 'Registracija ni uspela. Poskusi znova.')
        return
      }
      form.reset()
      setRegistered(true)
      setNotice('Račun lastnika je ustvarjen. Prijava v delovni prostor je trenutno na voljo samo zaposlenim.')
    } catch {
      setNotice('Backend trenutno ni dosegljiv. Poskusi znova.')
    } finally {
      setIsSubmitting(false)
    }
  }
  return { notice, isSubmitting, registered, register }
}
