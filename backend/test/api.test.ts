import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { app, pool } from '../src/app.js';

// Each run gets an isolated schema, leaving application data untouched.
const schema = `solvex_test_${process.pid}_${Date.now()}`;
const admin = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});
pool.options.options = `-c search_path=${schema}`;
let server: Server;
let base: string;
let employeeId: string;
let serviceId: string;
let reportId: string;
let customerId: string;
let employeeCookie: string;

async function request(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: employeeCookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pool.query(await readFile(new URL('../../database/schema.sql', import.meta.url), 'utf8'));
  const hash = await argon2.hash('TestPassword123!');
  const employee = await pool.query(`INSERT INTO employees
    (first_name,last_name,email,password_hash,phone,service_type)
    VALUES ('Test','Serviser','test@example.com',$1,'000','electrical') RETURNING id`, [hash]);
  employeeId = employee.rows[0].id;
  const customer = await pool.query(`INSERT INTO customers
    (first_name,last_name,email,password_hash,address,postal_code,city)
    VALUES ('Test','Lastnik','owner@example.com',$1,'Test 1','2000','Maribor') RETURNING id`, [hash]);
  customerId = customer.rows[0].id;
  const plant = await pool.query(`INSERT INTO solar_plants
    (id_customer,name,installation_address,postal_code,city)
    VALUES ($1,'Test elektrarna','Test 1','2000','Maribor') RETURNING id_solar_plants`, [customer.rows[0].id]);
  const service = await pool.query(`INSERT INTO services (id_solar_plant,service_type,id_employee)
    VALUES ($1,'electrical',$2) RETURNING id`, [plant.rows[0].id_solar_plants, employeeId]);
  serviceId = service.rows[0].id;
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  base = `http://127.0.0.1:${address.port}`;
  const login = await accountRequest('/employees/login', undefined, 'POST', { email: 'test@example.com', password: 'TestPassword123!' });
  assert.equal(login.status, 200);
  employeeCookie = login.cookie!.split(';')[0];
});

async function accountRequest(path: string, cookie?: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${base}/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
}

async function customerSession() {
  const result = await accountRequest('/customers/login', undefined, 'POST', { email: 'owner@example.com', password: 'TestPassword123!' });
  assert.equal(result.status, 200);
  assert.ok(result.cookie);
  return result.cookie.split(';')[0];
}

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

describe('Tri vrste računov in strežniška pooblastila', () => {
  const staff = { firstName: 'Nov', lastName: 'Serviser', email: 'worker-register@test.si', password: 'TestPassword123!', phone: '040000000', serviceType: 'electrical' };
  let managerCookie: string;
  let managerId: string;
  let otherEmployeeId: string;

  it('odprto registrira serviserja, hashira geslo in ignorira vlogo iz telesa', async () => {
    const result = await accountRequest('/employees/register', undefined, 'POST', { ...staff, role: 'manager' });
    assert.equal(result.status, 201);
    assert.equal(result.body.account.role, 'employee');
    assert.equal(result.body.account.password_hash, undefined);
    otherEmployeeId = result.body.account.id;
    const saved = await pool.query('SELECT password_hash FROM employees WHERE id=$1', [otherEmployeeId]);
    assert.ok(await argon2.verify(saved.rows[0].password_hash, staff.password));
    assert.equal((await accountRequest('/employees/register', undefined, 'POST', staff)).status, 409);
  });

  it('preveri specializacijo, obvezna polja in dolžino gesla pred registracijo', async () => {
    for (const body of [{ ...staff, serviceType: 'admin' }, { ...staff, phone: '' }, { ...staff, password: 'short' }, { ...staff, password: 'x'.repeat(129) }]) {
      assert.equal((await accountRequest('/employees/register', undefined, 'POST', body)).status, 400);
    }
    assert.equal((await accountRequest('/managers/register', undefined, 'POST', { ...staff, email: 'invalid' })).status, 400);
  });

  it('odprto registrira vodjo in prijavi v sejo z vlogo iz baze', async () => {
    const body = { ...staff, email: 'manager@test.si' };
    const registered = await accountRequest('/managers/register', undefined, 'POST', body);
    assert.equal(registered.status, 201);
    assert.equal(registered.body.account.role, 'manager');
    assert.equal(registered.body.account.password_hash, undefined);
    managerId = registered.body.account.id;
    assert.equal((await accountRequest('/managers/register', undefined, 'POST', body)).status, 409);
    const login = await accountRequest('/managers/login', undefined, 'POST', { ...body, role: 'customer' });
    assert.equal(login.status, 200);
    assert.match(login.cookie!, /HttpOnly/);
    managerCookie = login.cookie!.split(';')[0];
    assert.equal((await accountRequest('/auth/me', managerCookie)).body.account.role, 'manager');
    const session = await pool.query('SELECT manager_id FROM account_sessions WHERE manager_id=$1', [managerId]);
    assert.equal(session.rowCount, 1);
  });

  it('zavrne napačno geslo vodje in prijavo z računom druge vrste', async () => {
    assert.equal((await accountRequest('/managers/login', undefined, 'POST', { email: staff.email, password: staff.password })).status, 401);
    assert.equal((await accountRequest('/managers/login', undefined, 'POST', { email: 'manager@test.si', password: 'wrong' })).status, 401);
    assert.equal((await accountRequest('/managers/login', undefined, 'POST', {})).status, 400);
  });

  it('zavrne anonimni dostop na vseh servisnih in poročevalskih poteh', async () => {
    for (const [path, method] of [
      ['/services', 'GET'], [`/employees/${employeeId}/services`, 'GET'],
      [`/employees/${employeeId}/service-reports`, 'GET'], [`/employees/${employeeId}/service-reports`, 'POST'],
      [`/employees/${employeeId}/service-reports/1`, 'PUT'], [`/employees/${employeeId}/service-reports/1/submit`, 'POST'],
      ['/managers/overview', 'GET'], ['/managers/requests', 'GET'], ['/managers/employees', 'GET'], ['/managers/service-reports', 'GET'],
    ]) assert.equal((await accountRequest(path, undefined, method)).status, 401, `${method} ${path}`);
    assert.equal((await fetch(`${base}/services`)).status, 401, 'Zaščiten je tudi korenski proxy mount.');
  });

  it('lastnik ne more dostopati do internih podatkov niti s podano vlogo', async () => {
    const cookie = await customerSession();
    for (const path of ['/services?role=manager', `/employees/${employeeId}/services`, `/employees/${employeeId}/service-reports`, '/managers/overview', '/managers/employees']) {
      assert.equal((await accountRequest(path, cookie)).status, 403, path);
    }
    assert.equal((await accountRequest(`/employees/${employeeId}/service-reports`, cookie, 'POST', { role: 'employee' })).status, 403);
  });

  it('serviser vidi samo dodeljene servise in ne more zamenjati ID-ja', async () => {
    const own = await accountRequest('/services', employeeCookie);
    assert.equal(own.status, 200);
    assert.ok(own.body.services.some((item: { id: string }) => item.id === serviceId));
    const login = await accountRequest('/employees/login', undefined, 'POST', staff);
    assert.equal(login.status, 200);
    const otherCookie = login.cookie!.split(';')[0];
    assert.deepEqual((await accountRequest('/services', otherCookie)).body.services, []);
    for (const suffix of ['services', 'service-reports']) assert.equal((await accountRequest(`/employees/${employeeId}/${suffix}`, otherCookie)).status, 403);
    assert.equal((await accountRequest(`/employees/${otherEmployeeId}/service-reports`, otherCookie, 'POST', { id_service: serviceId, work_summary: 'Neveljavno' })).status, 400);
    assert.equal((await accountRequest('/managers/overview', otherCookie)).status, 403);
  });

  it('vodja vidi dejanske zahtevke, obremenitve in vse servise brez gesel', async () => {
    const plant = (await pool.query('SELECT id_solar_plant FROM services WHERE id=$1', [serviceId])).rows[0].id_solar_plant;
    await pool.query("INSERT INTO service_requests (id_solar_plant,request_type,description) VALUES ($1,'fault_report','Napaka za pregled vodje')", [plant]);
    const requests = await accountRequest('/managers/requests', managerCookie);
    assert.equal(requests.status, 200);
    assert.ok(requests.body.requests.some((item: { description: string }) => item.description === 'Napaka za pregled vodje'));
    const employees = await accountRequest('/managers/employees', managerCookie);
    assert.equal(employees.status, 200);
    assert.ok(employees.body.employees.every((item: object) => !Object.hasOwn(item, 'password_hash')));
    assert.ok(employees.body.employees.find((item: { id: string; active_services: number }) => item.id === employeeId && item.active_services >= 1));
    assert.equal((await accountRequest('/services', managerCookie)).status, 200);
    assert.equal((await accountRequest('/managers/overview', managerCookie)).body.overview.pending_requests, 1);
  });

  it('vodja bere le oddana poročila in ne more pisati poročil serviserja', async () => {
    const created = await accountRequest(`/employees/${employeeId}/service-reports`, employeeCookie, 'POST', { id_service: serviceId, work_summary: 'Za preverjanje pravic vodje' });
    assert.equal(created.status, 201);
    const id = created.body.report.id;
    assert.deepEqual((await accountRequest('/managers/service-reports', managerCookie)).body.reports, []);
    assert.deepEqual((await accountRequest(`/employees/${employeeId}/service-reports`, managerCookie)).body.reports, []);
    assert.equal((await accountRequest(`/employees/${employeeId}/service-reports`, managerCookie, 'POST', {})).status, 403);
    assert.equal((await accountRequest(`/employees/${employeeId}/service-reports/${id}`, managerCookie, 'PUT', { work_summary: 'Sprememba' })).status, 403);
    assert.equal((await accountRequest(`/employees/${employeeId}/service-reports/${id}/submit`, managerCookie, 'POST')).status, 403);
    await accountRequest(`/employees/${employeeId}/service-reports/${id}/submit`, employeeCookie, 'POST');
    assert.equal((await accountRequest('/managers/service-reports', managerCookie)).body.reports[0].id, id);
    await pool.query('DELETE FROM service_reports WHERE id=$1', [id]);
  });

  it('ob prerazporeditvi servisa prejšnji serviser ne more urejati ali oddati osnutka', async () => {
    const created = await accountRequest(`/employees/${employeeId}/service-reports`, employeeCookie, 'POST', { id_service: serviceId, work_summary: 'Osnutek pred prerazporeditvijo' });
    const id = created.body.report.id;
    await pool.query('UPDATE services SET id_employee=$1 WHERE id=$2', [otherEmployeeId, serviceId]);
    assert.deepEqual((await accountRequest(`/employees/${employeeId}/service-reports`, employeeCookie)).body.reports, []);
    assert.equal((await accountRequest(`/employees/${employeeId}/service-reports/${id}`, employeeCookie, 'PUT', { work_summary: 'Sprememba' })).status, 404);
    assert.equal((await accountRequest(`/employees/${employeeId}/service-reports/${id}/submit`, employeeCookie, 'POST')).status, 404);
    await pool.query('DELETE FROM service_reports WHERE id=$1', [id]);
    await pool.query('UPDATE services SET id_employee=$1 WHERE id=$2', [employeeId, serviceId]);
  });

  it('vodja ima svoj profil, trajno fotografijo ter preklic seje', async () => {
    const saved = await accountRequest('/account/photo', managerCookie, 'PUT', { image: pixel });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.account.role, 'manager');
    assert.equal((await pool.query('SELECT profile_image_data FROM managers WHERE id=$1', [managerId])).rows[0].profile_image_data, pixel);
    const profile = await accountRequest('/account/profile', managerCookie);
    assert.deepEqual(profile.body.plants, []);
    assert.deepEqual(profile.body.services, []);
    await accountRequest('/auth/logout', managerCookie, 'POST');
    assert.equal((await accountRequest('/managers/overview', managerCookie)).status, 401);
  });
});

describe('Prijavljeni profili in fotografije', () => {
  it('zavrne anonimno branje in spreminjanje profila', async () => {
    assert.equal((await accountRequest('/auth/me')).status, 401);
    assert.equal((await accountRequest('/account/profile')).status, 401);
    assert.equal((await accountRequest('/account/photo', undefined, 'PUT', { image: pixel })).status, 401);
  });

  it('zavrne napačno geslo in neveljavne podatke lastnika', async () => {
    assert.equal((await accountRequest('/customers/login', undefined, 'POST', { email: 'invalid', password: 'x' })).status, 400);
    const result = await accountRequest('/customers/login', undefined, 'POST', { email: 'owner@example.com', password: 'wrong' });
    assert.equal(result.status, 401);
    assert.equal(result.cookie, null);
  });

  it('ustvari HttpOnly sejo in shrani samo hash žetona', async () => {
    const result = await accountRequest('/customers/login', undefined, 'POST', { email: ' OWNER@example.com ', password: 'TestPassword123!' });
    assert.equal(result.status, 200);
    assert.equal(result.body.account.role, 'customer');
    assert.equal(result.body.account.password_hash, undefined);
    assert.match(result.cookie!, /HttpOnly/i);
    assert.match(result.cookie!, /SameSite=Lax/i);
    const cookie = result.cookie!.split(';')[0];
    const token = cookie.split('=')[1];
    const hashes = await pool.query('SELECT token_hash FROM account_sessions');
    assert.ok(hashes.rows.every(row => row.token_hash !== token));
    assert.equal((await accountRequest('/auth/me', cookie)).body.account.id, customerId);
  });

  it('shrani fotografijo samo lastniku seje in jo vrne po ponovni prijavi', async () => {
    const cookie = await customerSession();
    const result = await accountRequest('/account/photo', cookie, 'PUT', { image: pixel, id: employeeId });
    assert.equal(result.status, 200);
    assert.equal(result.body.account.profile_image_data, pixel);
    assert.equal((await pool.query('SELECT profile_image_data FROM customers WHERE id=$1', [customerId])).rows[0].profile_image_data, pixel);
    assert.equal((await pool.query('SELECT profile_image_data FROM employees WHERE id=$1', [employeeId])).rows[0].profile_image_data, null);
    const nextCookie = await customerSession();
    assert.equal((await accountRequest('/account/profile', nextCookie)).body.account.profile_image_data, pixel);
    await accountRequest('/account/photo', cookie, 'PUT', { image: null });
  });

  it('zavrne SVG, neujemajoč format in preveliko fotografijo', async () => {
    const cookie = await customerSession();
    for (const image of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,YWJj', `data:image/png;base64,${'A'.repeat(350004)}`]) {
      assert.equal((await accountRequest('/account/photo', cookie, 'PUT', { image })).status, 400);
    }
  });

  it('omogoči odstranitev fotografije', async () => {
    const cookie = await customerSession();
    await accountRequest('/account/photo', cookie, 'PUT', { image: pixel });
    assert.equal((await accountRequest('/account/photo', cookie, 'PUT', { image: null })).body.account.profile_image_data, null);
    assert.equal((await pool.query('SELECT profile_image_data FROM customers WHERE id=$1', [customerId])).rows[0].profile_image_data, null);
  });

  it('vrne samo lastnikove elektrarne in zaključene servise, brez zapisnikov', async () => {
    const cookie = await customerSession();
    const plant = await pool.query("INSERT INTO solar_plants (id_customer,name,installation_address,postal_code,city,panel_count) VALUES ($1,'Profil test','Test 2','2000','Maribor',12) RETURNING id_solar_plants", [customerId]);
    const plantId = plant.rows[0].id_solar_plants;
    const completed = await pool.query("INSERT INTO services (id_solar_plant,service_type,status,completed_at) VALUES ($1,'cleaning','completed',NOW()) RETURNING id", [plantId]);
    const planned = await pool.query("INSERT INTO services (id_solar_plant,service_type) VALUES ($1,'electrical') RETURNING id", [plantId]);
    const other = await pool.query("INSERT INTO customers (first_name,last_name,email,password_hash,address,postal_code,city) VALUES ('Drug','Lastnik','other-profile@test.si','unused','Test 3','2000','Maribor') RETURNING id");
    await pool.query("INSERT INTO solar_plants (id_customer,name,installation_address,postal_code,city) VALUES ($1,'Skrita elektrarna','Test 3','2000','Maribor')", [other.rows[0].id]);
    const result = await accountRequest('/account/profile?customerId=' + other.rows[0].id, cookie);
    assert.equal(result.status, 200);
    assert.ok(result.body.plants.some((item: { id: string }) => item.id === plantId));
    assert.ok(!result.body.plants.some((item: { name: string }) => item.name === 'Skrita elektrarna'));
    assert.ok(result.body.services.some((item: { id: string }) => item.id === completed.rows[0].id));
    assert.ok(!result.body.services.some((item: { id: string }) => item.id === planned.rows[0].id));
    assert.ok(result.body.services.every((item: object) => !Object.hasOwn(item, 'work_summary')));
  });

  it('zaposleni lahko shrani svojo sliko in nima elektrarn lastnika', async () => {
    const login = await accountRequest('/employees/login', undefined, 'POST', { email: 'test@example.com', password: 'TestPassword123!' });
    const cookie = login.cookie!.split(';')[0];
    assert.equal((await accountRequest('/account/photo', cookie, 'PUT', { image: pixel })).body.account.role, 'employee');
    const profile = await accountRequest('/account/profile', cookie);
    assert.deepEqual(profile.body.plants, []);
    assert.deepEqual(profile.body.services, []);
    await accountRequest('/account/photo', cookie, 'PUT', { image: null });
  });

  it('odjava prekliče sejo in potečena seja ni veljavna', async () => {
    const cookie = await customerSession();
    assert.equal((await accountRequest('/auth/logout', cookie, 'POST')).status, 200);
    assert.equal((await accountRequest('/auth/me', cookie)).status, 401);
    const expiredCookie = await customerSession();
    await pool.query("UPDATE account_sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE customer_id=$1", [customerId]);
    assert.equal((await accountRequest('/account/profile', expiredCookie)).status, 401);
  });
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});

describe('API s pravo PostgreSQL bazo', () => {
  it('preveri povezavo z bazo', async () => {
    const result = await request('/health');
    assert.equal(result.status, 200);
    assert.equal(result.body.database, 'connected');
  });

  it('zavrne neveljaven e-poštni naslov pri prijavi', async () => {
    const result = await request('/employees/login', 'POST', { email: 'invalid', password: 'TestPassword123!' });
    assert.equal(result.status, 400);
    assert.equal(result.body.message, 'Vnesi veljaven e-poštni naslov.');
  });

  it('zavrne prekratko geslo lastnika pred zapisom v bazo', async () => {
    const result = await request('/customers/register', 'POST', {
      firstName: 'Test', lastName: 'Lastnik', email: 'short@example.com',
      password: 'short', address: 'Test 1', postalCode: '2000', city: 'Maribor',
    });
    assert.equal(result.status, 400);
    const saved = await pool.query('SELECT id FROM customers WHERE email = $1', ['short@example.com']);
    assert.equal(saved.rowCount, 0);
  });

  it('zavrne neveljavno prijavo in napačno geslo', async () => {
    assert.equal((await request('/employees/login', 'POST', {})).status, 400);
    assert.equal((await request('/employees/login', 'POST', { email: 'test@example.com', password: 'wrong' })).status, 401);
  });

  it('prijavi zaposlenega brez razkritja gesla', async () => {
    const result = await request('/employees/login', 'POST', { email: ' TEST@example.com ', password: 'TestPassword123!' });
    assert.equal(result.status, 200);
    assert.equal(result.body.employee.id, employeeId);
    assert.equal(result.body.employee.password_hash, undefined);
  });

  it('vrne dodeljene servise in zavrne napačen ID', async () => {
    const result = await request(`/employees/${employeeId}/services`);
    assert.equal(result.status, 200);
    assert.equal(result.body.services[0].id, serviceId);
    assert.equal((await request('/employees/0/services')).status, 400);
    assert.equal((await request('/employees/999999/services')).status, 403);
  });

  it('preveri obvezna polja in dodelitev pred ustvarjanjem poročila', async () => {
    assert.equal((await request(`/employees/${employeeId}/service-reports`, 'POST', { id_service: serviceId })).status, 400);
    assert.equal((await request('/employees/999999/service-reports', 'POST', { id_service: serviceId, work_summary: 'Delo' })).status, 403);
    assert.equal((await request(`/employees/${employeeId}/service-reports`, 'POST', { id_service: serviceId, work_summary: 'Delo', reported_at: 'invalid' })).status, 400);
  });

  it('ustvari poročilo in prepreči podvojitev za isti servis', async () => {
    const body = { id_service: serviceId, work_summary: 'Pregled opravljen', findings: 'Brez napak' };
    const result = await request(`/employees/${employeeId}/service-reports`, 'POST', body);
    assert.equal(result.status, 201);
    assert.equal(result.body.report.work_summary, body.work_summary);
    reportId = result.body.report.id;
    assert.equal((await request(`/employees/${employeeId}/service-reports`, 'POST', body)).status, 409);
  });

  it('uredi osnutek in ga vrne na seznamu poročil', async () => {
    const result = await request(`/employees/${employeeId}/service-reports/${reportId}`, 'PUT', { work_summary: 'Posodobljen povzetek' });
    assert.equal(result.status, 200);
    const reports = await request(`/employees/${employeeId}/service-reports`);
    assert.equal(reports.body.reports[0].work_summary, 'Posodobljen povzetek');
  });

  it('po oddaji zaklene poročilo in prepreči ponovno oddajo', async () => {
    const path = `/employees/${employeeId}/service-reports/${reportId}`;
    const result = await request(`${path}/submit`, 'POST');
    assert.equal(result.status, 200);
    assert.ok(result.body.report.submitted_at);
    assert.equal((await request(path, 'PUT', { work_summary: 'Sprememba' })).status, 409);
    assert.equal((await request(`${path}/submit`, 'POST')).status, 409);
    assert.equal((await request(`/employees/${employeeId}/service-reports/999999/submit`, 'POST')).status, 404);
  });

  it('registrira lastnika in zavrne podvojen e-poštni naslov', async () => {
    const body = { firstName: 'Nov', lastName: 'Lastnik', email: 'new@example.com', password: 'TestPassword123!', address: 'Test 2', postalCode: '2000', city: 'Maribor' };
    const result = await request('/customers/register', 'POST', body);
    assert.equal(result.status, 201);
    assert.equal(result.body.customer.password_hash, undefined);
    assert.equal((await request('/customers/register', 'POST', body)).status, 409);
    assert.equal((await request('/customers/register', 'POST', { ...body, postalCode: 'abc' })).status, 400);
  });
});
