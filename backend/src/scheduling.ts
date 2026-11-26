import type { Router, Request, Response } from "express";
import type { Pool, PoolClient } from "pg";
import { requireSession, sessionAccount } from "./profiles.js";
import { assignedTo, positiveId, scheduleColumns } from "./assignmentAccess.js";

type Member = { employee_id: string; responsibility: string };
const specialties = ["cleaning", "electrical", "installer"];
function interval(start: unknown, end: unknown) {
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
  const valid = (value: unknown): value is string => typeof value === 'string' && iso.test(value) && !value.startsWith('0000') && Number.isFinite(Date.parse(value)) && new Date(`${value.slice(0,10)}T00:00:00Z`).toISOString().slice(0,10) === value.slice(0,10);
  return valid(start) && valid(end) && Date.parse(end) > Date.parse(start);
}
const conflictSql = `SELECT s.id,s.scheduled_at,s.scheduled_end_at FROM services s WHERE s.status NOT IN ('completed','cancelled')
  AND ($4::bigint IS NULL OR s.id<>$4) AND ${assignedTo('$1')}
  AND tstzrange(s.scheduled_at,COALESCE(s.scheduled_end_at,s.scheduled_at+INTERVAL '1 hour'),'[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)')
  AND s.scheduled_at IS NOT NULL`;
export async function notify(client: PoolClient, column: "customer_id" | "employee_id" | "manager_id", account: string, service: string, kind: string, message: string) {
  await client.query(`INSERT INTO notifications (${column},service_id,kind,message) VALUES ($1,$2,$3,$4)`, [account, service, kind, message]);
}
export function installSchedulingRoutes(router: Router, pool: Pool) {
  const manager = requireSession(pool, ["manager"]);
  router.get("/managers/schedule", manager, async (_request, response) => {
    try {
      const services = await pool.query(`SELECT ${scheduleColumns} FROM services s JOIN solar_plants sp ON sp.id_solar_plants=s.id_solar_plant ORDER BY s.scheduled_at NULLS LAST,s.id DESC`);
      return response.json({ services: services.rows });
    } catch { return response.status(500).json({ message: "Razporeda ni bilo mogoče naložiti." }); }
  });
  router.get("/managers/availability", manager, async (request, response) => {
    const { start, end, exclude_service_id: exclude } = request.query;
    if (!interval(start, end) || (exclude !== undefined && !positiveId(exclude))) return response.status(400).json({ message: "Izberi veljaven začetek in konec termina." });
    try {
      const employees = await pool.query('SELECT id,first_name,last_name,email,service_type FROM employees ORDER BY last_name,first_name');
      const rows = [];
      for (const employee of employees.rows) {
        const conflicts = await pool.query(conflictSql, [employee.id, start, end, exclude ?? null]);
        const count = await pool.query(`SELECT COUNT(*)::int AS count FROM services s WHERE s.status NOT IN ('completed','cancelled') AND ${assignedTo('$1')}`, [employee.id]);
        rows.push({ ...employee, active_services: count.rows[0].count, available: conflicts.rowCount === 0, conflicts: conflicts.rows });
      }
      return response.json({ employees: rows });
    } catch { return response.status(500).json({ message: "Razpoložljivosti ni bilo mogoče preveriti." }); }
  });
  async function save(request: Request, response: Response) {
    const body = request.body ?? {};
    const serviceId = request.params.serviceId;
    const editing = serviceId !== undefined;
    const members = body.assignments as Member[];
    if ((editing && !positiveId(serviceId)) || (!editing && !positiveId(body.request_id)) ||
      !specialties.includes(body.service_type) || !positiveId(body.leader_id) || !interval(body.scheduled_at, body.scheduled_end_at) || Date.parse(body.scheduled_at) < Date.now() ||
      !Array.isArray(members) || members.length === 0 || members.length > 30 || members.some(member => !member || !positiveId(member.employee_id) || !specialties.includes(member.responsibility)) ||
      new Set(members.map(member => member.employee_id)).size !== members.length || !members.some(member => member.employee_id === body.leader_id) ||
      !members.some(member => member.responsibility === body.service_type) ||
      Object.keys(body).some(key => !['request_id','service_type','scheduled_at','scheduled_end_at','leader_id','assignments'].includes(key))) {
      return response.status(400).json({ message: "Izberi zahtevek, vrsto servisa, prihodnji termin in ekipo z enim vodjo." });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (editing) {
        const parent = (await client.query('SELECT id_service_request FROM services WHERE id=$1', [serviceId])).rows[0];
        if (parent?.id_service_request) await client.query('SELECT id FROM service_requests WHERE id=$1 FOR UPDATE', [parent.id_service_request]);
      }
      let current: { id: string; id_service_request: string; id_solar_plant: string; id_employee: string | null; status: string } | undefined;
      if (editing) {
        current = (await client.query('SELECT id,id_service_request,id_solar_plant,id_employee,status FROM services WHERE id=$1 FOR UPDATE', [serviceId])).rows[0];
        if (!current || ['completed','cancelled'].includes(current.status)) { await client.query('ROLLBACK'); return response.status(current ? 409 : 404).json({ message: 'Servisa ni mogoče razporediti.' }); }
        if (body.request_id !== undefined && body.request_id !== current.id_service_request) { await client.query('ROLLBACK'); return response.status(400).json({ message: 'Zahtevka obstoječega servisa ni mogoče zamenjati.' }); }
        const report = await client.query('SELECT id FROM service_reports WHERE id_service=$1', [serviceId]);
        if (report.rowCount && current.id_employee !== body.leader_id) { await client.query('ROLLBACK'); return response.status(409).json({ message: 'Po začetku poročila vodje ekipe ni mogoče zamenjati.' }); }
      }
      const requestId = current?.id_service_request ?? body.request_id;
      const source = requestId ? (await client.query('SELECT * FROM service_requests WHERE id=$1 FOR UPDATE', [requestId])).rows[0] : null;
      if ((!editing && !source) || (source && ['completed','rejected','cancelled'].includes(source.status))) { await client.query('ROLLBACK'); return response.status(source ? 409 : 404).json({ message: 'Zahtevek ni na voljo za razporejanje.' }); }
      const previous = editing ? (await client.query('SELECT employee_id FROM service_assignments WHERE service_id=$1', [serviceId])).rows.map(row => row.employee_id as string) : [];
      if (current?.id_employee && previous.length === 0) previous.push(current.id_employee);
      const ids = [...new Set([...previous, ...members.map(member => member.employee_id)])].sort((a,b) => BigInt(a) < BigInt(b) ? -1 : 1);
      for (const id of ids) await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [id]);
      const technicians = await client.query('SELECT id,service_type FROM employees WHERE id=ANY($1::bigint[])', [members.map(member => member.employee_id)]);
      if (members.some(member => !technicians.rows.some(employee => employee.id === member.employee_id && employee.service_type === member.responsibility))) { await client.query('ROLLBACK'); return response.status(400).json({ message: 'Odgovornost mora ustrezati specializaciji obstoječega serviserja.' }); }
      for (const member of members) {
        if ((await client.query(conflictSql, [member.employee_id, body.scheduled_at, body.scheduled_end_at, serviceId ?? null])).rowCount) {
          await client.query('ROLLBACK'); return response.status(409).json({ message: 'Izbrani serviser je v tem terminu že zaseden.' });
        }
      }
      const saved = editing ? await client.query(`UPDATE services SET service_type=$2,id_employee=$3,id_manager=$4,scheduled_at=$5,scheduled_end_at=$6,status=CASE WHEN status='in_progress' THEN 'in_progress' ELSE 'scheduled' END WHERE id=$1 RETURNING id,id_solar_plant`, [serviceId, body.service_type, body.leader_id, sessionAccount(response).id, body.scheduled_at, body.scheduled_end_at])
        : await client.query(`INSERT INTO services (id_solar_plant,id_service_request,service_type,id_employee,id_manager,urgency,status,scheduled_at,scheduled_end_at) VALUES ($1,$2,$3,$4,$5,$6,'scheduled',$7,$8) RETURNING id,id_solar_plant`, [source.id_solar_plant, requestId, body.service_type, body.leader_id, sessionAccount(response).id, source.urgency, body.scheduled_at, body.scheduled_end_at]);
      const id = saved.rows[0].id;
      // Upsert retained members to preserve their original assignment timestamp.
      await client.query('DELETE FROM service_assignments WHERE service_id=$1 AND NOT (employee_id=ANY($2::bigint[]))', [id, members.map(member => member.employee_id)]);
      await client.query('UPDATE service_assignments SET is_leader=false WHERE service_id=$1', [id]);
      for (const member of members) {
        await client.query(`INSERT INTO service_assignments (service_id,employee_id,responsibility,is_leader) VALUES ($1,$2,$3,$4) ON CONFLICT (service_id,employee_id) DO UPDATE SET responsibility=EXCLUDED.responsibility,is_leader=EXCLUDED.is_leader`, [id, member.employee_id, member.responsibility, member.employee_id === body.leader_id]);
        await notify(client, 'employee_id', member.employee_id, id, editing ? 'updated' : 'scheduled', `Servis #${id}: ${editing ? 'spremenjena razporeditev' : 'nova dodelitev'}, termin ${body.scheduled_at} – ${body.scheduled_end_at}.`);
      }
      for (const removed of previous.filter(id => !members.some(member => member.employee_id === id))) await notify(client, 'employee_id', removed, id, 'removed', `S servisa #${id} ste bili odstranjeni.`);
      const owner = (await client.query('SELECT id_customer FROM solar_plants WHERE id_solar_plants=$1', [saved.rows[0].id_solar_plant])).rows[0].id_customer;
      await notify(client, 'customer_id', owner, id, editing ? 'updated' : 'scheduled', `Servis #${id}: ${editing ? 'spremenjen' : 'potrjen'} termin ${body.scheduled_at} – ${body.scheduled_end_at}.`);
      if (requestId) await client.query("UPDATE service_requests SET status='scheduled',follow_up_required=CASE WHEN $2::boolean THEN follow_up_required ELSE false END WHERE id=$1", [requestId,editing]);
      const result = await client.query(`SELECT ${scheduleColumns} FROM services s JOIN solar_plants sp ON sp.id_solar_plants=s.id_solar_plant WHERE s.id=$1`, [id]);
      await client.query('COMMIT');
      return response.status(editing ? 200 : 201).json({ service: result.rows[0] });
    } catch (error) { await client.query('ROLLBACK'); console.error('Scheduling failed:', error); return response.status(500).json({ message: 'Razporeditve ni bilo mogoče shraniti.' }); }
    finally { client.release(); }
  }
  router.post('/managers/services', manager, save);
  router.put('/managers/services/:serviceId/schedule', manager, save);
  router.post('/managers/services/:serviceId/cancel', manager, async (request, response) => {
    if (!positiveId(request.params.serviceId)) return response.status(400).json({ message: 'ID servisa ni veljaven.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const parent = (await client.query('SELECT id_service_request FROM services WHERE id=$1', [request.params.serviceId])).rows[0];
      if (parent?.id_service_request) await client.query('SELECT id FROM service_requests WHERE id=$1 FOR UPDATE', [parent.id_service_request]);
      const service = (await client.query('SELECT * FROM services WHERE id=$1 FOR UPDATE', [request.params.serviceId])).rows[0];
      if (!service || ['completed','cancelled'].includes(service.status)) { await client.query('ROLLBACK'); return response.status(service ? 409 : 404).json({ message: 'Servisa ni mogoče preklicati.' }); }
      await client.query("UPDATE services SET status='cancelled' WHERE id=$1", [service.id]);
      const members = await client.query('SELECT employee_id FROM service_assignments WHERE service_id=$1', [service.id]);
      const recipients = new Set<string>(members.rows.map(row => row.employee_id));
      if (service.id_employee) recipients.add(service.id_employee);
      for (const employee of recipients) await notify(client,'employee_id',employee,service.id,'cancelled',`Servis #${service.id} je preklican.`);
      const owner = (await client.query('SELECT id_customer FROM solar_plants WHERE id_solar_plants=$1', [service.id_solar_plant])).rows[0].id_customer;
      await notify(client,'customer_id',owner,service.id,'cancelled',`Servis #${service.id} je preklican.`);
      if (service.id_service_request) await client.query(`UPDATE service_requests SET status=CASE WHEN EXISTS (SELECT 1 FROM services WHERE id_service_request=$1 AND status NOT IN ('completed','cancelled')) THEN 'scheduled' ELSE 'reviewing' END WHERE id=$1`, [service.id_service_request]);
      await client.query('COMMIT');
      return response.json({ message: 'Servis je preklican.' });
    } catch { await client.query('ROLLBACK'); return response.status(500).json({ message: 'Preklic ni uspel.' }); }
    finally { client.release(); }
  });
  router.get('/calendar', requireSession(pool, ['customer','employee','manager']), async (request, response) => {
    const { from, to } = request.query;
    if (typeof from !== 'string' || typeof to !== 'string' || !interval(from,to)) return response.status(400).json({ message: 'Izberi veljavno obdobje koledarja.' });
    const account = sessionAccount(response);
    try {
      const result = await pool.query(`SELECT ${scheduleColumns} FROM services s JOIN solar_plants sp ON sp.id_solar_plants=s.id_solar_plant
        WHERE s.status NOT IN ('completed','cancelled') AND s.scheduled_at<$2 AND COALESCE(s.scheduled_end_at,s.scheduled_at+INTERVAL '1 hour')>$1
        AND ($3='manager' OR ($3='customer' AND sp.id_customer=$4) OR ($3='employee' AND ${assignedTo('$4')})) ORDER BY s.scheduled_at,s.id`, [from,to,account.role,account.id]);
      return response.json({ services: result.rows });
    } catch { return response.status(500).json({ message: 'Koledarja ni bilo mogoče naložiti.' }); }
  });
  router.get('/notifications', requireSession(pool, ['customer','employee','manager']), async (_request, response) => {
    const account = sessionAccount(response);
    const column = { customer: 'customer_id', employee: 'employee_id', manager: 'manager_id' }[account.role];
    try { return response.json({ notifications: (await pool.query(`SELECT id,service_id,kind,message,created_at,read_at FROM notifications WHERE ${column}=$1 ORDER BY created_at DESC,id DESC LIMIT 100`, [account.id])).rows }); }
    catch { return response.status(500).json({ message: 'Obvestil ni bilo mogoče naložiti.' }); }
  });
  router.patch('/notifications/:notificationId/read', requireSession(pool, ['customer','employee','manager']), async (request, response) => {
    if (!positiveId(request.params.notificationId)) return response.status(400).json({ message: 'ID obvestila ni veljaven.' });
    const account = sessionAccount(response);
    const column = { customer: 'customer_id', employee: 'employee_id', manager: 'manager_id' }[account.role];
    try {
      const result = await pool.query(`UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND ${column}=$2 RETURNING id`, [request.params.notificationId,account.id]);
      return result.rowCount ? response.json({ message: 'Obvestilo je prebrano.' }) : response.status(404).json({ message: 'Obvestilo ni bilo najdeno.' });
    } catch { return response.status(500).json({ message: 'Obvestila ni bilo mogoče posodobiti.' }); }
  });
}
