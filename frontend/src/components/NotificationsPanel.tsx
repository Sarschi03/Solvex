import { useApiResource } from '../hooks/useApiResource'
import { requestApi, requestError, formatRequestDate } from '../lib/requestFlow'
import { useState } from 'react'
type Notification = { id: string; message: string; created_at: string; read_at: string | null }
export function NotificationsPanel() {
  const { data,loading,error,reload } = useApiResource<{ notifications: Notification[] }>('/notifications')
  const [actionError,setActionError] = useState('')
  async function read(id: string) { try { await requestApi(`/notifications/${id}/read`, { method:'PATCH' }); reload() } catch (reason) { setActionError(requestError(reason)) } }
  return <aside className="notifications-panel" aria-label="Obvestila"><h2>Obvestila</h2><button type="button" onClick={reload}>Osveži obvestila</button>{loading && <p role="status">Nalaganje obvestil ...</p>}{(error || actionError) && <p role="alert">{error || actionError}</p>}{!loading && !error && (data?.notifications ?? []).length === 0 && <p>Ni obvestil.</p>}{data?.notifications?.map(item => <article key={item.id}><p>{item.message}</p><small>{formatRequestDate(item.created_at,true)}</small>{!item.read_at && <button type="button" onClick={() => void read(item.id)}>Označi kot prebrano</button>}</article>)}</aside>
}
