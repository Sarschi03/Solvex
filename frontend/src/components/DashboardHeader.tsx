import avatar from '../assets/profile-avatar.svg'
import { useState } from 'react'
import { NotificationsPanel } from './NotificationsPanel'

type DashboardHeaderProps = {
  isProfile: boolean
  onProfile: () => void
  searchValue: string
  onSearch: (value: string) => void
  searchLabel: string
  profileImage?: string | null
}

export function DashboardHeader({ isProfile, onProfile, searchValue, onSearch, searchLabel, profileImage }: DashboardHeaderProps) {
  const [notificationsOpen,setNotificationsOpen] = useState(false)
  return (
    <header className="dashboard-topbar">
      <label className="dashboard-global-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
        <input type="search" aria-label={searchLabel} placeholder="Išči ..." value={searchValue}
          onChange={(event) => onSearch(event.target.value)} />
      </label>
      <button type="button" className="notification-toggle" aria-label="Obvestila" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(value => !value)}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6" /></svg></button>
      {notificationsOpen && <NotificationsPanel />}
      <button className="profile-avatar-button" type="button" aria-label="Odpri profil"
        aria-current={isProfile ? 'page' : undefined}
        title="Profil" onClick={onProfile}>
        <img src={profileImage || avatar} alt="" width="42" height="42" />
      </button>
    </header>
  )
}
