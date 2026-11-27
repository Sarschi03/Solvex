import { after,before,it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { app,pool } from '../src/app.js';
const schema=`solvex_administration_${process.pid}_${Date.now()}`;
const db=new Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT??5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
pool.options.options=`-c search_path=${schema}`;
let server:Server,base:string,admin:string,manager:string,owner:string,employee:string,ownerId:string,employeeId:string,plant:string,principal:string,administratorId:string;
async function call(path:string,cookie?:string,method='GET',body?:unknown){const res=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:res.status,body:await res.json().catch(()=>({})),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
const login=(identifier:string)=>call('/auth/login',undefined,'POST',{identifier,password:'AdminTest123!'});
before(async()=>{
  await db.query(`CREATE SCHEMA ${schema}`);await pool.query(await readFile(new URL('../../database/schema.sql',import.meta.url),'utf8'));
  const hash=await argon2.hash('AdminTest123!');
  administratorId=(await pool.query("INSERT INTO administrators(first_name,last_name,email,password_hash) VALUES('A','Admin','admin@test.si',$1) RETURNING id",[hash])).rows[0].id;
  ownerId=(await pool.query("INSERT INTO customers(first_name,last_name,email,password_hash,address,postal_code,city) VALUES('Ana','Test','owner@admin.si',$1,'Test 1','2000','Maribor') RETURNING id",[hash])).rows[0].id;
  await pool.query("INSERT INTO account_usernames(username,customer_id) VALUES('owner-test',$1)",[ownerId]);
  principal=(await pool.query('SELECT id FROM account_registry WHERE customer_id=$1',[ownerId])).rows[0].id;
  employeeId=(await pool.query("INSERT INTO employees(first_name,last_name,email,password_hash,phone,service_type) VALUES('Jan','Test','worker@admin.si',$1,'000','electrical') RETURNING id",[hash])).rows[0].id;
  await pool.query("INSERT INTO managers(first_name,last_name,email,password_hash,phone) VALUES('M','Test','manager@admin.si',$1,'000') RETURNING id",[hash]);
  plant=(await pool.query("INSERT INTO solar_plants(id_customer,name,installation_address,postal_code,city,manufacturer,installed_capacity_kw,installation_year) VALUES($1,'Dom','Test','2000','Maribor','Solar',10,2020) RETURNING id_solar_plants",[ownerId])).rows[0].id_solar_plants;
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');base=`http://127.0.0.1:${address.port}`;
  admin=(await login('admin@test.si')).cookie!;owner=(await login('owner-test')).cookie!;manager=(await login('manager@admin.si')).cookie!;employee=(await login('worker@admin.si')).cookie!;
});
after(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await pool.end();await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await db.end();});
it('administracija je ločena vloga brez dostopa do servisnih postopkov ali javne registracije',async()=>{
  assert.equal((await call('/admin/accounts')).status,401);for(const cookie of[owner,manager,employee])assert.equal((await call('/admin/accounts',cookie)).status,403);
  const list=await call('/admin/accounts',admin);assert.equal(list.status,200);assert.equal(list.body.accounts.length,4);assert.doesNotMatch(JSON.stringify(list.body),/password|hash|token/);
  assert.equal((await call('/services',admin)).status,403);assert.equal((await call('/administrators/register',undefined,'POST',{})).status,404);
});
it('deaktivacija prekliče seje in prepreči tudi staro prijavno pot, reaktivacija zahteva novo prijavo',async()=>{
  assert.equal((await call(`/admin/accounts/${principal}`,admin,'PATCH',{enabled:false})).status,200);
  assert.equal((await call('/auth/me',owner)).status,401);assert.equal((await login('owner-test')).status,401);
  assert.equal((await call('/customers/login',undefined,'POST',{email:'owner@admin.si',password:'AdminTest123!'})).status,401);
  await call(`/admin/accounts/${principal}`,admin,'PATCH',{enabled:true});assert.equal((await call('/auth/me',owner)).status,401);owner=(await login('owner-test')).cookie!;
  assert.equal((await call('/auth/me',owner)).status,200);
});
it('sprememba vloge ne zamenja ID-ja z drugim uporabnikom in vrnitev ohrani lastništvo ter username',async()=>{
  assert.equal((await call(`/admin/accounts/${principal}`,admin,'PATCH',{role:'employee'})).status,400);
  const changed=await call(`/admin/accounts/${principal}`,admin,'PATCH',{role:'employee',phone:'000',service_type:'electrical'});assert.equal(changed.status,200,JSON.stringify(changed.body));
  assert.equal((await call('/auth/me',owner)).status,401);const signed=await login('owner-test');assert.equal(signed.body.account.role,'employee');assert.notEqual(signed.body.account.id,employeeId);
  assert.equal((await call('/plants',signed.cookie)).status,403);assert.equal((await call(`/employees/${employeeId}/services`,signed.cookie)).status,403);
  assert.equal((await call(`/admin/accounts/${principal}`,admin,'PATCH',{role:'customer'})).status,200);owner=(await login('owner-test')).cookie!;
  const plants=await call('/plants',owner);assert.equal(plants.body.plants[0].id,plant);assert.equal((await login('owner@admin.si')).body.account.role,'customer');
});
it('administrator ne odstrani svojega ali zadnjega dostopa; neznana polja so zavrnjena',async()=>{
  const id=(await pool.query('SELECT id FROM account_registry WHERE administrator_id=$1',[administratorId])).rows[0].id;
  assert.equal((await call(`/admin/accounts/${id}`,admin,'PATCH',{enabled:false})).status,409);assert.equal((await call(`/admin/accounts/${id}`,admin,'PATCH',{role:'manager'})).status,409);
  assert.equal((await call(`/admin/accounts/${principal}`,admin,'PATCH',{enabled:true,superuser:true})).status,400);
  assert.equal((await call('/admin/accounts/999999',admin,'PATCH',{enabled:false})).status,404);
});
it('zaposlenega z aktivnim delom je treba najprej prerazporediti; onemogočen ni razpoložljiv',async()=>{
  const id=(await pool.query('SELECT id FROM account_registry WHERE employee_id=$1',[employeeId])).rows[0].id;
  const s=(await pool.query("INSERT INTO services(id_solar_plant,service_type,id_employee,status) VALUES($1,'electrical',$2,'scheduled') RETURNING id",[plant,employeeId])).rows[0];
  assert.equal((await call(`/admin/accounts/${id}`,admin,'PATCH',{enabled:false})).status,409);
  await pool.query("UPDATE services SET status='cancelled' WHERE id=$1",[s.id]);assert.equal((await call(`/admin/accounts/${id}`,admin,'PATCH',{enabled:false})).status,200);
  assert.equal((await call('/auth/me',employee)).status,401);assert.equal((await login('worker@admin.si')).status,401);
  const query=new URLSearchParams({start:'2030-01-01T10:00:00Z',end:'2030-01-01T11:00:00Z'});const available=await call('/managers/availability?'+query,manager);assert.ok(!available.body.employees.some((row:{id:string})=>row.id===employeeId));
  await call(`/admin/accounts/${id}`,admin,'PATCH',{enabled:true});employee=(await login('worker@admin.si')).cookie!;
});
it('analiza potrebuje zahtevo vodje in veljavno obdobje; uporabnik je ne more zahtevati',async()=>{
  assert.equal((await call('/managers/analytics-requests',owner,'POST',{})).status,403);
  assert.equal((await call('/managers/analytics-requests',manager,'POST',{date_from:'2026-02-30',date_to:'2026-12-01',group_by:'manufacturer'})).status,400);
  assert.equal((await call('/admin/analytics-requests/999999/share',admin,'POST')).status,404);
});
it('analiza šteje samo dokončane evidentirane servise in je posredovana samo vlagatelju',async()=>{
  for(const [fault,outcome,status]of[[true,'resolved','completed'],[true,'follow_up','completed'],[null,null,'completed'],[true,'resolved','in_progress']]as const){const s=(await pool.query("INSERT INTO services(id_solar_plant,service_type,id_employee,status,completed_at) VALUES($1,'electrical',$2,$3,'2026-01-10') RETURNING id",[plant,employeeId,status])).rows[0];await pool.query("INSERT INTO service_reports(id_service,id_employee,work_summary,submitted_at,performed_at,fault_found,outcome) VALUES($1,$2,'Interno',NOW(),'2026-01-10',$3,$4)",[s.id,employeeId,fault,outcome]);}
  const requested=await call('/managers/analytics-requests',manager,'POST',{date_from:'2026-01-01',date_to:'2026-01-31',group_by:'manufacturer'});assert.equal(requested.status,201);
  assert.equal((await call(`/admin/analytics-requests/${requested.body.request.id}/share`,manager,'POST')).status,403);
  const result=await call(`/admin/analytics-requests/${requested.body.request.id}/share`,admin,'POST');assert.equal(result.status,200);assert.deepEqual(result.body.result,[{label:'Solar',services:3,faults:2,repairs:1,unknown_faults:1}]);
  assert.equal((await call(`/admin/analytics-requests/${requested.body.request.id}/share`,admin,'POST')).status,409);
  const visible=await call('/analytics-requests',manager);assert.ok(visible.body.requests[0].shared_at);assert.equal(visible.body.requests[0].result[0].repairs,1);
  const hash=await argon2.hash('AdminTest123!');await pool.query("INSERT INTO managers(first_name,last_name,email,password_hash,phone) VALUES('Other','Manager','other-manager@admin.si',$1,'000')",[hash]);const other=(await login('other-manager@admin.si')).cookie!;assert.deepEqual((await call('/analytics-requests',other)).body.requests,[]);
});
it('analize po moči/letu ter prazno obdobje imajo resnične rezultate',async()=>{
  for(const [group,label]of[['power','10.00 kW'],['installation_year','2020']]as const){const request=(await call('/managers/analytics-requests',manager,'POST',{date_from:'2026-01-01',date_to:'2026-01-31',group_by:group})).body.request;const result=await call(`/admin/analytics-requests/${request.id}/share`,admin,'POST');assert.equal(result.body.result[0].label,label);}
  const request=(await call('/managers/analytics-requests',manager,'POST',{date_from:'2010-01-01',date_to:'2010-01-31',group_by:'manufacturer'})).body.request;assert.deepEqual((await call(`/admin/analytics-requests/${request.id}/share`,admin,'POST')).body.result,[]);
});
it('administrator ureja zalogo, vodja je ne; dopolnitev ohrani dnevnik in zaključi opozorilo',async()=>{
  const body={sku:'ADMIN-PART',name:'Testni del',manufacturer:'Test',quantity_on_hand:2,low_stock_threshold:3};assert.equal((await call('/admin/inventory',manager,'POST',body)).status,403);
  const added=await call('/admin/inventory',admin,'POST',body);assert.equal(added.status,201);const id=added.body.part.id;
  assert.equal((await call('/admin/inventory',admin,'POST',body)).status,409);assert.equal((await call(`/admin/inventory/${id}`,admin,'PATCH',{quantity_on_hand:-1,low_stock_threshold:3,active:true})).status,400);
  assert.equal((await call(`/admin/inventory/${id}`,admin,'PATCH',{quantity_on_hand:10,low_stock_threshold:3,active:true})).status,200);
  assert.equal((await pool.query('SELECT quantity_delta FROM stock_movements WHERE part_id=$1 ORDER BY id DESC',[id])).rows[0].quantity_delta,8);assert.ok((await pool.query('SELECT resolved_at FROM inventory_alerts WHERE part_id=$1',[id])).rows[0].resolved_at);
});
it('spremembe računov imajo revizijsko sled brez skrivnosti',async()=>{
  const result=await call('/admin/audit',admin);assert.equal(result.status,200);assert.ok(result.body.events.length>=4);assert.doesNotMatch(JSON.stringify(result.body),/password|hash|token/);
});
