import { useRef, useState, type SubmitEvent } from 'react'
import { useApiResource } from '../hooks/useApiResource'
import { extraServiceLabels, requestApi, requestError, requestTypeLabels, type CustomerRequest, type RequestType } from '../lib/requestFlow'
import type { ProfilePlant } from '../types'
import { AddRequestPlantForm } from './AddRequestPlantForm'
import '../pages/customer/RequestFlow.css'

export function CustomerRequestForm({ type }: { type: RequestType }) {
  const resource = useApiResource<{ plants: ProfilePlant[] }>('/plants')
  const [plantId, setPlantId] = useState('')
  const [addingPlant, setAddingPlant] = useState(false)
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<CustomerRequest | null>(null)
  const plants = resource.data?.plants ?? []
  const selectedPlant = plantId || plants[0]?.id || ''
  const title = type === 'fault_report' ? 'Prijavi okvaro' : 'Naroči pregled'
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    const form = new FormData(event.currentTarget)
    const body = { id_solar_plant: selectedPlant, request_type: type,
      description: String(form.get('description') ?? '').trim() || null,
      preferred_date: String(form.get('preferred_date') ?? '') || null,
      ...(type === 'fault_report' ? { fault_type: form.get('fault_type') } : { requested_services: form.getAll('requested_services') }),
    }
    inFlight.current = true
    setSaving(true)
    setError('')
    try {
      const result = await requestApi<{ request: CustomerRequest }>('/requests', { method: 'POST', body: JSON.stringify(body) })
      setSaved(result.request)
    } catch (reason) { setError(requestError(reason)) }
    finally { inFlight.current = false; setSaving(false) }
  }
  return <section className="dashboard-content request-page" aria-label={title}>
    <h1>{title}</h1>
    {saved ? <div className="request-confirmation">
      <p role="status">Zahtevek #{saved.id} je uspešno oddan in posredovan vodji servisa.</p>
      <p>{requestTypeLabels[saved.request_type]} · {saved.solar_plant_name}</p>
      <div className="request-actions"><a href="#lastnik/current-services">Poglej stanje zahtevka</a><button type="button" onClick={() => setSaved(null)}>Oddaj nov zahtevek</button></div>
    </div> : <>
      {resource.loading && <p role="status">Nalaganje elektrarn ...</p>}
      {resource.error && <div role="alert"><p>{resource.error}</p><button type="button" onClick={resource.reload}>Poskusi znova</button></div>}
      {!resource.loading && !resource.error && <>
        {plants.length === 0 && <p>Za oddajo zahtevka najprej dodaj svojo elektrarno.</p>}
        {addingPlant || plants.length === 0 ? <AddRequestPlantForm onCancel={() => { if (plants.length === 0) window.location.hash = 'lastnik'; else setAddingPlant(false) }} onCreated={plant => {
          resource.setData(current => ({ plants: [...(current?.plants ?? []), plant] }))
          setPlantId(plant.id)
          setAddingPlant(false)
        }} /> : <button className="request-secondary" type="button" onClick={() => setAddingPlant(true)}>Dodaj elektrarno</button>}
        {plants.length > 0 && <form className="request-form" onSubmit={submit}>
          <fieldset disabled={saving}>
            <legend className="visually-hidden">{title}</legend>
            <label>Sončna elektrarna<select value={selectedPlant} onChange={event => setPlantId(event.target.value)} required>{plants.map(plant => <option key={plant.id} value={plant.id}>{plant.name} · {plant.installation_address}</option>)}</select></label>
            {type === 'fault_report' ? <label>Vrsta okvare<input name="fault_type" maxLength={100} required placeholder="Npr. razsmernik ne deluje" /></label> : <fieldset className="request-extras"><legend>Dodatne storitve (neobvezno)</legend>{Object.entries(extraServiceLabels).map(([value, label]) => <label key={value}><input type="checkbox" name="requested_services" value={value} />{label}</label>)}</fieldset>}
            <label>{type === 'fault_report' ? 'Opis težave' : 'Dodatne informacije (neobvezno)'}<textarea name="description" rows={5} maxLength={4000} required={type === 'fault_report'} /></label>
            <label>Želeni datum (neobvezno)<input name="preferred_date" type="date" min={new Date().toISOString().slice(0, 10)} /></label>
            <p className="request-hint">Želeni datum je predlog. Termin potrdi vodja servisa.</p>
            <button type="submit" disabled={saving}>{saving ? 'Oddajanje ...' : 'Oddaj zahtevek'}</button>
          </fieldset>
          {error && <p role="alert">{error}</p>}
        </form>}
      </>}
    </>}
  </section>
}
