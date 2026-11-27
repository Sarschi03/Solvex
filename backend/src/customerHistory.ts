import type { Router } from "express";
import type { Pool } from "pg";
import { requireSession, sessionAccount } from "./profiles.js";
import { positiveId } from "./assignmentAccess.js";

// Only an explicitly recorded regular inspection establishes the annual cycle.
export const inspectionCycles = `WITH latest AS (
 SELECT DISTINCT ON (s.id_solar_plant) s.id AS service_id,s.id_solar_plant,
 COALESCE(sr.performed_at,s.completed_at) AS inspected_at
 FROM services s JOIN service_requests r ON r.id=s.id_service_request
 JOIN service_reports sr ON sr.id_service=s.id AND sr.submitted_at IS NOT NULL
 WHERE s.status='completed' AND r.request_type='regular_inspection'
 AND COALESCE(sr.performed_at,s.completed_at)<=NOW()
 ORDER BY s.id_solar_plant,COALESCE(sr.performed_at,s.completed_at) DESC NULLS LAST,s.id DESC
), cycles AS (
 SELECT l.*,p.id_customer,p.name AS plant_name,
 (l.inspected_at AT TIME ZONE 'Europe/Ljubljana')::date + INTERVAL '1 year' AS due_at
 FROM latest l JOIN solar_plants p ON p.id_solar_plants=l.id_solar_plant
)`;

export async function refreshInspectionRecommendations(pool: Pool) {
  await pool.query(`${inspectionCycles} INSERT INTO notifications(customer_id,service_id,kind,message)
    SELECT c.id_customer,c.service_id,'inspection_recommendation',
    'Predlog za vzdrževanje: '||c.plant_name||'. Letni redni pregled priporočamo do '||to_char(c.due_at,'DD. MM. YYYY')||'.'
    FROM cycles c JOIN customers owner ON owner.id=c.id_customer
    WHERE owner.recommendations_enabled AND (NOW() AT TIME ZONE 'Europe/Ljubljana')::date>=c.due_at-INTERVAL '1 month'
    ON CONFLICT (customer_id,service_id) WHERE kind='inspection_recommendation' DO NOTHING`);
}

export function installCustomerHistoryRoutes(router: Router,pool: Pool) {
  router.get('/plants/:plantId/history',requireSession(pool,['customer']),async(request,response)=>{
    if(!positiveId(request.params.plantId)) return response.status(400).json({message:'ID elektrarne ni veljaven.'});
    try {
      const plant=(await pool.query('SELECT id_solar_plants AS id,name FROM solar_plants WHERE id_solar_plants=$1 AND id_customer=$2',[request.params.plantId,sessionAccount(response).id])).rows[0];
      if(!plant) return response.status(404).json({message:'Elektrarna ni bila najdena.'});
      const result=await pool.query(`SELECT s.id,s.service_type,s.completed_at,COALESCE(sr.performed_at,s.completed_at,s.scheduled_at) AS performed_at,
        r.request_type,r.fault_type,r.description AS reported_problem,r.requested_services,
        sr.customer_summary,sr.outcome,sr.plant_condition,COALESCE(sr.parts_used,'[]'::jsonb) AS parts_used
        FROM services s JOIN solar_plants p ON p.id_solar_plants=s.id_solar_plant
        LEFT JOIN service_requests r ON r.id=s.id_service_request
        LEFT JOIN service_reports sr ON sr.id_service=s.id AND sr.submitted_at IS NOT NULL
        WHERE s.id_solar_plant=$1 AND p.id_customer=$2 AND s.status='completed'
        ORDER BY COALESCE(sr.performed_at,s.completed_at,s.scheduled_at) DESC NULLS LAST,s.id DESC`,[plant.id,sessionAccount(response).id]);
      return response.json({plant,services:result.rows.map(row=>({...row,parts_used:row.parts_used.map((part:Record<string,unknown>)=>({name:part.name,manufacturer:part.manufacturer,quantity:part.quantity,replaced:part.replaced,installed_on:part.installed_on}))}))});
    }catch{return response.status(500).json({message:'Zgodovine ni bilo mogoče naložiti.'});}
  });
  router.get('/account/recommendations',requireSession(pool,['customer']),async(_request,response)=>{
    try {
      const id=sessionAccount(response).id;
      const enabled=(await pool.query('SELECT recommendations_enabled FROM customers WHERE id=$1',[id])).rows[0].recommendations_enabled;
      await refreshInspectionRecommendations(pool);
      const result=enabled?await pool.query(`${inspectionCycles} SELECT service_id,id_solar_plant AS plant_id,plant_name,inspected_at,due_at::date,
        due_at::date<(NOW() AT TIME ZONE 'Europe/Ljubljana')::date AS overdue FROM cycles
        WHERE id_customer=$1 AND (NOW() AT TIME ZONE 'Europe/Ljubljana')::date>=due_at-INTERVAL '1 month' ORDER BY due_at,service_id`,[id]):{rows:[]};
      return response.json({enabled,recommendations:result.rows});
    }catch{return response.status(500).json({message:'Priporočil ni bilo mogoče naložiti.'});}
  });
  router.patch('/account/recommendations',requireSession(pool,['customer']),async(request,response)=>{
    if(typeof request.body?.enabled!=='boolean'||Object.keys(request.body).some(key=>key!=='enabled'))return response.status(400).json({message:'Izberi veljavno nastavitev priporočil.'});
    try{await pool.query('UPDATE customers SET recommendations_enabled=$2 WHERE id=$1',[sessionAccount(response).id,request.body.enabled]);return response.json({enabled:request.body.enabled});}
    catch{return response.status(500).json({message:'Nastavitve ni bilo mogoče shraniti.'});}
  });
}
