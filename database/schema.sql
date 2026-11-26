CREATE TABLE customers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    phone VARCHAR(30),
    address TEXT NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    city VARCHAR(100) NOT NULL
);

CREATE TABLE employees (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    phone VARCHAR(30) NOT NULL,
    service_type VARCHAR(20) NOT NULL
        CHECK (service_type IN ('cleaning', 'electrical', 'installer'))
);

CREATE TABLE managers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    phone VARCHAR(30) NOT NULL
);

CREATE TABLE solar_plants (
    id_solar_plants BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_customer BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    installation_address TEXT NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    city VARCHAR(100) NOT NULL,
    installed_capacity_kw NUMERIC(10, 2)
        CHECK (installed_capacity_kw IS NULL OR installed_capacity_kw > 0),
    panel_count INTEGER
        CHECK (panel_count IS NULL OR panel_count > 0),
    has_battery BOOLEAN NOT NULL DEFAULT FALSE,
    battery_capacity_kwh NUMERIC(10, 2)
        CHECK (battery_capacity_kwh IS NULL OR battery_capacity_kwh > 0),
    installed_on DATE,
    CHECK (has_battery OR battery_capacity_kwh IS NULL),
    UNIQUE (id_customer, name)
);

CREATE TABLE service_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_solar_plant BIGINT NOT NULL
        REFERENCES solar_plants(id_solar_plants) ON DELETE RESTRICT,
    request_type VARCHAR(30) NOT NULL
        CHECK (request_type IN ('fault_report', 'regular_inspection')),
    description TEXT,
    preferred_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'reviewing', 'scheduled', 'completed', 'rejected', 'cancelled')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        request_type <> 'fault_report'
        OR NULLIF(BTRIM(description), '') IS NOT NULL
    ),
    UNIQUE (id, id_solar_plant)
);

CREATE TABLE services (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_solar_plant BIGINT NOT NULL
        REFERENCES solar_plants(id_solar_plants) ON DELETE RESTRICT,
    id_service_request BIGINT,
    service_type VARCHAR(20) NOT NULL
        CHECK (service_type IN ('cleaning', 'electrical', 'installer')),
    id_employee BIGINT
        REFERENCES employees(id) ON DELETE RESTRICT,
    id_manager BIGINT
        REFERENCES managers(id) ON DELETE RESTRICT,
    urgency VARCHAR(20) NOT NULL DEFAULT 'standardno'
        CHECK (urgency IN ('nujno', 'resno', 'standardno')),
    status VARCHAR(20) NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'scheduled', 'in_progress', 'completed', 'cancelled')),
    scheduled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    FOREIGN KEY (id_service_request, id_solar_plant)
        REFERENCES service_requests(id, id_solar_plant) ON DELETE RESTRICT
);

ALTER TABLE services
    ADD COLUMN IF NOT EXISTS urgency VARCHAR(20) NOT NULL DEFAULT 'standardno'
        CHECK (urgency IN ('nujno', 'resno', 'standardno'));

CREATE TABLE service_reports (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_service BIGINT NOT NULL UNIQUE
        REFERENCES services(id) ON DELETE RESTRICT,
    id_employee BIGINT NOT NULL
        REFERENCES employees(id) ON DELETE RESTRICT,
    work_summary TEXT NOT NULL,
    findings TEXT,
    recommendations TEXT,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ
);

ALTER TABLE service_reports
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- migration: 002-user-profiles-and-sessions
ALTER TABLE customers ADD COLUMN IF NOT EXISTS profile_image_data TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS profile_image_data TEXT;

CREATE TABLE IF NOT EXISTS account_sessions (
    token_hash CHAR(64) PRIMARY KEY,
    customer_id BIGINT REFERENCES customers(id) ON DELETE CASCADE,
    employee_id BIGINT REFERENCES employees(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK (num_nonnulls(customer_id, employee_id) = 1)
);
CREATE INDEX IF NOT EXISTS account_sessions_expiry_idx ON account_sessions(expires_at);

-- migration: 003-manager-accounts-and-access
ALTER TABLE managers ADD COLUMN IF NOT EXISTS profile_image_data TEXT;
ALTER TABLE account_sessions ADD COLUMN IF NOT EXISTS manager_id BIGINT REFERENCES managers(id) ON DELETE CASCADE;
ALTER TABLE account_sessions DROP CONSTRAINT IF EXISTS account_sessions_check;
ALTER TABLE account_sessions DROP CONSTRAINT IF EXISTS account_sessions_one_account_check;
ALTER TABLE account_sessions ADD CONSTRAINT account_sessions_one_account_check
    CHECK (num_nonnulls(customer_id, employee_id, manager_id) = 1);

-- migration: 004-owner-plants
ALTER TABLE solar_plants ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(100);
ALTER TABLE solar_plants ADD COLUMN IF NOT EXISTS installation_year SMALLINT
    CHECK (installation_year BETWEEN 1 AND 9999);
UPDATE solar_plants SET installation_year = EXTRACT(YEAR FROM installed_on)::smallint
    WHERE installed_on IS NOT NULL AND installation_year IS NULL;
ALTER TABLE solar_plants ADD CONSTRAINT solar_plants_installation_year_date_check
    CHECK (installed_on IS NULL OR installation_year IS NULL OR installation_year = EXTRACT(YEAR FROM installed_on));

-- migration: 005-account-usernames
CREATE TABLE account_usernames (
    username VARCHAR(64) PRIMARY KEY CHECK (username ~ '^[a-z0-9][a-z0-9_.-]{2,63}$'),
    customer_id BIGINT UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
    employee_id BIGINT UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
    manager_id BIGINT UNIQUE REFERENCES managers(id) ON DELETE CASCADE,
    CHECK (num_nonnulls(customer_id, employee_id, manager_id) = 1)
);

-- migration: 006-customer-requests
ALTER TABLE service_requests
    ADD COLUMN fault_type VARCHAR(100),
    ADD COLUMN requested_services TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN urgency VARCHAR(20) NOT NULL DEFAULT 'standardno'
        CHECK (urgency IN ('standardno','resno','nujno')),
    ADD COLUMN reviewed_by BIGINT REFERENCES managers(id) ON DELETE SET NULL,
    ADD COLUMN reviewed_at TIMESTAMPTZ,
    ADD CONSTRAINT service_requests_fault_type_check CHECK (
        fault_type IS NULL OR (request_type='fault_report' AND LENGTH(BTRIM(fault_type))>0)),
    ADD CONSTRAINT service_requests_extras_check CHECK (
        requested_services <@ ARRAY['panel_cleaning','battery_inspection','electrical_inspection','mounting_inspection']::text[]
        AND array_position(requested_services,NULL) IS NULL
        AND (request_type='regular_inspection' OR cardinality(requested_services)=0));
UPDATE service_requests r SET urgency = COALESCE((
    SELECT s.urgency FROM services s WHERE s.id_service_request=r.id
    ORDER BY CASE s.urgency WHEN 'nujno' THEN 0 WHEN 'resno' THEN 1 ELSE 2 END LIMIT 1
), 'standardno');

-- migration: 007-assignment-scheduling
ALTER TABLE services ADD COLUMN scheduled_end_at TIMESTAMPTZ;
UPDATE services SET scheduled_end_at=scheduled_at + INTERVAL '1 hour' WHERE scheduled_at IS NOT NULL;
ALTER TABLE services ADD CONSTRAINT services_appointment_check
    CHECK (scheduled_end_at IS NULL OR (scheduled_at IS NOT NULL AND scheduled_end_at > scheduled_at));
CREATE TABLE service_assignments (
    service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    responsibility VARCHAR(20) NOT NULL CHECK (responsibility IN ('cleaning','electrical','installer')),
    is_leader BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (service_id,employee_id)
);
CREATE UNIQUE INDEX service_assignments_one_leader ON service_assignments(service_id) WHERE is_leader;
CREATE INDEX service_assignments_employee ON service_assignments(employee_id,service_id);
INSERT INTO service_assignments (service_id,employee_id,responsibility,is_leader)
    SELECT id,id_employee,service_type,true FROM services WHERE id_employee IS NOT NULL;
CREATE TABLE notifications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id BIGINT REFERENCES customers(id) ON DELETE CASCADE,
    employee_id BIGINT REFERENCES employees(id) ON DELETE CASCADE,
    manager_id BIGINT REFERENCES managers(id) ON DELETE CASCADE,
    service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('scheduled','updated','removed','cancelled','completed')),
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    CHECK (num_nonnulls(customer_id,employee_id,manager_id)=1)
);
