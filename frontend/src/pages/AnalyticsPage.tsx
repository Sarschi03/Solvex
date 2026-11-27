import { useState,type SubmitEvent } from 'react'
import { useApiResource } from '../hooks/useApiResource'
import { requestApi,requestError,formatRequestDate } from '../lib/requestFlow'
import './customer/RequestFlow.css'
type AnalysisRow={label:string;services:number;faults:number;repairs:number;unknown_faults:number}
type Analysis={id:string;date_from:string;date_to:string;group_by:string;shared_at:string|null;result:AnalysisRow[]|null}
export default function AnalyticsPage({administrator=false}:{administrator?:boolean}){
  const {data,loading,error,reload}=useApiResource<{requests:Analysis[]}>('/analytics-requests')
  const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  async function send(event:SubmitEvent<HTMLFormElement>){event.preventDefault();const body=Object.fromEntries(new FormData(event.currentTarget));setBusy(true);setNotice('');try{await requestApi('/managers/analytics-requests',{method:'POST',body:JSON.stringify(body)});setNotice('Zahteva je poslana administratorju.');reload()}catch(error){setNotice(requestError(error))}finally{setBusy(false)}}
  async function share(id:string){setBusy(true);setNotice('');try{await requestApi(`/admin/analytics-requests/${id}/share`,{method:'POST'});setNotice('Analiza je posredovana vodji.');reload()}catch(error){setNotice(requestError(error))}finally{setBusy(false)}}
  const labels:Record<string,string>={manufacturer:'Proizvajalec',power:'Moč elektrarne',installation_year:'Leto namestitve'}
  return <section className="dashboard-content request-page" aria-label="Analize"><h1>Analize servisov</h1><p>Število evidentiranih napak in odpravljenih napak pri zaključenih servisih. Manjkajoči podatki so označeni posebej.</p>
    {!administrator&&<form className="request-card" onSubmit={event=>void send(event)}><h2>Zahtevaj analizo</h2><label>Od<input type="date" name="date_from" required/></label><label>Do<input type="date" name="date_to" required/></label><label>Združi po<select name="group_by"><option value="manufacturer">Proizvajalcu</option><option value="power">Moči elektrarne</option><option value="installation_year">Letu namestitve</option></select></label><button disabled={busy}>Pošlji zahtevo</button></form>}
    {loading&&<p role="status">Nalaganje analiz ...</p>}{error&&<div role="alert">{error}<button onClick={reload}>Poskusi znova</button></div>}{notice&&<p role="status">{notice}</p>}
    {!loading&&!error&&data?.requests?.length===0&&<p>Ni zahtev za analizo.</p>}
    {data?.requests?.map(item=><article className="request-card" key={item.id}><h2>Analiza #{item.id} · {labels[item.group_by]}</h2><p>{formatRequestDate(item.date_from)}–{formatRequestDate(item.date_to)}</p>
      {!item.shared_at?<><p>Čaka na pripravo administratorja.</p>{administrator&&<button disabled={busy} onClick={()=>void share(item.id)}>Pripravi in posreduj vodji</button>}</>:<><p>Posredovano {formatRequestDate(item.shared_at,true)}</p>{item.result?.length?<div style={{overflowX:'auto'}}><table><caption>Evidentirani servisi v izbranem obdobju</caption><thead><tr><th>{labels[item.group_by]}</th><th>Servisi</th><th>Napake</th><th>Popravila</th><th>Neznano stanje napake</th></tr></thead><tbody>{item.result.map(row=><tr key={row.label}><th scope="row">{row.label}</th><td>{row.services}</td><td>{row.faults}</td><td>{row.repairs}</td><td>{row.unknown_faults}</td></tr>)}</tbody></table></div>:<p>Za izbrano obdobje ni evidentiranih podatkov.</p>}</>}
    </article>)}
  </section>
}
