import { useState } from 'react'
import { useApiResource } from '../hooks/useApiResource'
import { formatRequestDate } from '../lib/requestFlow'
import './customer/RequestFlow.css'
export type InventoryPart={id:string;sku:string;name:string;manufacturer:string|null;quantity_on_hand:number;low_stock_threshold:number;low_stock:boolean;active?:boolean}
type Movement={id:string;name:string;sku:string;report_id:string|null;service_id:string|null;quantity_delta:number;stock_after:number;reason:string;created_at:string}
type Alert={id:string;part_id:string;name:string;quantity_on_hand:number;low_stock_threshold:number}
const reasons:Record<string,string>={report_consumption:'Poraba po poročilu',initial:'Začetno stanje',restock:'Dopolnitev',adjustment:'Popravek'}
export default function InventoryPage(){
  const {data,loading,error,reload}=useApiResource<{parts:InventoryPart[];movements:Movement[];alerts:Alert[]}>('/managers/inventory')
  const [search,setSearch]=useState('')
  const [onlyLow,setOnlyLow]=useState(false)
  const parts=(data?.parts??[]).filter(part=>(!onlyLow||part.low_stock)&&`${part.sku} ${part.name} ${part.manufacturer??''}`.toLocaleLowerCase('sl').includes(search.toLocaleLowerCase('sl')))
  const low=(data?.parts??[]).filter(part=>part.active!==false&&part.low_stock)
  return <section className="dashboard-content request-page" aria-label="Zaloga"><h1>Zaloga rezervnih delov</h1>
    <div className="request-actions"><label>Išči del<input type="search" value={search} onChange={event=>setSearch(event.target.value)} className="request-filter"/></label><label><input type="checkbox" checked={onlyLow} onChange={event=>setOnlyLow(event.target.checked)}/>Samo nizka zaloga</label><button type="button" onClick={reload}>Osveži zalogo</button></div>
    {loading&&<p role="status">Nalaganje zaloge ...</p>}{error&&<div role="alert">{error}<button type="button" onClick={reload}>Poskusi znova</button></div>}
    {!loading&&!error&&<>
      {low.length>0&&<div role="alert" className="request-confirmation"><h2>Nizka zaloga ({low.length})</h2><p>Priporočamo dopolnitev naslednjih delov:</p><ul>{low.map(part=><li key={part.id}>{part.name} · Na voljo {part.quantity_on_hand}, meja {part.low_stock_threshold}</li>)}</ul></div>}
      <h2>Katalog in stanje</h2>{parts.length===0&&<p>Ni delov za prikaz.</p>}{parts.map(part=><article className="request-card" key={part.id}><h3>{part.sku} · {part.name}</h3><p>Proizvajalec: {part.manufacturer||'Ni podatka'}</p><dl><dt>Na zalogi</dt><dd>{part.quantity_on_hand}</dd><dt>Meja za dopolnitev</dt><dd>{part.low_stock_threshold}</dd><dt>Stanje</dt><dd>{part.active===false?'Neaktiven':part.low_stock?'Potrebna dopolnitev':'Na voljo'}</dd></dl></article>)}
      <h2>Zadnji premiki zaloge</h2>{(data?.movements??[]).length===0&&<p>Ni evidentiranih premikov.</p>}{data?.movements?.map(item=><article key={item.id} className="request-card"><h3>{item.sku} · {item.name}</h3><p>{reasons[item.reason]??item.reason} · {item.quantity_delta>0?'+':''}{item.quantity_delta} · Stanje po premiku: {item.stock_after}</p><p>{formatRequestDate(item.created_at,true)}{item.report_id?` · Poročilo #${item.report_id} · Servis #${item.service_id}`:''}</p></article>)}
    </>}
  </section>
}
