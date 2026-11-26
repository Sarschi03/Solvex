import { useState } from 'react'
import { useApiResource } from '../../hooks/useApiResource'
import { extraServiceLabels, formatRequestDate, requestTypeLabels, statusLabels, urgencyLabels, type CustomerRequest, type CustomerService } from '../../lib/requestFlow'
import './RequestFlow.css'

const closed = ['completed', 'rejected', 'cancelled']
const serviceLabels: Record<string, string> = { cleaning: 'Čiščenje', electrical: 'Elektro servis', installer: 'Montaža' }
export default function CurrentServicesPage() {
  const { data, loading, error, reload } = useApiResource<{ requests: CustomerRequest[]; services: CustomerService[] }>('/requests')
  const [showClosed, setShowClosed] = useState(false)
  const requests = (data?.requests ?? []).filter(item => showClosed || !closed.includes(item.status))
  const services = (data?.services ?? []).filter(item => showClosed || !closed.includes(item.status))
  return <section className="dashboard-content request-page" aria-label="Trenutni servisi">
    <h1>Trenutni servisi in zahtevki</h1>
    <div className="request-actions"><a href="#lastnik/fault">Prijavi okvaro</a><a href="#lastnik/inspection">Naroči pregled</a><button type="button" onClick={reload}>Osveži</button></div>
    <label className="request-actions"><input type="checkbox" checked={showClosed} onChange={event => setShowClosed(event.target.checked)} />Prikaži tudi zaključene</label>
    {loading && <p role="status">Nalaganje zahtevkov ...</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={reload}>Poskusi znova</button></div>}
    {!loading && !error && <>
      <h2>Moji zahtevki</h2>
      {requests.length === 0 && <p>Trenutno nimaš {showClosed ? '' : 'odprtih '}zahtevkov.</p>}
      {requests.map(item => <article className="request-card" key={item.id}>
        <h3>{requestTypeLabels[item.request_type]} #{item.id} · {item.solar_plant_name}</h3>
        <span className="request-badge">{statusLabels[item.status] ?? item.status}</span>
        {item.fault_type && <p>Vrsta okvare: {item.fault_type}</p>}
        {item.description && <p>{item.description}</p>}
        {(item.requested_services ?? []).length > 0 && <p>Dodatne storitve: {item.requested_services.map(value => extraServiceLabels[value] ?? value).join(', ')}</p>}
        <dl><dt>Oddano</dt><dd>{formatRequestDate(item.requested_at, true)}</dd><dt>Želeni datum</dt><dd>{formatRequestDate(item.preferred_date)}</dd><dt>Nujnost</dt><dd>{item.status === 'submitted' ? 'Čaka na oceno vodje' : urgencyLabels[item.urgency]}</dd></dl>
      </article>)}
      <h2>Dodeljeni servisi</h2>
      {services.length === 0 && <p>Trenutno ni dodeljenih servisov. Ko vodja potrdi termin, bo prikazan tukaj.</p>}
      {services.map(item => <article className="request-card" key={item.id}><h3>{item.solar_plant_name} · {serviceLabels[item.service_type] ?? item.service_type}</h3>
        <span className="request-badge">{statusLabels[item.status] ?? item.status}</span>
        <dl><dt>Termin</dt><dd>{formatRequestDate(item.scheduled_at, true)}</dd><dt>Nujnost</dt><dd>{urgencyLabels[item.urgency]}</dd>{item.id_service_request && <><dt>Zahtevek</dt><dd>#{item.id_service_request}</dd></>}{item.completed_at && <><dt>Zaključeno</dt><dd>{formatRequestDate(item.completed_at, true)}</dd></>}</dl>
      </article>)}
    </>}
  </section>
}
