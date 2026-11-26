import { useState, type SubmitEvent } from 'react'
import type { ManagerRequest } from '../hooks/useManagerData'
import { extraServiceLabels, formatRequestDate, requestApi, requestError, statusLabels, urgencyLabels, type RequestUrgency, type RequestType } from '../lib/requestFlow'
import '../pages/customer/RequestFlow.css'

function InboxCard({ item, onChanged, onAssign }: { item: ManagerRequest; onChanged: () => void; onAssign?: (id:string)=>void }) {
  const [urgency, setUrgency] = useState<RequestUrgency>(item.urgency ?? 'standardno')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const locked = ['completed', 'rejected', 'cancelled'].includes(item.status)
  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await requestApi(`/managers/requests/${encodeURIComponent(item.id)}/urgency`, { method: 'PATCH', body: JSON.stringify({ urgency }) })
      onChanged()
    } catch (reason) { setError(requestError(reason)) }
    finally { setSaving(false) }
  }
  return <article className="request-card">
    <h3>#{item.id} · {item.solar_plant_name}</h3>
    <p>{item.customer_first_name} {item.customer_last_name} · {item.customer_email}{item.customer_phone ? ` · ${item.customer_phone}` : ''}</p>
    <p>{item.installation_address}, {item.postal_code} {item.city}</p>
    {(item.manufacturer || item.installed_capacity_kw || item.installation_year) && <p>{[item.manufacturer, item.installed_capacity_kw ? `${item.installed_capacity_kw} kW` : null, item.installation_year].filter(Boolean).join(' · ')}</p>}
    <span className="request-badge">{statusLabels[item.status] ?? item.status}</span>
    {item.follow_up_required&&<p>Potreben je nadaljnji poseg. Ustvari novo dodelitev za nadaljevanje.</p>}
    {item.request_type === 'fault_report' && <p>Vrsta okvare: {item.fault_type || 'Ni zabeležena'}</p>}
    <p>{item.description || 'Brez dodatnega opisa.'}</p>
    {(item.requested_services ?? []).length > 0 && <p>Dodatne storitve: {item.requested_services.map(value => extraServiceLabels[value] ?? value).join(', ')}</p>}
    <dl><dt>Oddano</dt><dd>{formatRequestDate(item.requested_at, true)}</dd><dt>Želeni datum</dt><dd>{formatRequestDate(item.preferred_date)}</dd><dt>Nujnost</dt><dd>{urgencyLabels[item.urgency ?? 'standardno']}</dd></dl>
    {!locked && <form className="request-form" aria-label={`Nujnost zahtevka ${item.id}`} onSubmit={save}>
      <label htmlFor={`urgency-${item.id}`}>Določi nujnost<select id={`urgency-${item.id}`} value={urgency} disabled={saving} onChange={event => setUrgency(event.target.value as RequestUrgency)}>{Object.entries(urgencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button type="submit" disabled={saving}>{saving ? 'Shranjevanje ...' : 'Shrani nujnost'}</button>
    </form>}
    {!locked && onAssign && <button type="button" onClick={()=>onAssign(item.id)}>Dodeli servis</button>}
    {error && <p role="alert">{error}</p>}
  </article>
}

export function ManagerRequestInbox({ requests, search, loading, onChanged, onAssign }: { requests: ManagerRequest[]; search: string; loading: boolean; onChanged: () => void; onAssign?: (id:string)=>void }) {
  const [filter, setFilter] = useState<RequestType | 'all'>('all')
  const [notice, setNotice] = useState('')
  const matching = requests.filter(item => [item.solar_plant_name, item.customer_first_name, item.customer_last_name, item.description, item.fault_type].join(' ').toLocaleLowerCase('sl').includes(search.toLocaleLowerCase('sl')))
  return <div className="manager-inbox">
    {notice && <p role="status">{notice}</p>}
    <div className="request-tabs" aria-label="Vrsta zahtevkov">{([['all', 'Vsi'], ['fault_report', 'Okvare'], ['regular_inspection', 'Redni pregledi']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}<button type="button" onClick={onChanged} disabled={loading}>Osveži</button></div>
    {([['fault_report', 'Prijave okvar'], ['regular_inspection', 'Redni pregledi']] as const).filter(([value]) => filter === 'all' || filter === value).map(([type, title]) => {
      const group = matching.filter(item => item.request_type === type)
      return <section key={type} aria-label={title}><h2>{title} ({group.length})</h2>{!loading && group.length === 0 && <p>Ni zahtevkov za prikaz.</p>}{group.map(item => <InboxCard key={item.id} item={item} onAssign={onAssign} onChanged={() => { setNotice('Nujnost je shranjena. Posodobljeni so tudi povezani aktivni servisi.'); onChanged() }} />)}</section>
    })}
  </div>
}
