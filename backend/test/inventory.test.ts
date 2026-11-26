import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { app, pool } from '../src/app.js';

const schema=`solvex_inventory_${process.pid}_${Date.now()}`;
const admin=new Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT??5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
pool.options.options=`-c search_path=${schema}`;
let server:Server,base:string,workerId:string,managerId:string,plantId:string,workerCookie:string,managerCookie:string,ownerCookie:string;
let sequence=0;
async function call(path:string,cookie?:string,method='GET',body?:unknown){const response=await fetch(`${base}/api${path}`,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function part(quantity=10,threshold=2){return (await pool.query('INSERT INTO inventory_parts (sku,name,manufacturer,quantity_on_hand,low_stock_threshold) VALUES ($1,$2,$3,$4,$5) RETURNING *',[`TEST-${++sequence}`,`Del ${sequence}`,'Testni proizvajalec',quantity,threshold])).rows[0];}
async function draft(parts:unknown[]){
  const service=(await pool.query("INSERT INTO services (id_solar_plant,service_type,id_employee,id_manager,status) VALUES ($1,'electrical',$2,$3,'scheduled') RETURNING id",[plantId,workerId,managerId])).rows[0];
  const saved=await call(`/employees/${workerId}/service-reports`,workerCookie,'POST',{id_service:service.id,work_summary:'Preverjanje zaloge',performed_at:'2020-01-01T10:00:00Z',plant_condition:'operational',outcome:'resolved',fault_found:false,parts_used:parts});
  assert.equal(saved.status,201,JSON.stringify(saved.body));return {id:saved.body.report.id,serviceId:service.id,report:saved.body.report};
}
const submit=(id:string)=>call(`/employees/${workerId}/service-reports/${id}/submit`,workerCookie,'POST');
const stock=async(id:string)=>(await pool.query('SELECT quantity_on_hand FROM inventory_parts WHERE id=$1',[id])).rows[0].quantity_on_hand;
before(async()=>{
  await admin.query(`CREATE SCHEMA ${schema}`);await pool.query(await readFile(new URL('../../database/schema.sql',import.meta.url),'utf8'));
  const hash=await argon2.hash('InventoryTest123!');
  const owner=(await pool.query("INSERT INTO customers (first_name,last_name,email,password_hash,address,postal_code,city) VALUES ('Ana','Test','inventory-owner@test.si',$1,'Test 1','2000','Maribor') RETURNING id",[hash])).rows[0];
  plantId=(await pool.query("INSERT INTO solar_plants (id_customer,name,installation_address,postal_code,city) VALUES ($1,'Testna elektrarna','Test 1','2000','Maribor') RETURNING id_solar_plants",[owner.id])).rows[0].id_solar_plants;
  workerId=(await pool.query("INSERT INTO employees (first_name,last_name,email,password_hash,phone,service_type) VALUES ('Jan','Test','inventory-worker@test.si',$1,'000','electrical') RETURNING id",[hash])).rows[0].id;
  managerId=(await pool.query("INSERT INTO managers (first_name,last_name,email,password_hash,phone) VALUES ('Maja','Test','inventory-manager@test.si',$1,'000') RETURNING id",[hash])).rows[0].id;
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');base=`http://127.0.0.1:${address.port}`;
  workerCookie=(await call('/auth/login',undefined,'POST',{identifier:'inventory-worker@test.si',password:'InventoryTest123!'})).cookie!;
  managerCookie=(await call('/auth/login',undefined,'POST',{identifier:'inventory-manager@test.si',password:'InventoryTest123!'})).cookie!;
  ownerCookie=(await call('/auth/login',undefined,'POST',{identifier:'inventory-owner@test.si',password:'InventoryTest123!'})).cookie!;
});
after(async()=>{if(server)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();});

describe('US-10: kataloški deli in atomska poraba',()=>{
  it('katalog bere serviser in vodja, zalogo samo vodja; lastnik nima dostopa',async()=>{
    await part();assert.equal((await call('/inventory/parts')).status,401);assert.equal((await call('/managers/inventory')).status,401);
    assert.equal((await call('/inventory/parts',ownerCookie)).status,403);assert.equal((await call('/managers/inventory',workerCookie)).status,403);
    assert.equal((await call('/inventory/parts',workerCookie)).status,200);assert.equal((await call('/managers/inventory',managerCookie)).status,200);
    assert.equal((await fetch(`${base}/inventory/parts`)).status,401);
  });
  it('osnutek ne porabi zaloge in naziv/proizvajalca vzame iz kataloga',async()=>{
    const item=await part();const saved=await draft([{inventory_part_id:item.id,name:'Ponarejen naziv',manufacturer:'Ponarejen',quantity:2,replaced:false}]);
    assert.equal(saved.report.parts_used[0].name,item.name);assert.equal(saved.report.parts_used[0].manufacturer,item.manufacturer);assert.equal(await stock(item.id),10);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM stock_movements WHERE report_id=$1',[saved.id])).rows[0].count,0);
  });
  it('odpiše točno enkrat in shrani sled ter označi poročilo kot knjiženo',async()=>{
    const item=await part();const saved=await draft([{inventory_part_id:item.id,quantity:2}]);
    assert.equal((await submit(saved.id)).status,200);assert.equal((await submit(saved.id)).status,409);assert.equal(await stock(item.id),8);
    const moves=await pool.query('SELECT * FROM stock_movements WHERE report_id=$1',[saved.id]);assert.equal(moves.rowCount,1);assert.equal(moves.rows[0].quantity_delta,-2);
    assert.ok((await pool.query('SELECT inventory_posted_at FROM service_reports WHERE id=$1',[saved.id])).rows[0].inventory_posted_at);
    const notices=(await call('/notifications',managerCookie)).body.notifications.filter((row:{service_id:string;kind:string})=>row.service_id===saved.serviceId&&row.kind==='completed');
    assert.equal(notices.length,1);assert.ok(notices[0].message.includes(`Porabljeni deli: ${item.name} × 2.`));
    await assert.rejects(pool.query("INSERT INTO stock_movements (part_id,report_id,quantity_delta,stock_after,reason) VALUES ($1,$2,-2,6,'report_consumption')",[item.id,saved.id]),(error:{code?:string})=>error.code==='23505');
  });
  it('premajhna zaloga ohrani celoten osnutek in servis; po dopolnitvi je možen ponovni poskus',async()=>{
    const item=await part(1);const saved=await draft([{inventory_part_id:item.id,quantity:2}]);
    const result=await submit(saved.id);assert.equal(result.status,409);assert.match(result.body.message,/ni dovolj zaloge/);assert.equal(await stock(item.id),1);
    const report=(await pool.query('SELECT submitted_at,inventory_posted_at FROM service_reports WHERE id=$1',[saved.id])).rows[0];assert.equal(report.submitted_at,null);assert.equal(report.inventory_posted_at,null);
    assert.equal((await pool.query('SELECT status FROM services WHERE id=$1',[saved.serviceId])).rows[0].status,'in_progress');
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM stock_movements WHERE report_id=$1',[saved.id])).rows[0].count,0);
    await pool.query('UPDATE inventory_parts SET quantity_on_hand=3 WHERE id=$1',[item.id]);assert.equal((await submit(saved.id)).status,200);assert.equal(await stock(item.id),1);
  });
  it('dve poročili za zadnji kos ne povzročita negativne zaloge',async()=>{
    const item=await part(1,0);const first=await draft([{inventory_part_id:item.id,quantity:1}]),second=await draft([{inventory_part_id:item.id,quantity:1}]);
    const results=await Promise.all([submit(first.id),submit(second.id)]);assert.deepEqual(results.map(item=>item.status).sort(),[200,409]);assert.equal(await stock(item.id),0);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM stock_movements WHERE part_id=$1',[item.id])).rows[0].count,1);
  });
  it('sočasna dvojna oddaja istega poročila zabeleži le en odpis',async()=>{
    const item=await part(5);const saved=await draft([{inventory_part_id:item.id,quantity:2}]);const results=await Promise.all([submit(saved.id),submit(saved.id)]);
    assert.deepEqual(results.map(item=>item.status).sort(),[200,409]);assert.equal(await stock(item.id),3);assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM stock_movements WHERE report_id=$1',[saved.id])).rows[0].count,1);
  });
  it('iste dele sešteje in ob nizki zalogi opozori samo enkrat na epizodo',async()=>{
    const item=await part(10,3);const saved=await draft([{inventory_part_id:item.id,quantity:3},{inventory_part_id:item.id,quantity:4}]);assert.equal((await submit(saved.id)).status,200);assert.equal(await stock(item.id),3);
    assert.equal((await pool.query('SELECT quantity_delta FROM stock_movements WHERE report_id=$1',[saved.id])).rows[0].quantity_delta,-7);
    const next=await draft([{inventory_part_id:item.id,quantity:1}]);assert.equal((await submit(next.id)).status,200);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM inventory_alerts WHERE part_id=$1 AND resolved_at IS NULL',[item.id])).rows[0].count,1);
    const notifications=(await call('/notifications',managerCookie)).body.notifications.filter((row:{kind:string;message:string})=>row.kind==='low_stock'&&row.message.includes(`Nizka zaloga: ${item.name}.`));assert.equal(notifications.length,1);
    const view=(await call('/managers/inventory',managerCookie)).body;assert.equal(view.parts.find((row:{id:string})=>row.id===item.id).low_stock,true);assert.ok(view.alerts.some((row:{part_id:string})=>row.part_id===item.id));assert.ok(view.movements.some((row:{report_id:string})=>row.report_id===saved.id));
  });
  it('pomanjkanje ene od več postavk ne porabi niti ostalih delov',async()=>{
    const a=await part(5),b=await part(0);const saved=await draft([{inventory_part_id:a.id,quantity:1},{inventory_part_id:b.id,quantity:1}]);
    assert.equal((await submit(saved.id)).status,409);assert.equal(await stock(a.id),5);assert.equal(await stock(b.id),0);
  });
  it('napaka po začetem odpisu razveljavi premike, opozorila in zaključek',async()=>{
    const a=await part(5,5),b=await part(5);const saved=await draft([{inventory_part_id:a.id,quantity:1},{inventory_part_id:b.id,quantity:1}]);
    await pool.query(`ALTER TABLE stock_movements ADD CONSTRAINT inventory_rollback_test CHECK (part_id<>${b.id})`);
    try {
      assert.equal((await submit(saved.id)).status,500);assert.equal(await stock(a.id),5);assert.equal(await stock(b.id),5);
      assert.equal((await pool.query('SELECT submitted_at FROM service_reports WHERE id=$1',[saved.id])).rows[0].submitted_at,null);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM stock_movements WHERE report_id=$1',[saved.id])).rows[0].count,0);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM inventory_alerts WHERE part_id=$1',[a.id])).rows[0].count,0);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM notifications WHERE service_id=$1',[saved.serviceId])).rows[0].count,0);
    }finally{await pool.query('ALTER TABLE stock_movements DROP CONSTRAINT inventory_rollback_test');}
  });
  it('obratni vrstni red delov v različnih poročilih ne povzroči deadlocka',async()=>{
    const a=await part(3),b=await part(3);const first=await draft([{inventory_part_id:a.id,quantity:1},{inventory_part_id:b.id,quantity:1}]),second=await draft([{inventory_part_id:b.id,quantity:1},{inventory_part_id:a.id,quantity:1}]);
    assert.deepEqual((await Promise.all([submit(first.id),submit(second.id)])).map(item=>item.status),[200,200]);assert.equal(await stock(a.id),1);assert.equal(await stock(b.id),1);
  });
  it('stari nepovezani deli zahtevajo preslikavo, neaktivni del pa se ne odpiše',async()=>{
    const legacy=await draft([{name:'Stari del',quantity:1}]);assert.equal((await submit(legacy.id)).status,400);
    const item=await part();const saved=await draft([{inventory_part_id:item.id,quantity:1}]);await pool.query('UPDATE inventory_parts SET active=false WHERE id=$1',[item.id]);assert.equal((await submit(saved.id)).status,409);assert.equal(await stock(item.id),10);
    const empty=await draft([]);assert.equal((await submit(empty.id)).status,200);
  });
  it('zavrne neznan kataloški ID in neveljavne količine',async()=>{
    const service=(await pool.query("INSERT INTO services (id_solar_plant,service_type,id_employee) VALUES ($1,'electrical',$2) RETURNING id",[plantId,workerId])).rows[0];
    for(const used of [{inventory_part_id:'9223372036854775807',quantity:1},{inventory_part_id:'abc',quantity:1},{name:'Del',quantity:-1},{name:'Del',quantity:1.5}]) assert.equal((await call(`/employees/${workerId}/service-reports`,workerCookie,'POST',{id_service:service.id,work_summary:'Test',parts_used:[used]})).status,400);
  });
  it('staro že oddano poročilo ne sproži naknadnega odpisa po migraciji',async()=>{
    const item=await part(10);const saved=await draft([{name:'Stari zapis',quantity:1}]);
    await pool.query('UPDATE service_reports SET submitted_at=NOW() WHERE id=$1',[saved.id]);
    assert.equal((await submit(saved.id)).status,409);assert.equal(await stock(item.id),10);
    assert.equal((await pool.query('SELECT inventory_posted_at FROM service_reports WHERE id=$1',[saved.id])).rows[0].inventory_posted_at,null);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM stock_movements WHERE report_id=$1',[saved.id])).rows[0].count,0);
  });
  it('lokalna dopolnitev zapre opozorilo in naslednja poraba lahko sproži novo', {skip:!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST??'')}, async()=>{
    const item=await part(1,1);const first=await draft([{inventory_part_id:item.id,quantity:1}]);assert.equal((await submit(first.id)).status,200);
    await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/inventory-adjust.mjs',import.meta.url)),'--sku',item.sku,'--quantity','5','--threshold','1'],{env:{...process.env,PGOPTIONS:`-c search_path=${schema}`}});
    assert.equal(await stock(item.id),5);assert.ok((await pool.query('SELECT resolved_at FROM inventory_alerts WHERE part_id=$1',[item.id])).rows[0].resolved_at);
    const next=await draft([{inventory_part_id:item.id,quantity:4}]);assert.equal((await submit(next.id)).status,200);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM inventory_alerts WHERE part_id=$1',[item.id])).rows[0].count,2);
  });
});
