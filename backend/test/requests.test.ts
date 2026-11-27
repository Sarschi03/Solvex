import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { app, pool } from '../src/app.js';

const schema = `solvex_requests_${process.pid}_${Date.now()}`;
const admin = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 5432), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
pool.options.options = `-c search_path=${schema}`;
let server: Server;
let base: string;
let ownerCookie: string;
let otherCookie: string;
let workerCookie: string;
let managerCookie: string;
let managerId: string;
let workerId: string;
let plantId: string;
let otherPlantId: string;
async function call(path: string, cookie?: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function fault(extra: Record<string, unknown> = {}, cookie = ownerCookie) {
  return call('/requests', cookie, 'POST', { id_solar_plant: plantId, request_type: 'fault_report', fault_type: 'Razsmernik', description: 'Razsmernik se ne vklopi.', ...extra });
}
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pool.query(await readFile(new URL('../../database/schema.sql', import.meta.url), 'utf8'));
  const hash = await argon2.hash('RequestTest123!');
  const owners = await pool.query("INSERT INTO customers (first_name,last_name,email,password_hash,address,postal_code,city) VALUES ('Ana','Lastnik','requests-a@test.si',$1,'Test 1','2000','Maribor'),('Tim','Lastnik','requests-b@test.si',$1,'Test 2','2000','Maribor') RETURNING id", [hash]);
  const plants = await pool.query("INSERT INTO solar_plants (id_customer,name,installation_address,postal_code,city,has_battery) VALUES ($1,'Anina elektrarna','Test 1','2000','Maribor',true),($2,'Timova elektrarna','Test 2','2000','Maribor',false) RETURNING id_solar_plants", [owners.rows[0].id, owners.rows[1].id]);
  plantId = plants.rows[0].id_solar_plants;
  otherPlantId = plants.rows[1].id_solar_plants;
  workerId = (await pool.query("INSERT INTO employees (first_name,last_name,email,password_hash,phone,service_type) VALUES ('Jan','Serviser','requests-worker@test.si',$1,'000','electrical') RETURNING id", [hash])).rows[0].id;
  managerId = (await pool.query("INSERT INTO managers (first_name,last_name,email,password_hash,phone) VALUES ('Maja','Vodja','requests-manager@test.si',$1,'000') RETURNING id", [hash])).rows[0].id;
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  base = `http://127.0.0.1:${address.port}`;
  for (const email of ['requests-a@test.si', 'requests-b@test.si', 'requests-worker@test.si', 'requests-manager@test.si']) {
    const login = await call('/auth/login', undefined, 'POST', { identifier: email, password: 'RequestTest123!' });
    assert.equal(login.status, 200);
    if (email === 'requests-a@test.si') ownerCookie = login.cookie!;
    if (email === 'requests-b@test.si') otherCookie = login.cookie!;
    if (email === 'requests-worker@test.si') workerCookie = login.cookie!;
    if (email === 'requests-manager@test.si') managerCookie = login.cookie!;
  }
});
after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});

describe('US-01 in US-02: oddaja in lastnikovo stanje zahtevkov', () => {
  it('shrani okvaro, vrne potrditev in jo prikaže vodji', async () => {
    const result = await fault({ fault_type: '  Razsmernik  ', description: '  Ne deluje.  ' });
    assert.equal(result.status, 201);
    assert.match(result.body.message, /uspešno oddan/);
    assert.equal(result.body.request.fault_type, 'Razsmernik');
    assert.equal(result.body.request.description, 'Ne deluje.');
    assert.equal(result.body.request.status, 'submitted');
    assert.equal(result.body.request.urgency, 'standardno');
    const saved = await pool.query('SELECT description FROM service_requests WHERE id=$1', [result.body.request.id]);
    assert.equal(saved.rows[0].description, 'Ne deluje.');
    const inbox = await call('/managers/requests', managerCookie);
    assert.ok(inbox.body.requests.some((item: { id: string }) => item.id === result.body.request.id));
  });
  it('shrani redni pregled z dodatnimi storitvami in želenim datumom', async () => {
    const result = await call('/requests', ownerCookie, 'POST', { id_solar_plant: Number(plantId), request_type: 'regular_inspection', requested_services: ['panel_cleaning', 'battery_inspection'], preferred_date: '2096-02-29' });
    assert.equal(result.status, 201);
    assert.deepEqual(result.body.request.requested_services, ['panel_cleaning', 'battery_inspection']);
    assert.equal(result.body.request.preferred_date, '2096-02-29');
    assert.equal(result.body.request.description, null);
    assert.equal(result.body.request.fault_type, null);
    const basic = await call('/requests', ownerCookie, 'POST', { id_solar_plant: plantId, request_type: 'regular_inspection' });
    assert.equal(basic.status, 201);
    assert.deepEqual(basic.body.request.requested_services, []);
  });
  it('zavrne tujo ali neobstoječo elektrarno in ne ustvari zahtevka', async () => {
    const before = (await pool.query('SELECT COUNT(*) FROM service_requests')).rows[0].count;
    for (const id of [otherPlantId, '9223372036854775807']) assert.equal((await fault({ id_solar_plant: id })).status, 404);
    assert.equal((await pool.query('SELECT COUNT(*) FROM service_requests')).rows[0].count, before);
  });
  it('seznam in podrobnosti prikazujejo samo lastnikove zahtevke', async () => {
    const mine = (await fault()).body.request;
    const theirs = (await fault({ id_solar_plant: otherPlantId }, otherCookie)).body.request;
    const list = await call(`/requests?customer_id=999&role=manager`, ownerCookie);
    assert.equal(list.status, 200);
    assert.ok(list.body.requests.some((item: { id: string }) => item.id === mine.id));
    assert.ok(!list.body.requests.some((item: { id: string }) => item.id === theirs.id));
    assert.equal((await call(`/requests/${mine.id}`, ownerCookie)).body.request.id, mine.id);
    assert.equal((await call(`/requests/${theirs.id}`, ownerCookie)).status, 404);
    assert.equal((await call('/requests/9223372036854775807', ownerCookie)).status, 404);
  });
  it('preveri prijavo in vloge na vseh poteh ter korenski montaži', async () => {
    for (const [path, method, body] of [['/requests', 'GET', undefined], ['/requests/1', 'GET', undefined], ['/requests', 'POST', {}]] as const) {
      assert.equal((await call(path, undefined, method, body)).status, 401);
      for (const cookie of [workerCookie, managerCookie]) assert.equal((await call(path, cookie, method, body)).status, 403);
    }
    assert.equal((await call('/managers/requests/1/urgency', undefined, 'PATCH', { urgency: 'nujno' })).status, 401);
    for (const cookie of [ownerCookie, workerCookie]) {
      assert.equal((await call('/managers/requests', cookie)).status, 403);
      assert.equal((await call('/managers/requests/1/urgency', cookie, 'PATCH', { urgency: 'nujno' })).status, 403);
    }
    assert.equal((await fetch(`${base}/requests`)).status, 401);
  });
  it('validira tipe, obvezna polja, dolžine, storitve in datume brez neželenih zapisov', async () => {
    const before = (await pool.query('SELECT COUNT(*) FROM service_requests')).rows[0].count;
    for (const extra of [
      { id_solar_plant: 0 }, { id_solar_plant: '9223372036854775808' }, { request_type: ['fault_report'] },
      { request_type: 'unknown' }, { fault_type: '' }, { fault_type: 123 }, { fault_type: 'x'.repeat(101) },
      { description: '' }, { description: [] }, { description: 'x'.repeat(4001) },
      { requested_services: ['panel_cleaning'] }, { preferred_date: '2000-01-01' }, { preferred_date: '2099-02-29' },
      { preferred_date: '2096-04-31' }, { preferred_date: '2096-1-01' }, { preferred_date: 123 },
      { urgency: 'nujno' }, { status: 'completed' }, { id_customer: 1 },
    ]) assert.equal((await fault(extra)).status, 400, JSON.stringify(extra));
    for (const services of [['unknown'], ['panel_cleaning', 'panel_cleaning'], [1], 'panel_cleaning']) {
      assert.equal((await call('/requests', ownerCookie, 'POST', { id_solar_plant: plantId, request_type: 'regular_inspection', requested_services: services })).status, 400);
    }
    assert.equal((await call('/requests', ownerCookie, 'POST', { id_solar_plant: plantId, request_type: 'regular_inspection', fault_type: 'Okvara' })).status, 400);
    assert.equal((await pool.query('SELECT COUNT(*) FROM service_requests')).rows[0].count, before);
  });
});

describe('US-08: inbox in nujnost', () => {
  it('vodja vidi čas, tip, opis in osnovne podatke vseh lastnikov, po nujnosti', async () => {
    const urgent = (await fault()).body.request;
    assert.equal((await call(`/managers/requests/${urgent.id}/urgency`, managerCookie, 'PATCH', { urgency: 'nujno' })).status, 200);
    const inbox = await call('/managers/requests', managerCookie);
    assert.equal(inbox.status, 200);
    assert.equal(inbox.body.requests[0].id, urgent.id);
    const item = inbox.body.requests[0];
    assert.ok(item.requested_at);
    assert.equal(item.customer_email, 'requests-a@test.si');
    assert.equal(item.installation_address, 'Test 1');
    assert.ok(inbox.body.requests.some((row: { request_type: string }) => row.request_type === 'regular_inspection'));
    assert.ok(inbox.body.requests.some((row: { customer_email: string }) => row.customer_email === 'requests-b@test.si'));
    assert.equal(item.password_hash, undefined);
  });
  it('shrani oceno, preide v pregled in prenese nujnost na aktivne servise, ne na zaključene', async () => {
    const id = (await fault()).body.request.id;
    const services = await pool.query("INSERT INTO services (id_solar_plant,id_service_request,service_type,id_employee,status,urgency,notes) VALUES ($1,$2,'electrical',$3,'scheduled','standardno','INTERNO'),($1,$2,'cleaning',$3,'completed','resno','INTERNO') RETURNING id", [plantId, id, workerId]);
    await pool.query("INSERT INTO service_reports (id_service,id_employee,work_summary) VALUES ($1,$2,'ZAUPNI ZAPISNIK')", [services.rows[0].id, workerId]);
    const result = await call(`/managers/requests/${id}/urgency`, managerCookie, 'PATCH', { urgency: 'nujno' });
    assert.equal(result.status, 200);
    assert.equal(result.body.request.status, 'reviewing');
    const review = (await pool.query('SELECT reviewed_by,reviewed_at FROM service_requests WHERE id=$1', [id])).rows[0];
    assert.equal(review.reviewed_by, managerId);
    assert.ok(review.reviewed_at);
    const worker = await call(`/employees/${workerId}/services`, workerCookie);
    assert.equal(worker.body.services.find((row: { id: string }) => row.id === services.rows[0].id).urgency, 'nujno');
    assert.equal(worker.body.services.find((row: { id: string }) => row.id === services.rows[1].id).urgency, 'resno');
    const owner = await call('/requests', ownerCookie);
    assert.equal(owner.body.requests.find((row: { id: string }) => row.id === id).urgency, 'nujno');
    assert.ok(!JSON.stringify(owner.body).includes('INTERNO'));
    assert.ok(!JSON.stringify(owner.body).includes('ZAUPNI ZAPISNIK'));
  });
  it('dovoli vse tri stopnje in ohrani že dogovorjeno stanje zahtevka', async () => {
    const id = (await fault()).body.request.id;
    await pool.query("UPDATE service_requests SET status='scheduled' WHERE id=$1", [id]);
    for (const urgency of ['nujno', 'resno', 'standardno']) {
      const result = await call(`/managers/requests/${id}/urgency`, managerCookie, 'PATCH', { urgency });
      assert.equal(result.status, 200);
      assert.equal(result.body.request.urgency, urgency);
      assert.equal(result.body.request.status, 'scheduled');
    }
  });
  it('zavrne neveljavne in zaprte zahtevke brez delne spremembe', async () => {
    const id = (await fault()).body.request.id;
    for (const body of [{}, { urgency: 'high' }, { urgency: null }, { urgency: 'nujno', status: 'completed' }]) assert.equal((await call(`/managers/requests/${id}/urgency`, managerCookie, 'PATCH', body)).status, 400);
    assert.equal((await call('/managers/requests/0/urgency', managerCookie, 'PATCH', { urgency: 'nujno' })).status, 400);
    assert.equal((await call('/managers/requests/9223372036854775807/urgency', managerCookie, 'PATCH', { urgency: 'nujno' })).status, 404);
    for (const status of ['completed', 'rejected', 'cancelled']) {
      await pool.query('UPDATE service_requests SET status=$2 WHERE id=$1', [id, status]);
      assert.equal((await call(`/managers/requests/${id}/urgency`, managerCookie, 'PATCH', { urgency: 'nujno' })).status, 409);
    }
    assert.equal((await pool.query('SELECT urgency FROM service_requests WHERE id=$1', [id])).rows[0].urgency, 'standardno');
  });
  it('napaka prenosa na servis razveljavi tudi spremembo zahtevka', async () => {
    const id = (await fault()).body.request.id;
    await pool.query("INSERT INTO services (id_solar_plant,id_service_request,service_type,notes) VALUES ($1,$2,'electrical','TEST_ROLLBACK')", [plantId, id]);
    await pool.query("ALTER TABLE services ADD CONSTRAINT test_request_rollback CHECK (notes <> 'TEST_ROLLBACK' OR urgency <> 'nujno')");
    try {
      const result = await call(`/managers/requests/${id}/urgency`, managerCookie, 'PATCH', { urgency: 'nujno' });
      assert.equal(result.status, 500);
      assert.ok(!JSON.stringify(result.body).includes('test_request_rollback'));
      const saved = (await pool.query('SELECT status,urgency,reviewed_by FROM service_requests WHERE id=$1', [id])).rows[0];
      assert.equal(saved.status, 'submitted');
      assert.equal(saved.urgency, 'standardno');
      assert.equal(saved.reviewed_by, null);
      assert.equal((await pool.query('SELECT urgency FROM services WHERE id_service_request=$1', [id])).rows[0].urgency, 'standardno');
    } finally { await pool.query('ALTER TABLE services DROP CONSTRAINT test_request_rollback'); }
  });
});

describe('US-09/11/12: ekipe, razpored, koledar in obvestila', () => {
  let cleanerId: string;
  let cleanerCookie: string;
  let day = 1;
  before(async () => {
    const created = await call('/employees/register', undefined, 'POST', { firstName:'Tina',lastName:'Čistilka',email:'cleaner-schedule@test.si',password:'ScheduleTest123!',phone:'000',serviceType:'cleaning' });
    cleanerId = created.body.account.id;
    cleanerCookie = (await call('/auth/login',undefined,'POST',{identifier:'cleaner-schedule@test.si',password:'ScheduleTest123!'})).cookie!;
  });
  async function data() {
    const request = (await fault()).body.request;
    const start = new Date(Date.UTC(2090,0,day++,9));
    return { request_id:request.id,service_type:'electrical',leader_id:workerId,scheduled_at:start.toISOString(),scheduled_end_at:new Date(start.getTime()+3600000).toISOString(), assignments:[{employee_id:workerId,responsibility:'electrical'},{employee_id:cleanerId,responsibility:'cleaning'}] };
  }
  it('dodeli več članov, vodjo, odgovornosti in termin ter prikaže vsem članom', async () => {
    const body = await data();
    const result = await call('/managers/services',managerCookie,'POST',body);
    assert.equal(result.status,201);
    assert.equal(result.body.service.assignments.length,2);
    assert.equal(result.body.service.assignments.filter((item:{is_leader:boolean})=>item.is_leader).length,1);
    const id = result.body.service.id;
    for (const [employee,cookie] of [[workerId,workerCookie],[cleanerId,cleanerCookie]]) {
      const list = await call(`/employees/${employee}/services`,cookie);
      assert.ok(list.body.services.some((item:{id:string})=>item.id===id));
    }
    const workload = await call('/managers/employees',managerCookie);
    assert.ok(workload.body.employees.find((item:{id:string;active_services:number})=>item.id===cleanerId && item.active_services>=1));
    assert.equal((await call(`/requests/${body.request_id}`,ownerCookie)).body.request.status,'scheduled');
  });
  it('preveri razpoložljivost in zavrne prekrivanje, dovoljuje sosednja termina',async()=>{
    const body=await data();
    assert.equal((await call('/managers/services',managerCookie,'POST',body)).status,201);
    const availability=await call(`/managers/availability?${new URLSearchParams({start:body.scheduled_at,end:body.scheduled_end_at})}`,managerCookie);
    assert.equal(availability.status,200);
    assert.equal(availability.body.employees.find((item:{id:string})=>item.id===cleanerId).available,false);
    const another=await data();
    assert.equal((await call('/managers/services',managerCookie,'POST',{...another,scheduled_at:body.scheduled_at,scheduled_end_at:body.scheduled_end_at})).status,409);
    assert.equal((await call('/managers/services',managerCookie,'POST',{...another,scheduled_at:body.scheduled_end_at,scheduled_end_at:new Date(Date.parse(body.scheduled_end_at)+3600000).toISOString()})).status,201);
  });
  it('sočasni dodelitvi iste ekipe v istem terminu ne ustvarita dvojne rezervacije',async()=>{
    const first=await data(),second=await data();
    const results=await Promise.all([call('/managers/services',managerCookie,'POST',first),call('/managers/services',managerCookie,'POST',{...second,scheduled_at:first.scheduled_at,scheduled_end_at:first.scheduled_end_at})]);
    assert.deepEqual(results.map(item=>item.status).sort(),[201,409]);
  });
  it('spreminjanje ekipe prekliče dostop odstranjenemu članu in pošlje obvestila',async()=>{
    const body=await data();
    const id=(await call('/managers/services',managerCookie,'POST',body)).body.service.id;
    const result=await call(`/managers/services/${id}/schedule`,managerCookie,'PUT',{...body,assignments:[body.assignments[0]]});
    assert.equal(result.status,200);
    assert.ok(!(await call(`/employees/${cleanerId}/services`,cleanerCookie)).body.services.some((item:{id:string})=>item.id===id));
    const notifications=await call('/notifications',cleanerCookie);
    const removed=notifications.body.notifications.find((item:{service_id:string;kind:string})=>item.service_id===id&&item.kind==='removed');
    assert.ok(removed);
    assert.equal((await call(`/notifications/${removed.id}/read`,workerCookie,'PATCH')).status,404);
    assert.equal((await call(`/notifications/${removed.id}/read`,cleanerCookie,'PATCH')).status,200);
    assert.ok((await call('/notifications',ownerCookie)).body.notifications.some((item:{service_id:string})=>item.service_id===id));
  });
  it('lastnik in član vidita svoj koledar, drug lastnik ne; preklic ohrani zgodovino',async()=>{
    const body=await data();
    const id=(await call('/managers/services',managerCookie,'POST',body)).body.service.id;
    const path=`/calendar?${new URLSearchParams({from:body.scheduled_at,to:body.scheduled_end_at})}`;
    for(const cookie of [ownerCookie,workerCookie,cleanerCookie,managerCookie]) assert.ok((await call(path,cookie)).body.services.some((item:{id:string})=>item.id===id));
    assert.deepEqual((await call(path,otherCookie)).body.services,[]);
    assert.equal((await call(`/managers/services/${id}/cancel`,managerCookie,'POST')).status,200);
    assert.ok(!(await call(path,ownerCookie)).body.services.some((item:{id:string})=>item.id===id));
    assert.equal((await pool.query('SELECT status FROM services WHERE id=$1',[id])).rows[0].status,'cancelled');
    assert.equal((await call(`/requests/${body.request_id}`,ownerCookie)).body.request.status,'reviewing');
  });
  it('zavrne napačne vloge, vodjo izven ekipe, specializacije in neveljavne termine',async()=>{
    const body=await data();
    assert.equal((await call('/managers/services',undefined,'POST',body)).status,401);
    for(const cookie of [ownerCookie,workerCookie]) assert.equal((await call('/managers/services',cookie,'POST',body)).status,403);
    for(const extra of [{leader_id:'999999'},{assignments:[]},{assignments:[body.assignments[0],body.assignments[0]]},{scheduled_end_at:body.scheduled_at},{scheduled_at:'2090-02-31T09:00:00Z',scheduled_end_at:'2090-03-04T10:00:00Z'}]) assert.equal((await call('/managers/services',managerCookie,'POST',{...body,...extra})).status,400);
    assert.equal((await call('/managers/services',managerCookie,'POST',{...body,assignments:[{employee_id:workerId,responsibility:'cleaning'}]})).status,400);
  });
});

describe('US-05/06/07: podrobnosti, strukturirana poročila in zaključek',()=>{
  let followerId:string;
  let followerCookie:string;
  let day=1;
  const complete={work_summary:'Pregled in popravilo',performed_at:'2020-01-01T10:00:00Z',plant_condition:'operational',outcome:'resolved',fault_found:true,fault_cause:'Slab kontakt',parts_used:[{inventory_part_id:'',name:'Varovalka',manufacturer:'Testni proizvajalec',quantity:2,replaced:true,installed_on:'2020-01-01'}]};
  before(async()=>{
    complete.parts_used[0].inventory_part_id=(await pool.query("INSERT INTO inventory_parts (sku,name,manufacturer,quantity_on_hand,low_stock_threshold) VALUES ('TEST-FUSE','Varovalka','Testni proizvajalec',1000,5) RETURNING id")).rows[0].id;
    const account=await call('/employees/register',undefined,'POST',{firstName:'Član',lastName:'Ekipe',email:'report-member@test.si',password:'ReportTest123!',phone:'000',serviceType:'electrical'});
    followerId=account.body.account.id;
    followerCookie=(await call('/auth/login',undefined,'POST',{identifier:'report-member@test.si',password:'ReportTest123!'})).cookie!;
  });
  async function service(){
    const request=(await fault()).body.request;
    const start=new Date(Date.UTC(2095,0,day++,9));
    const saved=await call('/managers/services',managerCookie,'POST',{request_id:request.id,service_type:'electrical',leader_id:workerId,scheduled_at:start.toISOString(),scheduled_end_at:new Date(start.getTime()+3600000).toISOString(),assignments:[{employee_id:workerId,responsibility:'electrical'},{employee_id:followerId,responsibility:'electrical'}]});
    assert.equal(saved.status,201);return {id:saved.body.service.id,requestId:request.id};
  }
  it('vsi trenutni člani berejo elektrarno, le vodja lahko napiše poročilo',async()=>{
    const saved=await service();
    const details=await call(`/employees/${followerId}/services/${saved.id}`,followerCookie);
    assert.equal(details.status,200);assert.equal(details.body.plant.name,'Anina elektrarna');assert.equal(details.body.service.assignments.length,2);assert.equal(details.body.service.can_report,false);
    assert.equal((await call(`/employees/${followerId}/service-reports`,followerCookie,'POST',{id_service:saved.id,...complete})).status,400);
    assert.equal((await call(`/employees/${workerId}/services/${saved.id}`,ownerCookie)).status,403);
    assert.equal((await call(`/employees/${workerId}/services/${saved.id}`,followerCookie)).status,403);
    const other=(await pool.query("INSERT INTO services (id_solar_plant,service_type,id_employee) VALUES ($1,'electrical',$2) RETURNING id",[otherPlantId,followerId])).rows[0].id;
    assert.equal((await call(`/employees/${workerId}/services/${other}`,workerCookie)).status,404);
  });
  it('osnutek je popravljiv, oddaja zahteva vse strukturirane podatke',async()=>{
    const saved=await service();
    const created=await call(`/employees/${workerId}/service-reports`,workerCookie,'POST',{id_service:saved.id,work_summary:'Osnutek'});
    assert.equal(created.status,201);const id=created.body.report.id;
    assert.equal((await call(`/employees/${workerId}/service-reports/${id}/submit`,workerCookie,'POST')).status,400);
    const updated=await call(`/employees/${workerId}/service-reports/${id}`,workerCookie,'PUT',complete);
    assert.equal(updated.status,200);assert.equal(updated.body.report.parts_used[0].quantity,2);
    assert.equal((await pool.query('SELECT status FROM services WHERE id=$1',[saved.id])).rows[0].status,'in_progress');
  });
  it('oddaja enkrat zaklene poročilo, zaključi servis/zahtevek in obvesti lastnika/vodjo',async()=>{
    const saved=await service();
    const id=(await call(`/employees/${workerId}/service-reports`,workerCookie,'POST',{id_service:saved.id,...complete})).body.report.id;
    const results=await Promise.all([call(`/employees/${workerId}/service-reports/${id}/submit`,workerCookie,'POST'),call(`/employees/${workerId}/service-reports/${id}/submit`,workerCookie,'POST')]);
    assert.deepEqual(results.map(item=>item.status).sort(),[200,409]);
    assert.equal((await call(`/employees/${workerId}/service-reports/${id}`,workerCookie,'PUT',{work_summary:'Sprememba'})).status,409);
    assert.equal((await pool.query('SELECT status FROM services WHERE id=$1',[saved.id])).rows[0].status,'completed');
    assert.equal((await call(`/requests/${saved.requestId}`,ownerCookie)).body.request.status,'completed');
    assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM notifications WHERE service_id=$1 AND customer_id IS NOT NULL AND kind='completed'",[saved.id])).rows[0].count,1);
    assert.ok((await call('/notifications',managerCookie)).body.notifications.some((item:{service_id:string})=>item.service_id===saved.id));
    const report=(await call('/managers/service-reports',managerCookie)).body.reports.find((item:{id:string})=>item.id===id);
    assert.equal(report.fault_cause,'Slab kontakt');assert.equal(report.parts_used[0].name,'Varovalka');
    const customer=JSON.stringify((await call('/requests',ownerCookie)).body);assert.ok(!customer.includes('Slab kontakt'));
  });
  it('nedokončana težava vrne zahtevek v pregled, nova dodelitev omogoči nadaljevanje',async()=>{
    const saved=await service();
    const id=(await call(`/employees/${workerId}/service-reports`,workerCookie,'POST',{id_service:saved.id,...complete,outcome:'follow_up',plant_condition:'limited'})).body.report.id;
    assert.equal((await call(`/employees/${workerId}/service-reports/${id}/submit`,workerCookie,'POST')).status,200);
    const request=(await call(`/requests/${saved.requestId}`,ownerCookie)).body.request;
    assert.equal(request.status,'reviewing');assert.equal(request.follow_up_required,true);
    const start=new Date(Date.UTC(2095,6,day++,9));
    const next=await call('/managers/services',managerCookie,'POST',{request_id:saved.requestId,service_type:'electrical',leader_id:workerId,scheduled_at:start.toISOString(),scheduled_end_at:new Date(start.getTime()+3600000).toISOString(),assignments:[{employee_id:workerId,responsibility:'electrical'}]});
    assert.equal(next.status,201);assert.equal((await call(`/requests/${saved.requestId}`,ownerCookie)).body.request.follow_up_required,false);
  });
  it('vrne največ pet zadnjih opravljenih servisov iste elektrarne, vključno z deli',async()=>{
    const saved=await service();
    for(let index=0;index<7;index++) {
      const id=(await pool.query("INSERT INTO services (id_solar_plant,service_type,status,completed_at) VALUES ($1,'electrical','completed',$2) RETURNING id",[plantId,new Date(Date.UTC(2098,0,index+1)).toISOString()])).rows[0].id;
      await pool.query("INSERT INTO service_reports (id_service,id_employee,work_summary,submitted_at,parts_used,outcome) VALUES ($1,$2,$3,NOW(),$4,'resolved')",[id,workerId,`Zgodovina ${index}`,JSON.stringify(complete.parts_used)]);
    }
    const detail=await call(`/employees/${workerId}/services/${saved.id}`,workerCookie);
    assert.equal(detail.body.recent_history.length,5);assert.equal(detail.body.recent_history[0].work_summary,'Zgodovina 6');assert.equal(detail.body.recent_history[0].parts_used[0].manufacturer,'Testni proizvajalec');
  });
  it('zavrne neveljavne strukturirane podatke in ne shrani napačnega osnutka',async()=>{
    const saved=await service();
    for(const extra of [{parts_used:[{name:'Del',quantity:0}]},{parts_used:[{name:'',quantity:1}]},{fault_found:'yes'},{outcome:['resolved']},{plant_condition:'unknown'},{performed_at:'2099-01-01T10:00:00Z'},{performed_at:'2020-02-31T10:00:00Z'},{parts_used:[{name:'Del',quantity:1,installed_on:'2020-02-31'}]}]) assert.equal((await call(`/employees/${workerId}/service-reports`,workerCookie,'POST',{id_service:saved.id,...complete,...extra})).status,400);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM service_reports WHERE id_service=$1',[saved.id])).rows[0].count,0);
  });
});
