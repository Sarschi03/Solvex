import { useState } from 'react'
import { useApiResource } from '../hooks/useApiResource'
import { formatRequestDate, urgencyLabels } from '../lib/requestFlow'
import type { ScheduledService } from './SchedulingPage'
import './customer/RequestFlow.css'
export default function CalendarPage() {
  const [month,setMonth] = useState(new Date().toISOString().slice(0,7))
  const start = new Date(`${month}-01T00:00:00`)
  const end = new Date(start); end.setMonth(end.getMonth()+1)
  const query = new URLSearchParams({ from: start.toISOString(),to:end.toISOString() })
  const { data,loading,error,reload } = useApiResource<{ services: ScheduledService[] }>(`/calendar?${query}`)
  return <section className="dashboard-content request-page" aria-label="Koledar"><h2>Koledar terminov</h2><label>Mesec<input aria-label="Mesec" className="request-filter" type="month" value={month} onChange={event => { if (/^\d{4}-\d{2}$/.test(event.target.value)) setMonth(event.target.value) }} /></label>
    {loading && <p role="status">Nalaganje koledarja ...</p>}{error && <div role="alert">{error}<button type="button" onClick={reload}>Poskusi znova</button></div>}
    {!loading && !error && (data?.services.length ? data.services.map(item => <article key={item.id} className="request-card"><h3>#{item.id} · {item.solar_plant_name}</h3><p>{formatRequestDate(item.scheduled_at,true)} – {formatRequestDate(item.scheduled_end_at,true)}</p><p>{item.installation_address}, {item.city} · {urgencyLabels[item.urgency as keyof typeof urgencyLabels]}</p><p>Ekipa: {item.assignments.map(member => `${member.first_name} ${member.last_name}${member.is_leader ? ' (vodja)' : ''}`).join(', ')}</p></article>) : <p>V tem mesecu ni terminov.</p>)}
  </section>
}
