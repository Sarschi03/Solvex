import { useState, type SubmitEvent } from 'react'
import { requestApi, requestError } from '../lib/requestFlow'
import type { ProfilePlant } from '../types'

export function AddRequestPlantForm({ onCreated, onCancel }: { onCreated: (plant: ProfilePlant) => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const body = Object.fromEntries(new FormData(event.currentTarget))
    setSaving(true)
    setError('')
    try {
      const result = await requestApi<{ plant: ProfilePlant }>('/plants', { method: 'POST', body: JSON.stringify(body) })
      onCreated(result.plant)
    } catch (reason) { setError(requestError(reason)) }
    finally { setSaving(false) }
  }
  return <form className="request-form request-add-plant" aria-label="Dodaj elektrarno" onSubmit={save}>
    <h2>Nova elektrarna</h2>
    <label>Ime elektrarne<input name="name" maxLength={100} required /></label>
    <label>Naslov elektrarne<input name="installation_address" maxLength={1000} required /></label>
    <div className="request-field-row"><label>Poštna številka<input name="postal_code" inputMode="numeric" pattern="[0-9]+" maxLength={20} required /></label>
      <label>Kraj<input name="city" maxLength={100} required /></label></div>
    {error && <p role="alert">{error}</p>}
    <div className="request-actions"><button type="submit" disabled={saving}>{saving ? 'Shranjevanje ...' : 'Shrani elektrarno'}</button><button type="button" onClick={onCancel} disabled={saving}>Prekliči</button></div>
  </form>
}
