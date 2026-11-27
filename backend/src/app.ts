import express, { type ErrorRequestHandler } from "express";
import "dotenv/config";
import { Pool } from "pg";
import argon2 from "argon2";
import path from "node:path";
import { installProfileRoutes, startSession, requireSession, sessionAccount } from "./profiles.js";
import { installStaffAccountRoutes } from "./staffAccounts.js";
import { installManagerRoutes } from "./managerRoutes.js";
import { installPlantRoutes } from "./plants.js";
import { installLoginRoute } from "./login.js";
import { installRequestRoutes } from "./requests.js";
import { installTechnicianRoutes } from "./technician.js";
import { installInventoryRoutes } from "./inventory.js";
import { canSignIn } from "./accountAccess.js";
import { installAdministrationRoutes } from "./administration.js";
import { installCustomerHistoryRoutes } from "./customerHistory.js";
import { installSchedulingRoutes } from "./scheduling.js";
import { assignedTo, leaderOf } from "./assignmentAccess.js";

const app = express();
const router = express.Router();

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

app.use(express.json({ limit: "400kb" }));
const jsonErrors: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  const type = (error as { type?: string })?.type;
  if (type === "entity.parse.failed") return response.status(400).json({ message: "Pošlji veljavne podatke JSON." });
  if (type === "entity.too.large") return response.status(413).json({ message: "Zahteva je prevelika." });
  return next(error);
};
app.use(jsonErrors);
installProfileRoutes(router, pool);
installStaffAccountRoutes(router, pool);
installManagerRoutes(router, pool);
installPlantRoutes(router, pool);
installLoginRoute(router, pool);
installRequestRoutes(router, pool);
installSchedulingRoutes(router, pool);
installTechnicianRoutes(router, pool);
installInventoryRoutes(router, pool);
installCustomerHistoryRoutes(router, pool);
installAdministrationRoutes(router,pool);

router.get("/services", requireSession(pool, ["employee", "manager"]), async (_request, response) => {
  const account = sessionAccount(response);
  try {
    const result = await pool.query(
      `SELECT
        s.id,
        s.service_type,
        s.urgency,
        s.status,
        s.scheduled_at,
        s.scheduled_end_at,
        (SELECT assigned_at FROM service_assignments sa WHERE sa.service_id=s.id AND sa.employee_id=$1) AS assigned_at,
        ${leaderOf("$1")} AS can_report,
        s.completed_at,
        s.notes,
        sp.name AS solar_plant_name,
        sp.installation_address,
        sp.postal_code,
        sp.city,
        c.first_name AS customer_first_name,
        c.last_name AS customer_last_name,
        e.first_name AS employee_first_name,
        e.last_name AS employee_last_name
      FROM services s
      JOIN solar_plants sp ON sp.id_solar_plants = s.id_solar_plant
      JOIN customers c ON c.id = sp.id_customer
      LEFT JOIN employees e ON e.id = s.id_employee
      WHERE ($1::bigint IS NULL OR ${assignedTo("$1")})
      ORDER BY CASE s.urgency WHEN 'nujno' THEN 0 WHEN 'resno' THEN 1 ELSE 2 END, s.scheduled_at NULLS LAST, s.id DESC`,
      [account.role === "employee" ? account.id : null],
    );

    return response.status(200).json({ services: result.rows });
  } catch (error) {
    console.error("Service list failed:", error);

    return response.status(500).json({
      message: "Seznama servisov ni bilo mogoče naložiti.",
    });
  }
});

router.get("/employees/:employeeId/services", requireSession(pool, ["employee", "manager"], true), async (request, response) => {
  const { employeeId } = request.params;

  if (typeof employeeId !== "string" || !/^\d+$/.test(employeeId) || /^0+$/.test(employeeId)) {
    return response.status(400).json({ message: "ID zaposlenega ni veljaven." });
  }

  try {
    const result = await pool.query(
      `SELECT
        s.id,
        s.service_type,
        s.urgency,
        s.status,
        s.scheduled_at,
        s.scheduled_end_at,
        (SELECT assigned_at FROM service_assignments sa WHERE sa.service_id=s.id AND sa.employee_id=$1) AS assigned_at,
        ${leaderOf("$1")} AS can_report,
        s.completed_at,
        s.notes,
        sp.name AS solar_plant_name,
        sp.installation_address,
        sp.postal_code,
        sp.city,
        c.first_name AS customer_first_name,
        c.last_name AS customer_last_name,
        e.first_name AS employee_first_name,
        e.last_name AS employee_last_name
      FROM services s
      JOIN solar_plants sp ON sp.id_solar_plants = s.id_solar_plant
      JOIN customers c ON c.id = sp.id_customer
      LEFT JOIN employees e ON e.id = s.id_employee
      WHERE ${assignedTo("$1")}
      ORDER BY CASE s.urgency WHEN 'nujno' THEN 0 WHEN 'resno' THEN 1 ELSE 2 END,s.scheduled_at NULLS LAST,s.id DESC`,
      [employeeId],
    );

    return response.status(200).json({ services: result.rows });
  } catch (error) {
    console.error("Assigned service list failed:", error);

    return response.status(500).json({
      message: "Seznama dodeljenih servisov ni bilo mogoče naložiti.",
    });
  }
});

router.post("/employees/login", async (request, response) => {
  const body = (request.body ?? {}) as Record<string, unknown>;
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return response.status(400).json({
      message: "Vnesi e-poštni naslov in geslo.",
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return response.status(400).json({
      message: "Vnesi veljaven e-poštni naslov.",
    });
  }

  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email, password_hash, service_type, profile_image_data
      FROM employees
      WHERE email = $1`,
      [email],
    );
    const employee = result.rows[0] as
      | {
          id: string;
          first_name: string;
          last_name: string;
          email: string;
          password_hash: string;
          service_type: string;
          profile_image_data: string | null;
        }
      | undefined;

    if (!employee || !await canSignIn(pool,"employee",employee.id) || !(await argon2.verify(employee.password_hash, password))) {
      return response.status(401).json({
        message: "E-poštni naslov ali geslo ni pravilno.",
      });
    }

    await startSession(request, response, pool, "employee", employee.id);
    return response.status(200).json({
      message: "Prijava je uspela.",
      account: { id: employee.id, first_name: employee.first_name, last_name: employee.last_name, email: employee.email, service_type: employee.service_type, profile_image_data: employee.profile_image_data, role: "employee" },
      employee: {
        id: employee.id,
        first_name: employee.first_name,
        last_name: employee.last_name,
        email: employee.email,
        service_type: employee.service_type,
      },
    });
  } catch (error) {
    console.error("Employee login failed:", error);

    return response.status(500).json({
      message: "Pri prijavi je prišlo do napake.",
    });
  }
});

router.post("/customers/register", async (request, response) => {
  const body = (request.body ?? {}) as Record<string, unknown>;

  const firstName =
    typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName =
    typeof body.lastName === "string" ? body.lastName.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const address =
    typeof body.address === "string" ? body.address.trim() : "";
  const postalCode =
    typeof body.postalCode === "string" ? body.postalCode.trim() : "";
  const city =
    typeof body.city === "string" ? body.city.trim() : "";

  if (!firstName || !lastName || !email || !password || !address) {
    return response.status(400).json({
      message: "Izpolni vsa obvezna polja.",
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({
      message: "Vnesi veljaven e-poštni naslov.",
    });
  }

  if (password.length < 8) {
    return response.status(400).json({
      message: "Geslo mora vsebovati vsaj 8 znakov.",
    });
  }

  if (!/^\d+$/.test(postalCode)) {
    return response.status(400).json({
      message: "Poštna številka lahko vsebuje samo številke.",
    });
  }

  if (
    firstName.length > 100 ||
    lastName.length > 100 ||
    email.length > 254 ||
    phone.length > 30 ||
    postalCode.length > 20 ||
    city.length > 100
  ) {
    return response.status(400).json({
      message: "Eno ali več polj je predolgo.",
    });
  }

  try {
    const passwordHash = await argon2.hash(password);

    const result = await pool.query(
      `INSERT INTO customers
        (first_name, last_name, email, password_hash, phone, address, postal_code, city)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, first_name, last_name, email, phone, address, postal_code, city`,
      [
        firstName,
        lastName,
        email,
        passwordHash,
        phone || null,
        address,
        postalCode,
        city,
      ],
    );

    return response.status(201).json({
      message: "Registracija je uspela.",
      customer: result.rows[0],
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return response.status(409).json({
        message: "E-poštni naslov je že registriran.",
      });
    }

    console.error("Customer registration failed:", error);

    return response.status(500).json({
      message: "Pri registraciji je prišlo do napake.",
    });
  }
});

router.get("/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.status(200).json({ status: "ok", database: "connected", revision: process.env.APP_REVISION ?? process.env.RENDER_GIT_COMMIT ?? "local" });
  } catch (error) {
    console.error("Database connection failed:", error);
    response.status(503).json({ status: "error", database: "disconnected" });
  }
});

// The same API prefix works behind Vite and in the production server.
app.use("/api", router);
app.use(router);

if (process.env.SERVE_FRONTEND === "true") {
  const frontendDist = path.resolve(import.meta.dirname, "../../frontend/dist");
  app.use(express.static(frontendDist));
  app.get("/{*splat}", (request, response) => {
    if (request.path.startsWith("/api/")) {
      return response.status(404).json({ message: "API route not found." });
    }
    return response.sendFile(path.join(frontendDist, "index.html"));
  });
}

export { app };
