import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DashboardPage from './pages/DashboardPage'
import { ReportStructuredFields } from './components/ReportStructuredFields'
import { TechnicianServiceDetails } from './components/TechnicianServiceDetails'
const employee={id:'1',first_name:'Jan',last_name:'Test',email:'jan@test.si',service_type:'electrical'}
const account={...employee,role:'employee' as const,profile_image_data:null}
const service={id:'3',solar_plant_name:'Dom',service_type:'electrical',urgency:'nujno',status:'scheduled',scheduled_at:null,scheduled_end_at:null,completed_at:null,notes:null,installation_address:'Test 1',postal_code:'2000',city:'Maribor',customer_first_name:'Ana',customer_last_name:'Test',employee_first_name:'Jan',employee_last_name:'Test',can_report:true}
afterEach(()=>{cleanup();localStorage.clear();vi.unstubAllGlobals()})
describe('Serviserjev delovni tok',()=>{
  it('pokaže aktivno delo po nujnosti in zgodovino le ob izbiri',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({services:[{...service,id:'1',solar_plant_name:'Nizka',urgency:'standardno'},service,{...service,id:'4',solar_plant_name:'Končano',status:'completed'}]})))
    render(<DashboardPage employee={employee} account={account} onAccountChange={()=>{}} onLogout={()=>{}}/> )
    await screen.findByRole('heading',{name:'Dom'});expect(screen.getAllByRole('heading',{level:3})[0].textContent).toBe('Dom');expect(screen.queryByRole('heading',{name:'Končano'})).toBeNull()
    const user=userEvent.setup();await user.click(screen.getByLabelText('Prikaži zaključene / preklicane'));expect(screen.getByRole('heading',{name:'Končano'})).toBeTruthy()
  })
  it('strukturirana polja zapišejo dele v obrazec brez JSON urejevalnika',async()=>{
    let sent:FormData|undefined
    render(<form onSubmit={event=>{event.preventDefault();sent=new FormData(event.currentTarget)}}><ReportStructuredFields report={null}/><button type="submit">Preveri</button></form>)
    const user=userEvent.setup();await user.selectOptions(screen.getByLabelText('Stanje elektrarne po posegu'),'operational');await user.selectOptions(screen.getByLabelText('Rezultat servisa'),'resolved');await user.selectOptions(screen.getByLabelText('Je bila ugotovljena napaka?'),'no')
    await user.click(screen.getByRole('button',{name:'Dodaj del'}));await user.type(screen.getByLabelText('Naziv dela'),'Varovalka');await user.type(screen.getByLabelText('Proizvajalec'),'Test');await user.click(screen.getByRole('button',{name:'Preveri'}))
    expect(sent?.get('outcome')).toBe('resolved');expect(JSON.parse(String(sent?.get('parts_used')))[0]).toMatchObject({name:'Varovalka',manufacturer:'Test',quantity:1,replaced:true})
  })
  it('podrobnosti prikažejo podatke elektrarne in dejansko zgodovino delov',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({service:{...service,assignments:[],can_report:true,request_description:'Napaka',fault_type:'Razsmernik'},plant:{name:'Dom',manufacturer:'Solar',installation_year:2020,installed_capacity_kw:'10',panel_count:20,has_battery:false},recent_history:[{id:'9',completed_at:'2026-01-01T10:00:00Z',work_summary:'Menjava',outcome:'resolved',parts_used:[{name:'Varovalka',manufacturer:'Test',quantity:1,replaced:true,installed_on:'2020-01-01'}]}]})))
    render(<TechnicianServiceDetails employeeId="1" serviceId="3"/>);expect(await screen.findByText(/Proizvajalec: Solar/)).toBeTruthy();expect(screen.getByText(/Varovalka/)).toBeTruthy();expect(screen.getByText(/Starost:/)).toBeTruthy();expect(screen.queryByRole('button',{name:/Uredi elektrarno/})).toBeNull()
  })
  it('oddaja zaklene poročilo tudi v vmesniku in potrdi zaključek',async()=>{
    const report={id:'8',id_service:'3',service_type:'electrical',solar_plant_name:'Dom',work_summary:'Pregled',reported_at:'2020-01-01T10:00:00Z',submitted_at:null,employee_first_name:'Jan',employee_last_name:'Test'}
    vi.stubGlobal('fetch',vi.fn().mockImplementation((url:string)=>Promise.resolve(Response.json(url.endsWith('/submit')?{report:{...report,submitted_at:'2026-01-01T10:00:00Z'}}:url.endsWith('/service-reports')?{reports:[report]}:{services:[service]}))))
    render(<DashboardPage employee={employee} account={account} onAccountChange={()=>{}} onLogout={()=>{}}/>);const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Servisna poročila'}));await user.click(await screen.findByRole('button',{name:'Oddaj poročilo'}));expect(await screen.findByText('Poročilo je oddano in zaklenjeno. Servis je zaključen.')).toBeTruthy();expect(screen.queryByRole('button',{name:'Uredi'})).toBeNull()
  })
})
