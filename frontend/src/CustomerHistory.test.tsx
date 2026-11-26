import { afterEach,it,expect,vi } from 'vitest'
import { cleanup,render,screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import History from './pages/customer/ServiceHistoryPage'
import Recommendations from './pages/customer/RecommendationsPage'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('lastnik izbere elektrarno ter vidi javni povzetek in prazno zgodovino druge',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockImplementation((url:string)=>Promise.resolve(Response.json(url.endsWith('/plants')?{plants:[{id:'1',name:'Dom'},{id:'2',name:'Vikend'}]}:{services:url.includes('/1/')?[{id:'5',service_type:'cleaning',performed_at:'2020-01-01',customer_summary:'Očiščeni paneli',outcome:'resolved',parts_used:[]}]:[]}))))
  render(<History/>);await screen.findByText('Očiščeni paneli');await userEvent.setup().selectOptions(screen.getByRole('combobox'),'2');await screen.findByText('Ta elektrarna še nima opravljenih servisov.');expect(screen.queryByText('Očiščeni paneli')).toBeNull()
})
it('priporočilo in trajen opt-out',async()=>{
  let enabled=true;const fetchMock=vi.fn().mockImplementation((_url:string,options?:RequestInit)=>{if(options?.method==='PATCH')enabled=false;return Promise.resolve(Response.json({enabled,recommendations:enabled?[{service_id:'1',plant_id:'1',plant_name:'Dom',due_at:'2026-12-01',overdue:false}]:[]}))});vi.stubGlobal('fetch',fetchMock)
  render(<Recommendations/>);await screen.findByRole('heading',{name:'Dom'});await userEvent.setup().click(screen.getByRole('checkbox'));await screen.findByText('Priporočila so izklopljena.');expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/account/recommendations'),expect.objectContaining({method:'PATCH',body:'{"enabled":false}'}))
})
it('omrežna napaka zgodovine ponudi ponoven poskus',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('Network')));render(<History/>);expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.getByRole('button',{name:'Poskusi znova'})).toBeTruthy()
})
