import { useState } from 'react'
import type { ReportPart, ServiceReport } from '../types'
const localDate = (value?: string | null) => { if (!value) return ''; const date=new Date(value);date.setMinutes(date.getMinutes()-date.getTimezoneOffset());return date.toISOString().slice(0,16) }
export function ReportStructuredFields({ report }: { report: ServiceReport | null }) {
  const [parts,setParts] = useState<ReportPart[]>(report?.parts_used ?? [])
  function update(index: number, change: Partial<ReportPart>) { setParts(current=>current.map((part,i)=>i===index?{...part,...change}:part)) }
  return <>
    <div className="field"><label htmlFor="performed-at">Datum in čas izvedbe</label><input id="performed-at" name="performed_at" type="datetime-local" defaultValue={localDate(report?.performed_at)} /></div>
    <div className="field"><label htmlFor="plant-condition">Stanje elektrarne po posegu</label><select id="plant-condition" name="plant_condition" defaultValue={report?.plant_condition ?? ''}><option value="">Še ni določeno</option><option value="operational">Deluje normalno</option><option value="limited">Deluje omejeno</option><option value="not_operational">Ne deluje</option></select></div>
    <div className="field"><label htmlFor="report-outcome">Rezultat servisa</label><select id="report-outcome" name="outcome" defaultValue={report?.outcome ?? ''}><option value="">Še ni določeno</option><option value="resolved">Odpravljeno / pregled opravljen</option><option value="follow_up">Potreben nadaljnji poseg</option></select></div>
    <div className="field"><label htmlFor="fault-found">Je bila ugotovljena napaka?</label><select id="fault-found" name="fault_found" defaultValue={report?.fault_found === true?'yes':report?.fault_found === false?'no':''}><option value="">Še ni določeno</option><option value="yes">Da</option><option value="no">Ne</option></select></div>
    <div className="field report-form-wide"><label htmlFor="fault-cause">Vzrok napake (obvezno ob ugotovljeni napaki)</label><textarea id="fault-cause" name="fault_cause" rows={2} maxLength={2000} defaultValue={report?.fault_cause ?? ''} /></div>
    <fieldset className="report-form-wide request-extras"><legend>Porabljeni in zamenjani deli</legend>
      {parts.map((part,index)=><fieldset key={index} className="report-part"><legend>Del {index+1}</legend>
        <label>Naziv dela<input value={part.name} maxLength={100} required onChange={event=>update(index,{name:event.target.value})} /></label>
        <label>Proizvajalec<input value={part.manufacturer ?? ''} maxLength={100} onChange={event=>update(index,{manufacturer:event.target.value||null})} /></label>
        <label>Količina<input type="number" min={1} max={10000} value={part.quantity} required onChange={event=>update(index,{quantity:Number(event.target.value)})} /></label>
        <label><input type="checkbox" checked={part.replaced} onChange={event=>update(index,{replaced:event.target.checked})} />Del je bil zamenjan / nameščen</label>
        <label>Datum namestitve (neobvezno)<input type="date" max={new Date().toISOString().slice(0,10)} value={part.installed_on ?? ''} onChange={event=>update(index,{installed_on:event.target.value||null})} /></label>
        <button type="button" onClick={()=>setParts(current=>current.filter((_,i)=>i!==index))}>Odstrani del {index+1}</button>
      </fieldset>)}
      <button type="button" onClick={()=>setParts(current=>[...current,{name:'',manufacturer:null,quantity:1,replaced:true,installed_on:null}])} disabled={parts.length>=50}>Dodaj del</button>
      <input type="hidden" name="parts_used" value={JSON.stringify(parts)} />
    </fieldset>
    <p className="field-hint report-form-wide">Osnutek lahko shraniš tudi brez vseh podatkov. Pred oddajo dopolni čas izvedbe, stanje, rezultat in podatke o napaki. Poročilo za ekipo odda samo vodja.</p>
  </>
}
