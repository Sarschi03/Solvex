import { useState } from 'react'
import { useApiResource } from '../../hooks/useApiResource'
import { formatRequestDate } from '../../lib/requestFlow'
import type { ReportPart } from '../../types'
import './RequestFlow.css'
type HistoryService={id:string;service_type:string;performed_at:string|null;request_type:string|null;reported_problem:string|null;customer_summary:string|null;outcome:string|null;plant_condition:string|null;parts_used:ReportPart[]}
const labels:Record<string,string>={cleaning:'Čiščenje panelov',electrical:'Elektro servis',installer:'Montaža',operational:'Deluje normalno',limited:'Omejeno delovanje',not_operational:'Ne deluje'}
function PlantHistory({id}:{id:string}){
  const {data,loading,error,reload}=useApiResource<{services:HistoryService[]}>(`/plants/${id}/history`)
  return <>{loading&&<p role="status">Nalaganje zgodovine ...</p>}{error&&<div role="alert">{error}<button onClick={reload}>Poskusi znova</button></div>}
    {!loading&&!error&&data?.services.length===0&&<p>Ta elektrarna še nima opravljenih servisov.</p>}
    {data?.services.map(item=><article className="request-card" key={item.id}><h2>{labels[item.service_type]??item.service_type} · {formatRequestDate(item.performed_at)}</h2>
      {item.request_type==='regular_inspection'&&<p>Redni pregled</p>}{item.reported_problem&&<p>Prijavljena težava: {item.reported_problem}</p>}
      <h3>Opravljeno delo</h3><p>{item.customer_summary||'Za ta starejši servis ločen povzetek za lastnika ni zabeležen.'}</p>
      <p>{item.outcome==='resolved'?'Odpravljeno / pregled opravljen':item.outcome==='follow_up'?'Potreben je nadaljnji poseg.':'Rezultat ni zabeležen.'}</p>
      {item.plant_condition&&<p>Stanje: {labels[item.plant_condition]??item.plant_condition}</p>}
      <h3>Porabljeni in zamenjani deli</h3>{item.parts_used.length?<ul>{item.parts_used.map((part,index)=><li key={index}>{part.name} · {part.quantity} kos · {part.replaced?'Menjava / namestitev':'Poraba'}{part.manufacturer&&` · ${part.manufacturer}`}{part.installed_on&&` · ${formatRequestDate(part.installed_on)}`}</li>)}</ul>:<p>Ni zabeleženih delov.</p>}
    </article>)}
  </>
}
export default function ServiceHistoryPage(){
  const {data,loading,error,reload}=useApiResource<{plants:{id:string;name:string}[]}>('/plants')
  const [selected,setSelected]=useState('')
  const id=selected||data?.plants[0]?.id
  return <section className="dashboard-content request-page" aria-label="Pretekli servisi"><h1>Pretekli servisi</h1><p>Opravljeno delo po elektrarni, od najnovejšega servisa.</p>
    {loading&&<p role="status">Nalaganje elektrarn ...</p>}{error&&<div role="alert">{error}<button onClick={reload}>Poskusi znova</button></div>}
    {data?.plants.length===0&&<p>Najprej dodaj svojo elektrarno.</p>}
    {!!data?.plants.length&&<label>Elektrarna<select value={id} onChange={event=>setSelected(event.target.value)}>{data.plants.map(plant=><option key={plant.id} value={plant.id}>{plant.name}</option>)}</select></label>}
    {id&&<PlantHistory key={id} id={id}/>}
  </section>
}
