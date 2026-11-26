import { apiBase } from './api'
import type { Service } from '../types'

export type RequestType = 'fault_report' | 'regular_inspection'
export type RequestUrgency = Service['urgency']
export type CustomerRequest = {
  follow_up_required?: boolean
  id: string; id_solar_plant: string; request_type: RequestType; fault_type: string | null
  description: string | null; requested_services: string[]; preferred_date: string | null
  requested_at: string; urgency: RequestUrgency; status: string; solar_plant_name: string
  installation_address: string; postal_code: string; city: string
}
export type CustomerService = Pick<Service, 'id' | 'service_type' | 'status' | 'urgency' | 'scheduled_at' | 'completed_at' | 'solar_plant_name'> & { id_service_request: string | null }
export const extraServiceLabels: Record<string, string> = {
  panel_cleaning: 'Čiščenje panelov', battery_inspection: 'Pregled baterije',
  electrical_inspection: 'Pregled električnih komponent', mounting_inspection: 'Pregled nosilne konstrukcije',
}
export const requestTypeLabels: Record<RequestType, string> = { fault_report: 'Prijava okvare', regular_inspection: 'Redni pregled' }
export const urgencyLabels: Record<RequestUrgency, string> = { standardno: 'Nizka', resno: 'Srednja', nujno: 'Visoka' }
export const statusLabels: Record<string, string> = { submitted: 'Oddan', reviewing: 'V pregledu', scheduled: 'Dogovorjen termin', completed: 'Zaključen', rejected: 'Zavrnjen', cancelled: 'Preklican', planned: 'Načrtovan', in_progress: 'V teku' }
export function formatRequestDate(value: string | null | undefined, time = false) {
  if (!value) return 'Ni določeno'
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  if (Number.isNaN(date.getTime())) return 'Ni določeno'
  return new Intl.DateTimeFormat('sl-SI', { dateStyle: 'medium', ...(time ? { timeStyle: 'short' as const } : {}) }).format(date)
}
export async function requestApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } })
  const result = await response.json().catch(() => ({})) as T & { message?: string }
  if (!response.ok) throw new Error(result.message ?? 'Zahteva ni uspela. Poskusi znova.')
  return result
}
export function requestError(error: unknown) {
  return error instanceof TypeError ? 'Povezava s strežnikom ni uspela. Poskusi znova.' : error instanceof Error ? error.message : 'Zahteva ni uspela. Poskusi znova.'
}
