import { useState, type SubmitEvent } from 'react'
import { useApiResource } from '../hooks/useApiResource'
import { requestApi, requestError, formatRequestDate, type CustomerRequest } from '../lib/requestFlow'
import '../pages/customer/RequestFlow.css'

export type Assignment = { employee_id: string; first_name?: string; last_name?: string; responsibility: string; is_leader: boolean; assigned_at?: string }
export type ScheduledService = { id: string; id_service_request: string | null; solar_plant_name: string; installation_address: string; city: string; service_type: string; status: string; urgency: string; scheduled_at: string | null; scheduled_end_at: string | null; assignments: Assignment[] }
type Technician = { id: string; first_name: string; last_name: string; service_type: string; active_services: number; available?: boolean }
const specialties: Record<string,string> = { electrical: 'Elektro servis', cleaning: 'Čiščenje', installer: 'Montaža' }
const localDate = (value: string | null) => { if (!value) return ''; const date = new Date(value); date.setMinutes(date.getMinutes()-date.getTimezoneOffset()); return date.toISOString().slice(0,16) }

function ScheduleForm({ service, requests, technicians, onSaved }: { service?: ScheduledService; requests: CustomerRequest[]; technicians: Technician[]; onSaved: () => void }) {
  const [members, setMembers] = useState<string[]>(service?.assignments.map(item => item.employee_id) ?? [])
  const [leader, setLeader] = useState(service?.assignments.find(item => item.is_leader)?.employee_id ?? '')
  const [start, setStart] = useState(localDate(service?.scheduled_at ?? null))
  const [end, setEnd] = useState(localDate(service?.scheduled_end_at ?? null))
  const [availability, setAvailability] = useState<Technician[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function check() {
    setError('')
    try {
      const query = new URLSearchParams({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), ...(service ? { exclude_service_id: service.id } : {}) })
      const result = await requestApi<{ employees: Technician[] }>(`/managers/availability?${query}`)
      setAvailability(result.employees)
    } catch (reason) { setError(requestError(reason)) }
  }
  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return
    const form = new FormData(event.currentTarget)
    setSaving(true); setError('')
    try {
      const body = { ...(!service ? { request_id: form.get('request_id') } : {}), service_type: form.get('service_type'), scheduled_at: new Date(start).toISOString(), scheduled_end_at: new Date(end).toISOString(), leader_id: leader,
        assignments: members.map(id => ({ employee_id: id, responsibility: technicians.find(item => item.id === id)!.service_type })) }
      await requestApi(service ? `/managers/services/${service.id}/schedule` : '/managers/services', { method: service ? 'PUT' : 'POST', body: JSON.stringify(body) })
      onSaved()
    } catch (reason) { setError(requestError(reason)) }
    finally { setSaving(false) }
  }
  return <form className="request-form" aria-label="Razporeditev servisa" onSubmit={save}>
    <fieldset disabled={saving}><legend>{service ? `Uredi servis #${service.id}` : 'Nova dodelitev'}</legend>
      {!service && <label>Zahtevek<select name="request_id" required defaultValue=""><option value="" disabled>Izberi zahtevek</option>{requests.filter(item => !['completed','cancelled','rejected'].includes(item.status)).map(item => <option key={item.id} value={item.id}>#{item.id} · {item.solar_plant_name} · {item.urgency}</option>)}</select></label>}
      <label>Vrsta servisa<select name="service_type" defaultValue={service?.service_type ?? 'electrical'}>{Object.entries(specialties).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="request-field-row"><label>Začetek termina<input type="datetime-local" value={start} required onChange={event => { setStart(event.target.value); setAvailability([]) }} /></label><label>Konec termina / rok<input type="datetime-local" value={end} required onChange={event => { setEnd(event.target.value); setAvailability([]) }} /></label></div>
      <button type="button" disabled={!start || !end} onClick={() => void check()}>Preveri razpoložljivost</button>
      <fieldset className="request-extras"><legend>Ekipa in odgovornosti</legend>{technicians.map(person => {
        const checked = members.includes(person.id)
        const availabilityInfo = availability.find(item => item.id === person.id)
        return <label key={person.id}><input type="checkbox" checked={checked} onChange={() => { setMembers(current => checked ? current.filter(id => id !== person.id) : [...current,person.id]); if (leader === person.id) setLeader(''); if (!leader && !checked) setLeader(person.id) }} />{person.first_name} {person.last_name} · {specialties[person.service_type]} · Aktivni: {availabilityInfo?.active_services ?? person.active_services}{availabilityInfo ? availabilityInfo.available ? ' · Prost' : ' · Zaseden' : ''}</label>
      })}</fieldset>
      <label>Vodja ekipe<select value={leader} onChange={event => setLeader(event.target.value)} required><option value="">Izberi vodjo</option>{technicians.filter(item => members.includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.first_name} {item.last_name}</option>)}</select></label>
      <p className="request-hint">Odgovornost člana ustreza njegovi specializaciji. Vodja ekipe pripravi in odda skupno poročilo.</p>
      <button type="submit" disabled={members.length === 0 || !leader}>{saving ? 'Shranjevanje ...' : 'Shrani razporeditev'}</button>
    </fieldset>{error && <p role="alert">{error}</p>}
  </form>
}
export default function SchedulingPage() {
  const schedules = useApiResource<{ services: ScheduledService[] }>('/managers/schedule')
  const requests = useApiResource<{ requests: CustomerRequest[] }>('/managers/requests')
  const employees = useApiResource<{ employees: Technician[] }>('/managers/employees')
  const [selected, setSelected] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const service = schedules.data?.services.find(item => item.id === selected)
  const loading = schedules.loading || requests.loading || employees.loading
  const loadError = schedules.error || requests.error || employees.error
  function refresh() { schedules.reload(); requests.reload(); employees.reload() }
  async function cancel() {
    if (!service || cancelling) return
    setCancelling(true); setError('')
    try { await requestApi(`/managers/services/${service.id}/cancel`, { method: 'POST' }); setNotice('Servis je preklican. Ekipa in lastnik sta obveščena.'); setSelected(''); refresh() }
    catch (reason) { setError(requestError(reason)) }
    finally { setCancelling(false) }
  }
  return <section className="dashboard-content request-page" aria-label="Razporeditev">
    <h2>Razporeditev in ekipe</h2>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    {loading && <p role="status">Nalaganje razporeda ...</p>}
    {loadError && <div role="alert">{loadError}<button type="button" onClick={refresh}>Poskusi znova</button></div>}
    {!loading && !loadError && <>
      <label>Servis za urejanje<select className="request-filter" aria-label="Servis za urejanje" value={selected} onChange={event => { setSelected(event.target.value); setNotice('') }}><option value="">Nova dodelitev</option>{schedules.data?.services.filter(item => !['completed','cancelled'].includes(item.status)).map(item => <option key={item.id} value={item.id}>#{item.id} · {item.solar_plant_name} · {formatRequestDate(item.scheduled_at,true)}</option>)}</select></label>
      <ScheduleForm key={selected} service={service} requests={requests.data?.requests ?? []} technicians={employees.data?.employees ?? []} onSaved={() => { setNotice('Razporeditev je shranjena. Ekipa in lastnik sta obveščena.'); refresh() }} />
      {service && <button className="request-secondary" type="button" disabled={cancelling} onClick={() => void cancel()}>Prekliči servis</button>}
    </>}
  </section>
}
