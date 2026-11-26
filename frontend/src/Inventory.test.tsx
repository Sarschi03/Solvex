import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InventoryPage from './pages/InventoryPage'
import DashboardPage from './pages/DashboardPage'
const low={id:'1',sku:'FUSE',name:'Varovalka',manufacturer:'Test',quantity_on_hand:2,low_stock_threshold:3,low_stock:true,active:true}
const normal={...low,id:'2',sku:'MC4',name:'Priključek',quantity_on_hand:20,low_stock:false}
const fixture={parts:[low,normal],alerts:[{id:'1',part_id:'1',name:'Varovalka',quantity_on_hand:2,low_stock_threshold:3}],movements:[{id:'1',sku:'FUSE',name:'Varovalka',part_id:'1',report_id:'7',service_id:'8',quantity_delta:-2,stock_after:2,reason:'report_consumption',created_at:'2026-01-01T10:00:00Z'}]}
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('Zaloga in poraba delov',()=>{
  it('prikaže količino, mejo, priporočilo za dopolnitev in porabo po poročilu',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json(fixture)));render(<InventoryPage/> )
    expect(await screen.findByRole('heading',{name:'Nizka zaloga (1)'})).toBeTruthy()
    expect(within(screen.getByRole('alert')).getByText(/Na voljo 2, meja 3/)).toBeTruthy()
    expect(screen.getByText(/Poročilo #7 · Servis #8/)).toBeTruthy()
    expect(screen.getByText('Poraba po poročilu · -2 · Stanje po premiku: 2')).toBeTruthy()
    expect(screen.queryByRole('button',{name:/Uredi|Dopolni/})).toBeNull()
  })
  it('filtrira katalog in pokaže samo nizko zalogo',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json(fixture)));render(<InventoryPage/>);const user=userEvent.setup()
    await screen.findByRole('heading',{name:'MC4 · Priključek'})
    await user.click(screen.getByLabelText('Samo nizka zaloga'));expect(screen.queryByRole('heading',{name:'MC4 · Priključek'})).toBeNull()
    await user.type(screen.getByLabelText('Išči del'),'neobstoječe');expect(screen.getByText('Ni delov za prikaz.')).toBeTruthy()
  })
  it('napaka nalaganja omogoči ponovni poskus brez zapisovanja zaloge',async()=>{
    const fetchMock=vi.fn().mockRejectedValueOnce(new TypeError('Network')).mockResolvedValueOnce(Response.json({parts:[],movements:[],alerts:[]}))
    vi.stubGlobal('fetch',fetchMock);render(<InventoryPage/>);const user=userEvent.setup();await screen.findByRole('alert');await user.click(screen.getByRole('button',{name:'Poskusi znova'}));expect(await screen.findByText('Ni delov za prikaz.')).toBeTruthy();expect(fetchMock.mock.calls.every(([,options])=>!options?.method||options.method==='GET')).toBe(true)
  })
  it('pomanjkanje zaloge ne zaklene ali skrije osnutka v vmesniku',async()=>{
    const employee={id:'1',first_name:'Jan',last_name:'Test',email:'jan@test.si',service_type:'electrical'}
    const report={id:'7',id_service:'8',solar_plant_name:'Dom',service_type:'electrical',work_summary:'Menjava varovalke',reported_at:'2020-01-01T10:00:00Z',submitted_at:null,employee_first_name:'Jan',employee_last_name:'Test'}
    vi.stubGlobal('fetch',vi.fn().mockImplementation((url:string)=>Promise.resolve(url.endsWith('/submit')?Response.json({message:'Za del ni dovolj zaloge. Poročilo ostaja osnutek.'},{status:409}):Response.json(url.endsWith('/service-reports')?{reports:[report]}:{services:[]}))))
    render(<DashboardPage employee={employee} account={{...employee,role:'employee',profile_image_data:null}} onAccountChange={()=>{}} onLogout={()=>{}}/>);const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Servisna poročila'}));await user.click(await screen.findByRole('button',{name:'Oddaj poročilo'}));expect((await screen.findByRole('alert')).textContent).toContain('ni dovolj zaloge');expect(screen.getByRole('button',{name:'Uredi'})).toBeTruthy();expect(screen.queryByText(/Servis je zaključen/)).toBeNull()
  })
})
