import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SchedulingPage from './pages/SchedulingPage'
import CalendarPage from './pages/CalendarPage'
import { NotificationsPanel } from './components/NotificationsPanel'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('Razporeditev in obvestila',()=>{
  it('izbere ekipo in vodjo ter pošlje termin z odgovornostmi',async()=>{
    const fetchMock=vi.fn().mockImplementation((url:string,options?:RequestInit)=>Promise.resolve(Response.json(options?.method==='POST'?{service:{id:'1'}}:url.endsWith('/employees')?{employees:[{id:'2',first_name:'Jan',last_name:'Test',service_type:'electrical',active_services:1}]}:url.endsWith('/requests')?{requests:[{id:'3',solar_plant_name:'Dom',status:'submitted',urgency:'nujno'}]}:{services:[]})))
    vi.stubGlobal('fetch',fetchMock);render(<SchedulingPage/>);const user=userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Zahtevek'),'3')
    await user.type(screen.getByLabelText('Začetek termina'),'2090-01-01T09:00')
    await user.type(screen.getByLabelText('Konec termina / rok'),'2090-01-01T10:00')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button',{name:'Shrani razporeditev'}))
    expect((await screen.findByText(/Razporeditev je shranjena/))).toBeTruthy()
    const call=fetchMock.mock.calls.find(([,options])=>options?.method==='POST')!
    expect(call[0]).toBe('/api/managers/services')
    expect(JSON.parse(call[1].body)).toMatchObject({request_id:'3',leader_id:'2',assignments:[{employee_id:'2',responsibility:'electrical'}]})
  })
  it('obvestilo označi kot prebrano z lastnim API-jem',async()=>{
    const fetchMock=vi.fn().mockResolvedValue(Response.json({notifications:[{id:'5',message:'Spremenjen termin',created_at:'2026-11-26T10:00:00Z',read_at:null}]}))
    vi.stubGlobal('fetch',fetchMock);render(<NotificationsPanel/>);const user=userEvent.setup()
    await user.click(await screen.findByRole('button',{name:'Označi kot prebrano'}))
    expect(fetchMock).toHaveBeenCalledWith('/api/notifications/5/read',expect.objectContaining({method:'PATCH'}))
  })
  it('koledar prikaže termine in vodjo ekipe',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({services:[{id:'1',solar_plant_name:'Dom',installation_address:'Test 1',city:'Maribor',urgency:'nujno',scheduled_at:'2090-01-01T09:00:00Z',scheduled_end_at:'2090-01-01T10:00:00Z',assignments:[{employee_id:'2',first_name:'Jan',last_name:'Test',is_leader:true}]}]})))
    render(<CalendarPage/>);expect(await screen.findByText('Ekipa: Jan Test (vodja)')).toBeTruthy()
  })
})
