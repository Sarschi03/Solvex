import type { Router, Request, Response } from "express";
import type { Pool } from "pg";
import { requireSession, sessionAccount } from "./profiles.js";
import { assignedTo, leaderOf, positiveId, scheduleColumns } from "./assignmentAccess.js";
import { notify } from "./scheduling.js";
import { consumeInventory, prepareInventoryParts, InventoryError } from "./inventory.js";

const structured = 'sr.performed_at,sr.plant_condition,sr.outcome,sr.fault_found,sr.fault_cause,sr.parts_used';
const reportColumns = `sr.id,sr.id_service,sr.work_summary,sr.findings,sr.recommendations,sr.reported_at,sr.submitted_at,${structured},s.service_type,sp.name AS solar_plant_name,e.first_name AS employee_first_name,e.last_name AS employee_last_name`;
const reportJoin = 'FROM service_reports sr JOIN services s ON s.id=sr.id_service JOIN solar_plants sp ON sp.id_solar_plants=s.id_solar_plant JOIN employees e ON e.id=sr.id_employee';
class InvalidReport extends Error {}
function fail(message: string): never { throw new InvalidReport(message); }
function optionalText(value: unknown, limit=4000): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.trim().length>limit) return fail(`Besedilo lahko vsebuje največ ${limit} znakov.`);
  return value.trim() || null;
}
function reportData(body: Record<string,unknown>, old: Record<string,unknown> = {}) {
  const allowed=['id_service','work_summary','findings','recommendations','reported_at','performed_at','plant_condition','outcome','fault_found','fault_cause','parts_used'];
  if (Object.keys(body).some(key=>!allowed.includes(key))) fail('Poročilo vsebuje neznana polja.');
  const data={work_summary:'',findings:null,recommendations:null,performed_at:null,plant_condition:null,outcome:null,fault_found:null,fault_cause:null,parts_used:[],...old,...body} as Record<string,unknown>;
  const summary=optionalText(data.work_summary);
  if(!summary) fail('Povzetek dela je obvezen.');
  const performed=data.performed_at instanceof Date?data.performed_at.toISOString():data.performed_at;
  if(performed!==null && (typeof performed!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(performed)||!Number.isFinite(Date.parse(performed))||Date.parse(performed)>Date.now()+60000)) fail('Čas izvedbe mora biti veljaven in ne sme biti v prihodnosti.');
  if(typeof performed==='string'&&(performed.startsWith('0000')||new Date(`${performed.slice(0,10)}T00:00:00Z`).toISOString().slice(0,10)!==performed.slice(0,10))) fail('Datum izvedbe ni veljaven.');
  if(data.plant_condition!==null&&(typeof data.plant_condition!=='string'||!['operational','limited','not_operational'].includes(data.plant_condition))) fail('Izberi veljavno stanje elektrarne.');
  if(data.outcome!==null&&(typeof data.outcome!=='string'||!['resolved','follow_up'].includes(data.outcome))) fail('Izberi veljaven rezultat servisa.');
  if(data.fault_found!==null&&typeof data.fault_found!=='boolean') fail('Prisotnost napake mora biti true ali false.');
  const reported=body.reported_at ?? old.reported_at ?? new Date();
  const reportedDate=reported instanceof Date?reported:new Date(String(reported));
  if(Number.isNaN(reportedDate.getTime())) fail('Datum poročila ni veljaven.');
  if(!Array.isArray(data.parts_used)||data.parts_used.length>50) fail('Vnesi največ 50 postavk delov.');
  const parts=data.parts_used.map(value=>{
    if(!value||typeof value!=='object'||Array.isArray(value)) return fail('Postavka dela ni veljavna.');
    const part=value as Record<string,unknown>;
    if(Object.keys(part).some(key=>!['inventory_part_id','name','manufacturer','quantity','replaced','installed_on'].includes(key))) return fail('Postavka dela vsebuje neznana polja.');
    const inventoryId=part.inventory_part_id ?? null;
    if(inventoryId!==null&&!positiveId(inventoryId)) return fail('Izberi veljaven del iz kataloga.');
    const name=optionalText(part.name,100) ?? (inventoryId?'Kataloški del':null),manufacturer=optionalText(part.manufacturer,100);
    if(!name||typeof part.quantity!=='number'||!Number.isInteger(part.quantity)||part.quantity<1||part.quantity>10000) return fail('Del potrebuje naziv in pozitivno celo količino do 10000.');
    const replaced=part.replaced ?? true;
    if(typeof replaced!=='boolean') return fail('Menjava dela mora biti true ali false.');
    const installed=part.installed_on ?? (replaced&&typeof performed==='string'?performed.slice(0,10):null);
    if(installed!==null&&(typeof installed!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(installed)||installed.startsWith('0000')||!Number.isFinite(Date.parse(`${installed}T00:00:00Z`))||new Date(`${installed}T00:00:00Z`).toISOString().slice(0,10)!==installed||installed>new Date().toISOString().slice(0,10))) return fail('Datum namestitve dela ni veljaven.');
    return {inventory_part_id:inventoryId,name,manufacturer,quantity:part.quantity,replaced,installed_on:installed};
  });
  return {work_summary:summary,findings:optionalText(data.findings),recommendations:optionalText(data.recommendations),reported_at:reportedDate.toISOString(),performed_at:performed as string|null,plant_condition:data.plant_condition,outcome:data.outcome,fault_found:data.fault_found,fault_cause:optionalText(data.fault_cause,2000),parts_used:parts};
}

export function installTechnicianRoutes(router: Router,pool: Pool) {
  router.get('/employees/:employeeId/services/:serviceId',requireSession(pool,['employee'],true),async(request,response)=>{
    if(!positiveId(request.params.serviceId)) return response.status(400).json({message:'ID servisa ni veljaven.'});
    try {
      const service=(await pool.query(`SELECT ${scheduleColumns},s.notes,${leaderOf('$2')} AS can_report,r.fault_type,r.description AS request_description FROM services s JOIN solar_plants sp ON sp.id_solar_plants=s.id_solar_plant LEFT JOIN service_requests r ON r.id=s.id_service_request WHERE s.id=$1 AND ${assignedTo('$2')}`,[request.params.serviceId,sessionAccount(response).id])).rows[0];
      if(!service) return response.status(404).json({message:'Servis ni bil najden.'});
      const plant=(await pool.query(`SELECT sp.id_solar_plants AS id,sp.name,sp.manufacturer,sp.installation_year,sp.installed_capacity_kw,sp.panel_count,sp.has_battery,sp.battery_capacity_kwh,to_char(sp.installed_on,'YYYY-MM-DD') AS installed_on,sp.installation_address,sp.postal_code,sp.city,c.first_name AS customer_first_name,c.last_name AS customer_last_name,c.email AS customer_email,c.phone AS customer_phone FROM solar_plants sp JOIN customers c ON c.id=sp.id_customer WHERE sp.id_solar_plants=$1`,[service.id_solar_plant])).rows[0];
      const history=await pool.query(`SELECT s.id,s.service_type,s.completed_at,sr.work_summary,sr.findings,sr.recommendations,sr.performed_at,sr.plant_condition,sr.outcome,sr.fault_found,sr.fault_cause,sr.parts_used FROM services s LEFT JOIN service_reports sr ON sr.id_service=s.id AND sr.submitted_at IS NOT NULL WHERE s.id_solar_plant=$1 AND s.status='completed' AND s.id<>$2 ORDER BY s.completed_at DESC NULLS LAST,s.id DESC LIMIT 5`,[service.id_solar_plant,service.id]);
      return response.json({service,plant,recent_history:history.rows});
    } catch { return response.status(500).json({message:'Podrobnosti servisa ni bilo mogoče naložiti.'}); }
  });
  router.get('/employees/:employeeId/service-reports',requireSession(pool,['employee','manager'],true),async(request,response)=>{
    try {
      const manager=sessionAccount(response).role==='manager';
      const result=await pool.query(`SELECT ${reportColumns} ${reportJoin} WHERE sr.id_employee=$1 AND ($2::boolean OR ${assignedTo('$1')}) AND (NOT $2::boolean OR sr.submitted_at IS NOT NULL) ORDER BY sr.reported_at DESC,sr.id DESC`,[request.params.employeeId,manager]);
      return response.json({reports:result.rows});
    } catch { return response.status(500).json({message:'Poročil ni bilo mogoče naložiti.'}); }
  });
  async function change(request: Request,response: Response) {
    const employee=sessionAccount(response).id;
    const reportId=request.params.reportId;
    const submitting=request.path.endsWith('/submit');
    const editing=reportId!==undefined;
    const body=(request.body??{}) as Record<string,unknown>;
    const serviceId=editing?null:(typeof body.id_service==='number'?String(body.id_service):body.id_service);
    if((editing&&!positiveId(reportId))||(!editing&&!positiveId(serviceId))) return response.status(400).json({message:'Izberi veljaven servis oziroma poročilo.'});
    if(!body||typeof body!=='object'||Array.isArray(body)) return response.status(400).json({message:'Podatki poročila niso veljavni.'});
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const hint=editing?(await client.query('SELECT id_service FROM service_reports WHERE id=$1 AND id_employee=$2',[reportId,employee])).rows[0]?.id_service:serviceId;
      if(!hint) {await client.query('ROLLBACK');return response.status(404).json({message:'Servisno poročilo ni bilo najdeno.'});}
      const parent=(await client.query('SELECT id_service_request FROM services WHERE id=$1',[hint])).rows[0];
      if(parent?.id_service_request) await client.query('SELECT id FROM service_requests WHERE id=$1 FOR UPDATE',[parent.id_service_request]);
      const service=(await client.query(`SELECT s.*,${leaderOf('$2')} AS allowed FROM services s WHERE s.id=$1 FOR UPDATE`,[hint,employee])).rows[0];
      if(!service?.allowed) {await client.query('ROLLBACK');return response.status(editing?404:400).json({message:'Poročilo lahko piše samo trenutni vodja dodeljene ekipe.'});}
      const old=(await client.query('SELECT * FROM service_reports WHERE id_service=$1 FOR UPDATE',[hint])).rows[0];
      if((!editing&&old)||old?.submitted_at) {await client.query('ROLLBACK');return response.status(409).json({message:old?.submitted_at?'Oddanega poročila ni več mogoče spreminjati.':'Poročilo za ta servis že obstaja.'});}
      if(editing&&(!old||old.id_employee!==employee)) {await client.query('ROLLBACK');return response.status(404).json({message:'Poročilo ni bilo najdeno.'});}
      if(['completed','cancelled'].includes(service.status)) {await client.query('ROLLBACK');return response.status(409).json({message:'Za zaključen ali preklican servis ni mogoče pisati poročila.'});}
      if(editing&&Object.hasOwn(body,'id_service')) fail('Servisa poročila ni mogoče zamenjati.');
      const data=reportData(submitting?{}:body,old);
      if(submitting&&(!data.performed_at||!data.plant_condition||!data.outcome||typeof data.fault_found!=='boolean'||(data.fault_found&&!data.fault_cause))) fail('Pred oddajo dopolni čas izvedbe, stanje elektrarne, rezultat in podatke o napaki.');
      let id=old?.id;
      if(!submitting) {
        data.parts_used=await prepareInventoryParts(client,data.parts_used);
        const values=[data.work_summary,data.findings,data.recommendations,data.reported_at,data.performed_at,data.plant_condition,data.outcome,data.fault_found,data.fault_cause,JSON.stringify(data.parts_used)];
        if(editing) await client.query(`UPDATE service_reports SET work_summary=$2,findings=$3,recommendations=$4,reported_at=$5,performed_at=$6,plant_condition=$7,outcome=$8,fault_found=$9,fault_cause=$10,parts_used=$11 WHERE id=$1`,[id,...values]);
        else id=(await client.query(`INSERT INTO service_reports (id_service,id_employee,work_summary,findings,recommendations,reported_at,performed_at,plant_condition,outcome,fault_found,fault_cause,parts_used) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[hint,employee,...values])).rows[0].id;
        await client.query("UPDATE services SET status='in_progress' WHERE id=$1",[hint]);
      } else {
        if(old.inventory_posted_at) throw new InventoryError('Zaloga za to poročilo je že knjižena.');
        await consumeInventory(client,id,service.id,data.parts_used);
        await client.query('UPDATE service_reports SET submitted_at=NOW(),inventory_posted_at=NOW() WHERE id=$1',[id]);
        await client.query("UPDATE services SET status='completed',completed_at=NOW() WHERE id=$1",[hint]);
        if(service.id_service_request) {
          if(data.outcome==='follow_up') await client.query('UPDATE service_requests SET follow_up_required=true WHERE id=$1',[service.id_service_request]);
          await client.query(`UPDATE service_requests SET status=CASE WHEN EXISTS(SELECT 1 FROM services WHERE id_service_request=$1 AND status NOT IN ('completed','cancelled')) THEN 'scheduled' WHEN follow_up_required THEN 'reviewing' ELSE 'completed' END WHERE id=$1`,[service.id_service_request]);
        }
        const owner=(await client.query('SELECT id_customer FROM solar_plants WHERE id_solar_plants=$1',[service.id_solar_plant])).rows[0].id_customer;
        await notify(client,'customer_id',owner,service.id,'completed',`Servis #${service.id} je opravljen.${data.outcome==='follow_up'?' Potreben je nadaljnji poseg.':''}`);
        const consumption = data.parts_used.length ? ` Porabljeni deli: ${data.parts_used.map(part=>`${part.name} × ${part.quantity}`).join(', ')}.` : ' Rezervni deli niso bili porabljeni.';
        if(service.id_manager) await notify(client,'manager_id',service.id_manager,service.id,'completed',`Oddano je poročilo za servis #${service.id}.${consumption}${data.outcome==='follow_up'?' Potreben je nadaljnji poseg.':''}`);
      }
      const result=await client.query(`SELECT ${reportColumns} ${reportJoin} WHERE sr.id=$1`,[id]);
      await client.query('COMMIT');
      return response.status(editing?200:201).json({message:submitting?'Poročilo je oddano, zaklenjeno in servis zaključen.':'Poročilo je uspešno shranjeno.',report:result.rows[0]});
    } catch(error) {
      await client.query('ROLLBACK');
      if(error instanceof InvalidReport) return response.status(400).json({message:error.message});
      if(error instanceof InventoryError) return response.status(error.status).json({message:error.message});
      console.error('Report workflow failed:',error);return response.status(500).json({message:'Poročila ni bilo mogoče obdelati.'});
    } finally {client.release();}
  }
  router.post('/employees/:employeeId/service-reports',requireSession(pool,['employee'],true),change);
  router.put('/employees/:employeeId/service-reports/:reportId',requireSession(pool,['employee'],true),change);
  router.post('/employees/:employeeId/service-reports/:reportId/submit',requireSession(pool,['employee'],true),change);
}
