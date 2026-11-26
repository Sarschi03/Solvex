import { useState } from 'react'
import { useApiResource } from '../../hooks/useApiResource'
import { requestApi, requestError, formatRequestDate } from '../../lib/requestFlow'
import './RequestFlow.css'
type Recommendation={service_id:string;plant_id:string;plant_name:string;due_at:string;overdue:boolean}
export default function RecommendationsPage(){
  const {data,loading,error,reload}=useApiResource<{enabled:boolean;recommendations:Recommendation[]}>('/account/recommendations')
  const [saving,setSaving]=useState(false),[notice,setNotice]=useState('')
  async function toggle(){setSaving(true);setNotice('');try{await requestApi('/account/recommendations',{method:'PATCH',body:JSON.stringify({enabled:!data?.enabled})});reload();setNotice('Nastavitev je shranjena.')}catch(error){setNotice(requestError(error))}finally{setSaving(false)}}
  return <section className="dashboard-content request-page" aria-label="Priporočila"><h1>Priporočila za preglede</h1><p>Predlogi za vzdrževanje na podlagi opravljenih rednih pregledov. Niso nujna opravila.</p>
    {loading&&<p role="status">Nalaganje priporočil ...</p>}{error&&<div role="alert">{error}<button onClick={reload}>Poskusi znova</button></div>}
    {data&&<><label><input type="checkbox" checked={data.enabled} disabled={saving||loading} onChange={()=>void toggle()}/>Želim priporočila za redne preglede</label>
      {!data.enabled?<p>Priporočila so izklopljena.</p>:data.recommendations.length===0?<p>Trenutno ni priporočil. Prikažejo se en mesec pred letnim rokom, če ima elektrarna evidentiran redni pregled.</p>:data.recommendations.map(item=><article key={item.service_id} className="request-card"><h2>{item.plant_name}</h2><p>Predlagan redni pregled do {formatRequestDate(item.due_at)}.</p>{item.overdue&&<p>Letni rok je že potekel. Predlagamo, da se dogovorite za pregled.</p>}<a href="#lastnik/inspection">Naroči pregled</a></article>)}</>}
    {notice&&<p role="status">{notice}</p>}
  </section>
}
