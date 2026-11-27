export type Employee = {
  id: string
  first_name: string
  last_name: string
  email: string
  service_type: string
}

export type AccountRole = 'customer' | 'employee' | 'manager' | 'administrator'

export type Account = {
  id: string
  first_name: string
  last_name: string
  email: string
  profile_image_data: string | null
} & ({ role: 'customer' } | { role: 'employee'; service_type: string } | { role: 'manager' } | {role:'administrator'})

export type ProfilePlant = {
  id: string
  name: string
  installation_address: string
  postal_code: string
  city: string
  installed_capacity_kw: string | null
  panel_count: number | null
}

export type PastService = {
  id: string
  service_type: string
  solar_plant_name: string
  completed_at: string | null
  scheduled_at: string | null
}

export type Service = {
  scheduled_end_at?: string | null
  assigned_at?: string | null
  can_report?: boolean
  id: string
  service_type: string
  urgency: 'nujno' | 'resno' | 'standardno'
  status: string
  scheduled_at: string | null
  completed_at: string | null
  notes: string | null
  solar_plant_name: string
  installation_address: string
  postal_code: string
  city: string
  customer_first_name: string
  customer_last_name: string
  employee_first_name: string | null
  employee_last_name: string | null
}

export type ServiceReport = {
  customer_summary?: string | null
  performed_at?: string | null
  plant_condition?: 'operational' | 'limited' | 'not_operational' | null
  outcome?: 'resolved' | 'follow_up' | null
  fault_found?: boolean | null
  fault_cause?: string | null
  parts_used?: ReportPart[]
  id: string
  id_service: string
  service_type: string
  solar_plant_name: string
  work_summary: string
  findings: string | null
  recommendations: string | null
  reported_at: string
  submitted_at: string | null
  employee_first_name: string
  employee_last_name: string
}
export type ReportPart = { inventory_part_id?: string | null; name: string; manufacturer: string | null; quantity: number; replaced: boolean; installed_on: string | null }

export type DashboardPage = 'services' | 'reports' | 'profile' | 'calendar'
export type CustomerPage = 'overview' | 'plants' | 'current-services' | 'history' | 'information' | 'recommendations' | 'profile' | 'inspection' | 'fault'
export type ServiceSortOrder = 'newest' | 'oldest' | 'urgent-first' | 'standard-first'
export type ReportSortOrder = 'newest' | 'oldest'
