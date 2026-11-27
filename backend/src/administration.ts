import type { Router } from "express";
import type { Pool } from "pg";
import { requireSession,sessionAccount,type Role } from "./profiles.js";
import { accountTables,accountColumns } from "./accountAccess.js";
import { positiveId } from "./assignmentAccess.js";
const roles:Role[]=['customer','employee','manager','administrator'];
class AdministrationError extends Error{constructor(message:string,public status=409){super(message);}}
const identitySelect=`SELECT r.id,r.active_role AS role,r.enabled,
 COALESCE(c.first_name,e.first_name,m.first_name,a.first_name) AS first_name,
 COALESCE(c.last_name,e.last_name,m.last_name,a.last_name) AS last_name,
 COALESCE(c.email,e.email,m.email,a.email) AS email
 FROM account_registry r
 LEFT JOIN customers c ON r.active_role='customer' AND c.id=r.customer_id
 LEFT JOIN employees e ON r.active_role='employee' AND e.id=r.employee_id
 LEFT JOIN managers m ON r.active_role='manager' AND m.id=r.manager_id
 LEFT JOIN administrators a ON r.active_role='administrator' AND a.id=r.administrator_id`;
function validDate(value:unknown):value is string{return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!value.startsWith('0000')&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function installAdministrationRoutes(router:Router,pool:Pool){
  router.get('/admin/accounts',requireSession(pool,['administrator']),async(_request,response)=>{
    try{return response.json({accounts:(await pool.query(`${identitySelect} ORDER BY r.id`)).rows});}catch{return response.status(500).json({message:'Računov ni bilo mogoče naložiti.'});}
  });
  router.patch('/admin/accounts/:accountId',requireSession(pool,['administrator']),async(request,response)=>{
    const body=request.body??{};
    if(!positiveId(request.params.accountId)||Object.keys(body).some(key=>!['role','enabled','service_type','address','postal_code','city','phone'].includes(key))||(!('role'in body)&&!('enabled'in body))||('role'in body&&!roles.includes(body.role))||('enabled'in body&&typeof body.enabled!=='boolean'))return response.status(400).json({message:'Izberi veljavno vlogo ali stanje računa.'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(730115)');
      if(!(await client.query("SELECT id FROM account_registry WHERE administrator_id=$1 AND active_role='administrator' AND enabled",[sessionAccount(response).id])).rowCount)throw new AdministrationError('Dostop ni dovoljen.',403);
      const record=(await client.query('SELECT * FROM account_registry WHERE id=$1 FOR UPDATE',[request.params.accountId])).rows[0];
      if(!record)throw new AdministrationError('Račun ni bil najden.',404);
      const role:Role=body.role??record.active_role,enabled=body.enabled??record.enabled;
      if(record.administrator_id===sessionAccount(response).id&&(role!=='administrator'||!enabled))throw new AdministrationError('Svojega administratorskega dostopa ne moreš odstraniti.');
      if(record.active_role==='administrator'&&record.enabled&&(role!=='administrator'||!enabled)){
        const count=(await client.query("SELECT count(*)::int AS n FROM account_registry WHERE active_role='administrator' AND enabled")).rows[0].n;
        if(count<=1)throw new AdministrationError('Zadnji aktivni administrator mora ostati omogočen.');
      }
      if((!enabled||role!==record.active_role)&&record.active_role==='employee'){
        const active=await client.query("SELECT s.id FROM services s WHERE s.status NOT IN ('completed','cancelled') AND (s.id_employee=$1 OR EXISTS(SELECT 1 FROM service_assignments sa WHERE sa.service_id=s.id AND sa.employee_id=$1))",[record.employee_id]);
        if(active.rowCount)throw new AdministrationError('Najprej prerazporedi aktivne servise zaposlenega.');
      }
      if((!enabled||role!==record.active_role)&&record.active_role==='manager'){
        if((await client.query("SELECT id FROM services WHERE id_manager=$1 AND status NOT IN ('completed','cancelled')",[record.manager_id])).rowCount)throw new AdministrationError('Najprej prerazporedi aktivne servise vodje.');
      }
      if(role!==record.active_role){
        const source=(await client.query(`SELECT * FROM ${accountTables[record.active_role as Role]} WHERE id=$1`,[record[accountColumns[record.active_role as Role]]])).rows[0];
        let target=record[accountColumns[role]];
        if(!target){
          const text=(key:string,limit:number)=>{const value=body[key]??source[key];if(typeof value!=='string'||!value.trim()||value.trim().length>limit)throw new AdministrationError('Dopolni obvezne podatke nove vloge (naslov/telefon/specializacija).',400);return value.trim();};
          const fields=['first_name','last_name','email','password_hash','profile_image_data'],values:unknown[]=[source.first_name,source.last_name,source.email,source.password_hash,source.profile_image_data];
          if(role==='customer'){fields.push('address','postal_code','city');values.push(text('address',1000),text('postal_code',20),text('city',100));}
          if(role==='employee'||role==='manager'){fields.push('phone');values.push(text('phone',30));}
          if(role==='employee'){if(!['cleaning','electrical','installer'].includes(body.service_type))throw new AdministrationError('Izberi specializacijo serviserja.',400);fields.push('service_type');values.push(body.service_type);}
          target=(await client.query(`INSERT INTO ${accountTables[role]}(${fields.join(',')}) VALUES(${values.map((_,index)=>`$${index+1}`).join(',')}) RETURNING id`,values)).rows[0].id;
          // The insert trigger creates an identity; attach this profile to the original identity.
          await client.query(`DELETE FROM account_registry WHERE ${accountColumns[role]}=$1`,[target]);
          await client.query(`UPDATE account_registry SET ${accountColumns[role]}=$2 WHERE id=$1`,[record.id,target]);
        }else await client.query(`UPDATE ${accountTables[role]} SET first_name=$2,last_name=$3,email=$4,password_hash=$5,profile_image_data=$6 WHERE id=$1`,[target,source.first_name,source.last_name,source.email,source.password_hash,source.profile_image_data]);
        const aliasColumns=Object.values(accountColumns).map(column=>`${column}=${column===accountColumns[role]?'$2':'NULL'}`).join(',');
        await client.query(`UPDATE account_usernames SET ${aliasColumns} WHERE customer_id=$1 OR employee_id=$3 OR manager_id=$4 OR administrator_id=$5`,[record.customer_id,target,record.employee_id,record.manager_id,record.administrator_id]);
      }
      await client.query('UPDATE account_registry SET active_role=$2,enabled=$3 WHERE id=$1',[record.id,role,enabled]);
      if(role!==record.active_role||enabled!==record.enabled){
        await client.query('DELETE FROM account_sessions WHERE customer_id=$1 OR employee_id=$2 OR manager_id=$3 OR administrator_id=$4',[record.customer_id,record.employee_id,record.manager_id,record.administrator_id]);
        await client.query('INSERT INTO administration_audit(actor_id,account_id,previous_role,new_role,previous_enabled,new_enabled) VALUES($1,$2,$3,$4,$5,$6)',[sessionAccount(response).id,record.id,record.active_role,role,record.enabled,enabled]);
      }
      await client.query('COMMIT');return response.json({message:'Račun je posodobljen. Uporabnik se mora ponovno prijaviti.'});
    }catch(error){await client.query('ROLLBACK');if(error instanceof AdministrationError)return response.status(error.status).json({message:error.message});if((error as {code?:string}).code==='23505')return response.status(409).json({message:'Za novo vlogo že obstaja drug račun s tem e-poštnim naslovom.'});return response.status(500).json({message:'Računa ni bilo mogoče posodobiti.'});}
    finally{client.release();}
  });
  router.get('/admin/audit',requireSession(pool,['administrator']),async(_request,response)=>{
    try{return response.json({events:(await pool.query('SELECT id,actor_id,account_id,previous_role,new_role,previous_enabled,new_enabled,created_at FROM administration_audit ORDER BY id DESC LIMIT 100')).rows});}catch{return response.status(500).json({message:'Dnevnika ni bilo mogoče naložiti.'});}
  });
  router.get('/admin/inventory',requireSession(pool,['administrator']),async(_request,response)=>{
    try{return response.json({parts:(await pool.query('SELECT id,sku,name,manufacturer,quantity_on_hand,low_stock_threshold,active FROM inventory_parts ORDER BY sku')).rows});}catch{return response.status(500).json({message:'Kataloga ni bilo mogoče naložiti.'});}
  });
  router.post('/admin/inventory',requireSession(pool,['administrator']),async(request,response)=>{
    const {sku,name,manufacturer,quantity_on_hand:quantity,low_stock_threshold:threshold}=request.body??{};
    if(typeof sku!=='string'||!/^[-A-Za-z0-9_.]{1,64}$/.test(sku)||typeof name!=='string'||!name.trim()||name.trim().length>100||(manufacturer!=null&&(typeof manufacturer!=='string'||manufacturer.length>100))||!Number.isInteger(quantity)||quantity<0||quantity>2147483647||!Number.isInteger(threshold)||threshold<0||threshold>2147483647)return response.status(400).json({message:'Vnesi SKU, naziv in nenegativni celi količini.'});
    const client=await pool.connect();try{await client.query('BEGIN');const part=(await client.query('INSERT INTO inventory_parts(sku,name,manufacturer,quantity_on_hand,low_stock_threshold) VALUES($1,$2,$3,$4,$5) RETURNING *',[sku,name.trim(),manufacturer??null,quantity,threshold])).rows[0];if(quantity)await client.query("INSERT INTO stock_movements(part_id,quantity_delta,stock_after,reason) VALUES($1,$2,$2,'initial')",[part.id,quantity]);if(quantity<=threshold)await client.query('INSERT INTO inventory_alerts(part_id) VALUES($1)',[part.id]);await client.query('COMMIT');return response.status(201).json({part});}catch(error){await client.query('ROLLBACK');return response.status((error as {code?:string}).code==='23505'?409:500).json({message:'Dela ni bilo mogoče dodati; preveri enoličnost SKU.'});}finally{client.release();}
  });
  router.patch('/admin/inventory/:partId',requireSession(pool,['administrator']),async(request,response)=>{
    const body=request.body??{},quantity=body.quantity_on_hand,threshold=body.low_stock_threshold;
    if(!positiveId(request.params.partId)||!Number.isInteger(quantity)||quantity<0||quantity>2147483647||!Number.isInteger(threshold)||threshold<0||threshold>2147483647||typeof body.active!=='boolean'||Object.keys(body).some(key=>!['quantity_on_hand','low_stock_threshold','active'].includes(key)))return response.status(400).json({message:'Vnesi veljavno količino, mejo in aktivnost.'});
    const client=await pool.connect();try{await client.query('BEGIN');const part=(await client.query('SELECT * FROM inventory_parts WHERE id=$1 FOR UPDATE',[request.params.partId])).rows[0];if(!part)throw new AdministrationError('Del ni bil najden.',404);const delta=quantity-part.quantity_on_hand;await client.query('UPDATE inventory_parts SET quantity_on_hand=$2,low_stock_threshold=$3,active=$4,updated_at=NOW() WHERE id=$1',[part.id,quantity,threshold,body.active]);if(delta)await client.query('INSERT INTO stock_movements(part_id,quantity_delta,stock_after,reason) VALUES($1,$2,$3,$4)',[part.id,delta,quantity,delta>0?'restock':'adjustment']);if(quantity>threshold||!body.active)await client.query('UPDATE inventory_alerts SET resolved_at=NOW() WHERE part_id=$1 AND resolved_at IS NULL',[part.id]);else await client.query('INSERT INTO inventory_alerts(part_id) VALUES($1) ON CONFLICT(part_id) WHERE resolved_at IS NULL DO NOTHING',[part.id]);await client.query('COMMIT');return response.json({message:'Zaloga je posodobljena.'});}catch(error){await client.query('ROLLBACK');return response.status(error instanceof AdministrationError?error.status:500).json({message:error instanceof AdministrationError?error.message:'Zaloge ni bilo mogoče posodobiti.'});}finally{client.release();}
  });
  router.post('/managers/analytics-requests',requireSession(pool,['manager']),async(request,response)=>{
    const {date_from:from,date_to:to,group_by:group}=request.body??{};
    if(!validDate(from)||!validDate(to)||to<from||!['manufacturer','power','installation_year'].includes(group))return response.status(400).json({message:'Izberi veljavno obdobje in skupino analize.'});
    try{const result=await pool.query('INSERT INTO analytics_requests(manager_id,date_from,date_to,group_by) VALUES($1,$2,$3,$4) RETURNING *',[sessionAccount(response).id,from,to,group]);return response.status(201).json({request:result.rows[0]});}catch{return response.status(500).json({message:'Zahteve za analizo ni bilo mogoče shraniti.'});}
  });
  router.get('/analytics-requests',requireSession(pool,['manager','administrator']),async(_request,response)=>{
    const account=sessionAccount(response);
    try{return response.json({requests:(await pool.query('SELECT * FROM analytics_requests WHERE $1=\'administrator\' OR manager_id=$2 ORDER BY requested_at DESC,id DESC',[account.role,account.id])).rows});}catch{return response.status(500).json({message:'Analiz ni bilo mogoče naložiti.'});}
  });
  router.post('/admin/analytics-requests/:requestId/share',requireSession(pool,['administrator']),async(request,response)=>{
    if(!positiveId(request.params.requestId))return response.status(400).json({message:'ID analize ni veljaven.'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');const analysis=(await client.query('SELECT * FROM analytics_requests WHERE id=$1 FOR UPDATE',[request.params.requestId])).rows[0];
      if(!analysis)throw new AdministrationError('Zahteva vodje ni bila najdena.',404);if(analysis.shared_at)throw new AdministrationError('Analiza je že posredovana. Za novo stanje oddaj novo zahtevo.');
      const grouping={manufacturer:"COALESCE(NULLIF(p.manufacturer,''),'Ni podatka')",power:"COALESCE(p.installed_capacity_kw::text||' kW','Ni podatka')",installation_year:"COALESCE(p.installation_year::text,EXTRACT(YEAR FROM p.installed_on)::text,'Ni podatka')"}[analysis.group_by as 'manufacturer'|'power'|'installation_year'];
      const result=await client.query(`SELECT ${grouping} AS label,count(*)::int AS services,
        count(*) FILTER(WHERE sr.fault_found IS TRUE)::int AS faults,
        count(*) FILTER(WHERE sr.fault_found IS TRUE AND sr.outcome='resolved')::int AS repairs,
        count(*) FILTER(WHERE sr.fault_found IS NULL)::int AS unknown_faults
        FROM services s JOIN solar_plants p ON p.id_solar_plants=s.id_solar_plant
        JOIN service_reports sr ON sr.id_service=s.id AND sr.submitted_at IS NOT NULL
        WHERE s.status='completed' AND (COALESCE(sr.performed_at,s.completed_at) AT TIME ZONE 'Europe/Ljubljana')::date BETWEEN $1::date AND $2::date
        GROUP BY ${grouping} ORDER BY label`,[analysis.date_from,analysis.date_to]);
      await client.query('UPDATE analytics_requests SET result=$2,shared_at=NOW(),generated_by=$3 WHERE id=$1',[analysis.id,JSON.stringify(result.rows),sessionAccount(response).id]);
      await client.query('COMMIT');return response.json({message:'Analiza je posredovana vodji.',result:result.rows});
    }catch(error){await client.query('ROLLBACK');return response.status(error instanceof AdministrationError?error.status:500).json({message:error instanceof AdministrationError?error.message:'Analize ni bilo mogoče pripraviti.'});}finally{client.release();}
  });
}
