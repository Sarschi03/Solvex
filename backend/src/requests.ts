import type { Router, Response } from "express";
import type { Pool } from "pg";
import { requireSession, sessionAccount } from "./profiles.js";

export const requestFields = `r.id,r.id_solar_plant,r.request_type,r.fault_type,r.description,r.requested_services,
  r.status,r.urgency,to_char(r.preferred_date,'YYYY-MM-DD') AS preferred_date,r.requested_at,
  sp.name AS solar_plant_name,sp.installation_address,sp.postal_code,sp.city`;
const extras = ["panel_cleaning", "battery_inspection", "electrical_inspection", "mounting_inspection"];
const validId = (id: unknown): id is string => typeof id === "string" && /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n;
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !date.startsWith("0000") && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
function failure(response: Response, error: unknown) {
  console.error("Service request failed:", error);
  return response.status(500).json({ message: "Zahtevka ni bilo mogoče obdelati. Poskusi znova." });
}

export function installRequestRoutes(router: Router, pool: Pool) {
  router.post("/requests", requireSession(pool, ["customer"]), async (request, response) => {
    const body = request.body as Record<string, unknown> | null;
    const allowed = ["id_solar_plant", "request_type", "fault_type", "description", "requested_services", "preferred_date"];
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) return response.status(400).json({ message: "Pošlji samo podatke zahtevka. Status in nujnost določa sistem oziroma vodja." });
    const plantId = typeof body.id_solar_plant === "number" && Number.isSafeInteger(body.id_solar_plant) ? String(body.id_solar_plant) : body.id_solar_plant;
    const type = body.request_type;
    const faultType = typeof body.fault_type === "string" ? body.fault_type.trim() : null;
    const description = typeof body.description === "string" ? body.description.trim() || null : null;
    const services = body.requested_services ?? [];
    const preferredDate = body.preferred_date ?? null;
    if (!validId(plantId) || typeof type !== "string" || !["fault_report", "regular_inspection"].includes(type)) return response.status(400).json({ message: "Izberi veljavno elektrarno in vrsto zahtevka." });
    if ((body.description !== undefined && body.description !== null && typeof body.description !== "string") || (description && description.length > 4000)) return response.status(400).json({ message: "Opis naj vsebuje največ 4000 znakov." });
    if ((body.fault_type !== undefined && body.fault_type !== null && typeof body.fault_type !== "string") || (faultType && faultType.length > 100)) return response.status(400).json({ message: "Vrsta okvare naj vsebuje največ 100 znakov." });
    if (type === "fault_report" && (!faultType || !description)) return response.status(400).json({ message: "Vnesi vrsto okvare in opis težave." });
    if (type === "regular_inspection" && faultType) return response.status(400).json({ message: "Za redni pregled ne vnašaj vrste okvare." });
    if (!Array.isArray(services) || services.length > extras.length || services.some(value => typeof value !== "string" || !extras.includes(value)) || new Set(services).size !== services.length || (type === "fault_report" && services.length > 0)) return response.status(400).json({ message: "Izberi veljavne dodatne storitve za redni pregled." });
    if (preferredDate !== null && (typeof preferredDate !== "string" || !validDate(preferredDate) || preferredDate < new Date().toISOString().slice(0, 10))) return response.status(400).json({ message: "Želeni datum mora biti veljaven datum danes ali v prihodnosti." });
    try {
      const inserted = await pool.query(`INSERT INTO service_requests (id_solar_plant,request_type,fault_type,description,requested_services,preferred_date)
        SELECT sp.id_solar_plants,$2,$3,$4,$5,$6 FROM solar_plants sp WHERE sp.id_solar_plants=$1 AND sp.id_customer=$7 RETURNING id`,
      [plantId, type, faultType, description, services, preferredDate, sessionAccount(response).id]);
      if (!inserted.rows[0]) return response.status(404).json({ message: "Elektrarna ni bila najdena." });
      const result = await pool.query(`SELECT ${requestFields} FROM service_requests r JOIN solar_plants sp ON sp.id_solar_plants=r.id_solar_plant WHERE r.id=$1 AND sp.id_customer=$2`, [inserted.rows[0].id, sessionAccount(response).id]);
      return response.status(201).json({ message: "Zahtevek je uspešno oddan in posredovan vodji servisa.", request: result.rows[0] });
    } catch (error) { return failure(response, error); }
  });
  router.get("/requests", requireSession(pool, ["customer"]), async (_request, response) => {
    try {
      const ownerId = sessionAccount(response).id;
      const requests = await pool.query(`SELECT ${requestFields} FROM service_requests r JOIN solar_plants sp ON sp.id_solar_plants=r.id_solar_plant WHERE sp.id_customer=$1 ORDER BY r.requested_at DESC,r.id DESC`, [ownerId]);
      // Explicit public fields: no internal notes or service reports reach the owner.
      const services = await pool.query(`SELECT s.id,s.id_service_request,s.service_type,s.status,s.urgency,s.scheduled_at,s.completed_at,sp.name AS solar_plant_name
        FROM services s JOIN solar_plants sp ON sp.id_solar_plants=s.id_solar_plant WHERE sp.id_customer=$1
        ORDER BY s.scheduled_at NULLS LAST,s.id DESC`, [ownerId]);
      return response.json({ requests: requests.rows, services: services.rows });
    } catch (error) { return failure(response, error); }
  });
  router.get("/requests/:requestId", requireSession(pool, ["customer"]), async (request, response) => {
    if (!validId(request.params.requestId)) return response.status(400).json({ message: "ID zahtevka ni veljaven." });
    try {
      const result = await pool.query(`SELECT ${requestFields} FROM service_requests r JOIN solar_plants sp ON sp.id_solar_plants=r.id_solar_plant WHERE r.id=$1 AND sp.id_customer=$2`, [request.params.requestId, sessionAccount(response).id]);
      return result.rows[0] ? response.json({ request: result.rows[0] }) : response.status(404).json({ message: "Zahtevek ni bil najden." });
    } catch (error) { return failure(response, error); }
  });
  router.patch("/managers/requests/:requestId/urgency", requireSession(pool, ["manager"]), async (request, response) => {
    const body = request.body;
    if (!validId(request.params.requestId) || !body || Object.keys(body).length !== 1 || !["standardno", "resno", "nujno"].includes(body.urgency)) return response.status(400).json({ message: "Izberi veljaven zahtevek in nizko, srednjo ali visoko nujnost." });
    const client = await pool.connect().catch(() => null);
    if (!client) return response.status(500).json({ message: "Zahtevka ni bilo mogoče obdelati." });
    try {
      await client.query("BEGIN");
      const current = await client.query('SELECT status FROM service_requests WHERE id=$1 FOR UPDATE', [request.params.requestId]);
      if (!current.rows[0] || ["completed", "rejected", "cancelled"].includes(current.rows[0].status)) {
        await client.query("ROLLBACK");
        return response.status(current.rows[0] ? 409 : 404).json({ message: current.rows[0] ? "Zaključenega ali zaprtega zahtevka ni mogoče spreminjati." : "Zahtevek ni bil najden." });
      }
      await client.query(`UPDATE service_requests SET urgency=$2,reviewed_by=$3,reviewed_at=NOW(),status=CASE WHEN status='submitted' THEN 'reviewing' ELSE status END WHERE id=$1`, [request.params.requestId, body.urgency, sessionAccount(response).id]);
      await client.query(`UPDATE services SET urgency=$2 WHERE id_service_request=$1 AND status NOT IN ('completed','cancelled')`, [request.params.requestId, body.urgency]);
      const result = await client.query(`SELECT ${requestFields} FROM service_requests r JOIN solar_plants sp ON sp.id_solar_plants=r.id_solar_plant WHERE r.id=$1`, [request.params.requestId]);
      await client.query("COMMIT");
      return response.json({ request: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      return failure(response, error);
    } finally { client.release(); }
  });
}
