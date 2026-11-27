import { useState } from 'react'
import type { ReportPart, ServiceReport } from '../types'
import { useApiResource } from '../hooks/useApiResource'
import type { InventoryPart } from '../pages/InventoryPage'
const localDate = (value?: string | null) => { if (!value) return ''; const date=new Date(value);date.setMinutes(date.getMinutes()-date.getTimezoneOffset());return date.toISOString().slice(0,16) }
export function ReportStructuredFields({ report }: { report: ServiceReport | null }) {
  const catalog=useApiResource<{parts:InventoryPart[]}>('/inventory/parts')
  const [parts,setParts] = useState<ReportPart[]>(report?.parts_used ?? [])
  function update(index: number, change: Partial<ReportPart>) { setParts(current=>current.map((part,i)=>i===index?{...part,...change}:part)) }
  return <>
    <div className="field report-form-wide"><label htmlFor="customer-summary">Povzetek za lastnika (brez internih opomb)</label><textarea id="customer-summary" name="customer_summary" maxLength={4000} rows={3} defaultValue={report?.customer_summary??''}/><p>Opiši opravljeno delo in odpravo težave. Lastnik vidi samo ta povzetek, stanje in uporabljene dele.</p></div>
    <div className="field"><label htmlFor="performed-at">Datum in čas izvedbe</label><input id="performed-at" name="performed_at" type="datetime-local" defaultValue={localDate(report?.performed_at)} /></div>
    <div className="field"><label htmlFor="plant-condition">Stanje elektrarne po posegu</label><select id="plant-condition" name="plant_condition" defaultValue={report?.plant_condition ?? ''}><option value="">Še ni določeno</option><option value="operational">Deluje normalno</option><option value="limited">Deluje omejeno</option><option value="not_operational">Ne deluje</option></select></div>
    <div className="field"><label htmlFor="report-outcome">Rezultat servisa</label><select id="report-outcome" name="outcome" defaultValue={report?.outcome ?? ''}><option value="">Še ni določeno</option><option value="resolved">Odpravljeno / pregled opravljen</option><option value="follow_up">Potreben nadaljnji poseg</option></select></div>
    <div className="field"><label htmlFor="fault-found">Je bila ugotovljena napaka?</label><select id="fault-found" name="fault_found" defaultValue={report?.fault_found === true?'yes':report?.fault_found === false?'no':''}><option value="">Še ni določeno</option><option value="yes">Da</option><option value="no">Ne</option></select></div>
    <div className="field report-form-wide"><label htmlFor="fault-cause">Vzrok napake (obvezno ob ugotovljeni napaki)</label><textarea id="fault-cause" name="fault_cause" rows={2} maxLength={2000} defaultValue={report?.fault_cause ?? ''} /></div>
    <fieldset className="report-form-wide request-extras"><legend>Porabljeni in zamenjani deli</legend>
      {catalog.loading&&<p role="status">Nalaganje kataloga delov ...</p>}
      {catalog.error&&<div role="alert">{catalog.error}<button type="button" onClick={catalog.reload}>Ponovno naloži katalog</button></div>}
      {!catalog.loading&&!catalog.error&&(catalog.data?.parts??[]).length===0&&<p>Katalog je prazen. Dele mora najprej dodati skrbnik zaloge.</p>}
      {parts.map((part,index)=><fieldset key={index} className="report-part"><legend>Del {index+1}</legend>
        <label>Del iz zaloge<select value={part.inventory_part_id ?? ''} required onChange={event=>{const selected=catalog.data?.parts.find(item=>item.id===event.target.value);if(selected)update(index,{inventory_part_id:selected.id,name:selected.name,manufacturer:selected.manufacturer})}}><option value="">Izberi kataloški del</option>{catalog.data?.parts.map(item=><option key={item.id} value={item.id}>{item.sku} · {item.name} · Na zalogi: {item.quantity_on_hand}</option>)}</select></label>
        {part.name&&<p>{!part.inventory_part_id?'Stari zapis: ':''}{part.name} · Proizvajalec: {part.manufacturer||'Ni podatka'}</p>}
        <label>Količina<input type="number" min={1} max={10000} value={part.quantity} required onChange={event=>update(index,{quantity:Number(event.target.value)})} /></label>
        <label><input type="checkbox" checked={part.replaced} onChange={event=>update(index,{replaced:event.target.checked})} />Del je bil zamenjan / nameščen</label>
        <label>Datum namestitve (neobvezno)<input type="date" max={new Date().toISOString().slice(0,10)} value={part.installed_on ?? ''} onChange={event=>update(index,{installed_on:event.target.value||null})} /></label>
        <button type="button" onClick={()=>setParts(current=>current.filter((_,i)=>i!==index))}>Odstrani del {index+1}</button>
      </fieldset>)}
      <button type="button" onClick={()=>setParts(current=>[...current,{inventory_part_id:null,name:'',manufacturer:null,quantity:1,replaced:true,installed_on:null}])} disabled={parts.length>=50||catalog.loading||!catalog.data?.parts?.length}>Dodaj del</button>
      <input type="hidden" name="parts_used" value={JSON.stringify(parts)} />
    </fieldset>
    <p className="field-hint report-form-wide">Osnutek ne rezervira zaloge. Pred oddajo izberi kataloške dele in dopolni čas izvedbe, stanje, rezultat ter podatke o napaki. Ob oddaji se preveri zaloga in odpiše porabljena količina. Poročilo za ekipo odda samo vodja.</p>
  </>
}
