// The fallback supports legacy imports with id_employee but no membership rows.
// Once a team exists, only its current membership grants access.
export const assignedTo = (employee: string) => `(EXISTS (SELECT 1 FROM service_assignments sa WHERE sa.service_id=s.id AND sa.employee_id=${employee}) OR
  (NOT EXISTS (SELECT 1 FROM service_assignments sa WHERE sa.service_id=s.id) AND s.id_employee=${employee}))`;
export const leaderOf = (employee: string) => `(EXISTS (SELECT 1 FROM service_assignments sa WHERE sa.service_id=s.id AND sa.employee_id=${employee} AND sa.is_leader) OR
  (NOT EXISTS (SELECT 1 FROM service_assignments sa WHERE sa.service_id=s.id) AND s.id_employee=${employee}))`;
export const scheduleColumns = `s.id,s.id_service_request,s.id_solar_plant,s.service_type,s.status,s.urgency,s.scheduled_at,s.scheduled_end_at,
 sp.name AS solar_plant_name,sp.installation_address,sp.city,
 COALESCE((SELECT json_agg(json_build_object('employee_id',sa.employee_id::text,'first_name',e.first_name,'last_name',e.last_name,
 'responsibility',sa.responsibility,'is_leader',sa.is_leader,'assigned_at',sa.assigned_at) ORDER BY sa.is_leader DESC,e.last_name)
 FROM service_assignments sa JOIN employees e ON e.id=sa.employee_id WHERE sa.service_id=s.id),'[]'::json) AS assignments`;
export const positiveId = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
