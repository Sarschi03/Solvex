import { afterEach,it,expect,vi } from 'vitest'
import { cleanup,render,screen,within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Administration from './pages/AdministrationPage'
import Analytics from './pages/AnalyticsPage'
import App from './App'
const account={id:'1',first_name:'Demo',last_name:'Admin',email:'admin@test.si',role:'administrator' as const,profile_image_data:null}
afterEach(()=>{cleanup();vi.unstubAllGlobals();localStorage.clear()})
it('administratorski račun odpre svoj prostor brez servisnih postopkov',async()=>{
  localStorage.setItem('solvex:session','true');vi.stubGlobal('fetch',vi.fn().mockImplementation((url:string)=>Promise.resolve(Response.json(url.endsWith('/auth/me')?{account}:{accounts:[]}))))
  render(<App/>);expect(await screen.findByRole('heading',{name:'Uporabniški računi'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Servisi'})).toBeNull();expect(screen.queryByRole('button',{name:'Oddana poročila'})).toBeNull()
})
it('administrator shrani aktivnost in ohrani prikaz pri zavrnjeni spremembi',async()=>{
  const fetchMock=vi.fn().mockImplementation((_url:string,options?:RequestInit)=>Promise.resolve(options?.method==='PATCH'?Response.json({message:'Najprej prerazporedi aktivne servise zaposlenega.'},{status:409}):Response.json({accounts:[{id:'7',first_name:'Jan',last_name:'Test',email:'jan@test.si',role:'employee',enabled:true}]})));vi.stubGlobal('fetch',fetchMock)
  render(<Administration account={account} onLogout={()=>{}}/>);await screen.findByRole('heading',{name:'Jan Test'});const user=userEvent.setup();await user.click(screen.getByRole('checkbox',{name:'Aktiven račun'}));await user.click(screen.getByRole('button',{name:'Shrani račun'}));await screen.findByText('Najprej prerazporedi aktivne servise zaposlenega.');expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/accounts/7'),expect.objectContaining({method:'PATCH',body:'{"role":"employee","enabled":false}'}))
})
it('vodja zahteva analizo z obdobjem in skupino',async()=>{
  const fetchMock=vi.fn().mockImplementation(()=>Promise.resolve(Response.json({requests:[]})));vi.stubGlobal('fetch',fetchMock);render(<Analytics/>);const user=userEvent.setup();await user.type(screen.getByLabelText('Od'),'2026-01-01');await user.type(screen.getByLabelText('Do'),'2026-01-31');await user.selectOptions(screen.getByLabelText('Združi po'),'power');await user.click(screen.getByRole('button',{name:'Pošlji zahtevo'}));await screen.findByText('Zahteva je poslana administratorju.');expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/managers/analytics-requests'),expect.objectContaining({method:'POST',body:'{"date_from":"2026-01-01","date_to":"2026-01-31","group_by":"power"}'}))
})
it('posredovana analiza prikaže tabelo in ne internih zapisnikov',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({requests:[{id:'1',date_from:'2026-01-01',date_to:'2026-01-31',group_by:'manufacturer',shared_at:'2026-02-01T10:00:00Z',result:[{label:'Solar',services:3,faults:2,repairs:1,unknown_faults:0}]}]})));render(<Analytics administrator/>);const table=await screen.findByRole('table');expect(within(table).getByText('Solar')).toBeTruthy();expect(within(table).getByRole('columnheader',{name:'Napake'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Pošlji zahtevo'})).toBeNull()
})
