import { useApiResource } from '../hooks/useApiResource'
import type { ProfilePlant, ServiceReport } from '../types'
import type { ScheduledService } from '../pages/SchedulingPage'
import { ReportSummary } from './ReportSummary'
import { formatRequestDate } from '../lib/requestFlow'
const responsibilities: Record<string,string> = { electrical:'Elektro servis',cleaning:'Čiščenje',installer:'Montaža' }
type Detail = { service: ScheduledService & { fault_type: string | null; request_description: string | null; can_report: boolean }; plant: ProfilePlant & { manufacturer: string | null; installation_year: number | null; has_battery: boolean; battery_capacity_kwh: string | null }; recent_history: (Partial<ServiceReport> & {id:string;completed_at:string})[] }
export function TechnicianServiceDetails({ employeeId, serviceId }: { employeeId: string; serviceId: string }) {
  const { data,loading,error,reload } = useApiResource<Detail>(`/employees/${employeeId}/services/${serviceId}`)
  return <div>{loading&&<p role="status">Nalaganje podatkov elektrarne ...</p>}{error&&<div role="alert">{error}<button type="button" onClick={reload}>Poskusi znova</button></div>}{data?.plant&&<>
    <h3>Podatki elektrarne</h3><p>Proizvajalec: {data.plant.manufacturer||'Ni podatka'} · Leto namestitve: {data.plant.installation_year??'Ni podatka'}</p><p>Moč: {data.plant.installed_capacity_kw??'Ni podatka'} kW · Paneli: {data.plant.panel_count??'Ni podatka'} · Baterija: {data.plant.has_battery?`${data.plant.battery_capacity_kwh??'Neznana kapaciteta'} kWh`:'Ne'}</p>
    {data.service.fault_type&&<p>Vrsta okvare: {data.service.fault_type}</p>}{data.service.request_description&&<p>Opis zahtevka: {data.service.request_description}</p>}
    <h3>Ekipa in odgovornosti</h3><ul>{data.service.assignments.map(member=><li key={member.employee_id}>{member.first_name} {member.last_name} · {responsibilities[member.responsibility] ?? member.responsibility}{member.is_leader?' · Vodja ekipe':''}</li>)}</ul>
    <p>{data.service.can_report?'Poročilo lahko pripraviš kot vodja ekipe.':'Skupno poročilo pripravi vodja ekipe.'}</p>
    <h3>Zadnjih pet opravljenih servisov</h3>{data.recent_history.length===0?<p>Za elektrarno še ni opravljenih servisov.</p>:data.recent_history.map(item=><article key={item.id} className="request-card"><h4>Servis #{item.id}</h4><p>{formatRequestDate(item.completed_at,true)}</p><p>{item.work_summary||'Ni zabeleženega poročila.'}</p>{item.findings&&<p>Ugotovitve: {item.findings}</p>}{item.recommendations&&<p>Priporočila: {item.recommendations}</p>}<ReportSummary report={item}/></article>)}
  </>}</div>
}
