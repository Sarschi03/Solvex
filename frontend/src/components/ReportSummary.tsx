import type { ServiceReport } from '../types'
import { formatRequestDate } from '../lib/requestFlow'
import { useState } from 'react'
const condition = { operational:'Deluje normalno',limited:'Deluje omejeno',not_operational:'Ne deluje' }
export function ReportSummary({ report }: { report: Partial<ServiceReport> }) {
  const [now] = useState(()=>Date.now())
  return <div className="report-structured-summary"><p>Izvedeno: {formatRequestDate(report.performed_at,true)}</p><p>Stanje elektrarne: {report.plant_condition?condition[report.plant_condition]:'Ni podatka'}</p><p>Rezultat: {report.outcome==='resolved'?'Odpravljeno / pregled opravljen':report.outcome==='follow_up'?'Potreben nadaljnji poseg':'Ni podatka'}</p><p>Ugotovljena napaka: {report.fault_found===true?'Da':report.fault_found===false?'Ne':'Ni podatka'}</p>{report.fault_cause&&<p>Vzrok: {report.fault_cause}</p>}
    <h4>Porabljeni / zamenjani deli</h4>{report.parts_used?.length?<ul>{report.parts_used.map((part,index)=><li key={index}>{part.name} · {part.quantity} kos · {part.manufacturer||'Proizvajalec ni znan'} · {part.replaced?'Zamenjan / nameščen':'Porabljen'}{part.installed_on&&<> · Namestitev: {formatRequestDate(part.installed_on)} · Starost: približno {Math.max(0,Math.floor((now-Date.parse(part.installed_on))/86400000))} dni</>}</li>)}</ul>:<p>Ni zabeleženih delov.</p>}
  </div>
}
