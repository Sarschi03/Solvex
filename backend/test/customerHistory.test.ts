import { after,before,it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { app,pool } from '../src/app.js';
import { refreshInspectionRecommendations } from '../src/customerHistory.js';
const schema=`solvex_history_${process.pid}_${Date.now()}`;
const admin=new Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT??5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
pool.options.options=`-c search_path=${schema}`;
let server:Server,base:string,owner:string,other:string,worker:string,plant:string,employee:string,ownerId:string;
async function call(path:string,cookie?:string,method='GET',body?:unknown){const res=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
async function service(date:string,type='regular_inspection',status='completed',plantId=plant){
  const request=(await pool.query('INSERT INTO service_requests(id_solar_plant,request_type,description) VALUES($1,$2,$3) RETURNING id',[plantId,type,'Lastnikova težava'])).rows[0];
  const s=(await pool.query("INSERT INTO services(id_solar_plant,id_service_request,service_type,id_employee,status,completed_at) VALUES($1,$2,'cleaning',$3,$4,$5) RETURNING id",[plantId,request.id,employee,status,date])).rows[0];
  await pool.query("INSERT INTO service_reports(id_service,id_employee,work_summary,findings,fault_cause,customer_summary,performed_at,submitted_at,outcome,parts_used) VALUES($1,$2,'INTERNO','SKRIVNO','NOTRANJI VZROK','Paneli očiščeni in povezava popravljena.',$3,NOW(),'resolved',$4)",[s.id,employee,date,JSON.stringify([{name:'Spojka',manufacturer:'Test',quantity:1,replaced:true,installed_on:'2020-01-01',inventory_part_id:'999'}])]);return s.id;
}
before(async()=>{
  await admin.query(`CREATE SCHEMA ${schema}`);await pool.query(await readFile(new URL('../../database/schema.sql',import.meta.url),'utf8'));
  const hash=await argon2.hash('HistoryTest123!');
  for(const email of ['owner@history.si','other@history.si'])await pool.query("INSERT INTO customers(first_name,last_name,email,password_hash,address,postal_code,city) VALUES('Ana','Test',$1,$2,'Test','2000','Maribor')",[email,hash]);
  ownerId=(await pool.query("SELECT id FROM customers WHERE email='owner@history.si'")).rows[0].id;
  employee=(await pool.query("INSERT INTO employees(first_name,last_name,email,password_hash,phone,service_type) VALUES('Jan','Test','worker@history.si',$1,'000','cleaning') RETURNING id",[hash])).rows[0].id;
  plant=(await pool.query("INSERT INTO solar_plants(id_customer,name,installation_address,postal_code,city) VALUES($1,'Dom','Test','2000','Maribor') RETURNING id_solar_plants",[ownerId])).rows[0].id_solar_plants;
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const addr=server.address();assert.ok(addr&&typeof addr!=='string');base=`http://127.0.0.1:${addr.port}`;
  owner=(await call('/auth/login',undefined,'POST',{identifier:'owner@history.si',password:'HistoryTest123!'})).cookie!;
  other=(await call('/auth/login',undefined,'POST',{identifier:'other@history.si',password:'HistoryTest123!'})).cookie!;
  worker=(await call('/auth/login',undefined,'POST',{identifier:'worker@history.si',password:'HistoryTest123!'})).cookie!;
});
after(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();});
it('lastništvo, vloge in prazna zgodovina',async()=>{
  assert.equal((await call(`/plants/${plant}/history`)).status,401);assert.equal((await call(`/plants/${plant}/history`,worker)).status,403);assert.equal((await call(`/plants/${plant}/history`,other)).status,404);
  assert.equal((await call('/plants/no/history',owner)).status,400);assert.deepEqual((await call(`/plants/${plant}/history`,owner)).body.services,[]);
  assert.deepEqual((await call('/account/recommendations',owner)).body.recommendations,[]);
});
it('zgodovina je padajoča, samo zaključena in ne vsebuje internih poročil',async()=>{
  const older=await service('2020-01-01');const newer=await service('2021-02-01','fault_report');await service('2022-01-01','regular_inspection','in_progress');
  const result=(await call(`/plants/${plant}/history`,owner)).body.services;assert.deepEqual(result.map((item:{id:string})=>item.id),[newer,older]);
  assert.equal(result[0].customer_summary,'Paneli očiščeni in povezava popravljena.');assert.equal(result[0].parts_used[0].name,'Spojka');assert.equal(result[0].parts_used[0].inventory_part_id,undefined);
  assert.doesNotMatch(JSON.stringify(result),/INTERNO|SKRIVNO|NOTRANJI VZROK|work_summary|findings|fault_cause/);
});
it('priporočila izhajajo samo iz zadnjega zaključenega rednega pregleda, obvestilo se ne podvoji',async()=>{
  await refreshInspectionRecommendations(pool);await refreshInspectionRecommendations(pool);
  const result=(await call('/account/recommendations',owner)).body;assert.equal(result.recommendations.length,1);assert.equal(result.recommendations[0].overdue,true);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM notifications WHERE kind='inspection_recommendation'")).rows[0].n,1);
  assert.deepEqual((await call('/account/recommendations',other)).body.recommendations,[]);
});
it('opt-out je trajen, preverjen in skrije tudi obstoječa obvestila',async()=>{
  assert.equal((await call('/account/recommendations',worker,'PATCH',{enabled:false})).status,403);
  assert.equal((await call('/account/recommendations',owner,'PATCH',{enabled:'false'})).status,400);
  assert.equal((await call('/account/recommendations',owner,'PATCH',{enabled:false})).status,200);
  assert.deepEqual((await call('/account/recommendations',owner)).body,{enabled:false,recommendations:[]});
  assert.equal((await call('/notifications',owner)).body.notifications.filter((item:{kind:string})=>item.kind==='inspection_recommendation').length,0);
  await call('/account/recommendations',owner,'PATCH',{enabled:true});assert.equal((await call('/account/recommendations',owner)).body.enabled,true);
});
it('nov redni pregled nadomesti stari cikel; mesec pred rokom je vključen',async()=>{
  const now=(await pool.query("SELECT ((NOW() AT TIME ZONE 'Europe/Ljubljana')::date-INTERVAL '11 months')::text AS date")).rows[0].date;
  const recent=await service(now);let result=(await call('/account/recommendations',owner)).body;assert.equal(result.recommendations[0].service_id,recent);
  await service(new Date().toISOString());result=(await call('/account/recommendations',owner)).body;assert.equal(result.recommendations.length,0);
  assert.equal((await call('/notifications',owner)).body.notifications.filter((item:{kind:string})=>item.kind==='inspection_recommendation').length,0);
});
it('shranjevanje ločenega povzetka ne razkrije internega besedila lastniku',async()=>{
  const id=await service('2023-01-01','fault_report','scheduled');await pool.query('DELETE FROM service_reports WHERE id_service=$1',[id]);
  const saved=await call(`/employees/${employee}/service-reports`,worker,'POST',{id_service:id,work_summary:'Zasebno',customer_summary:'Varna razlaga',parts_used:[]});assert.equal(saved.status,201);assert.equal(saved.body.report.customer_summary,'Varna razlaga');
  const invalid=await call(`/employees/${employee}/service-reports/${saved.body.report.id}`,worker,'PUT',{customer_summary:'x'.repeat(4001)});assert.equal(invalid.status,400);
});
