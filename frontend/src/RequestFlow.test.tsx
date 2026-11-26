import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomerRequestForm } from './components/CustomerRequestForm'
import { ManagerRequestInbox } from './components/ManagerRequestInbox'
import CurrentServicesPage from './pages/customer/CurrentServicesPage'
import type { ManagerRequest } from './hooks/useManagerData'
import type { CustomerRequest } from './lib/requestFlow'
import App from './App'

const plant = { id: '4', name: 'Sončni dom', installation_address: 'Sončna 1', postal_code: '2000', city: 'Maribor', installed_capacity_kw: null, panel_count: null }
const fault: CustomerRequest = { id: '7', id_solar_plant: plant.id, request_type: 'fault_report', fault_type: 'Razsmernik', description: 'Ne deluje.', requested_services: [], preferred_date: null, requested_at: '2026-11-26T10:00:00Z', status: 'submitted', urgency: 'standardno', solar_plant_name: plant.name, installation_address: plant.installation_address, postal_code: '2000', city: 'Maribor' }
const managerFault: ManagerRequest = { ...fault, customer_first_name: 'Ana', customer_last_name: 'Novak', customer_email: 'ana@test.si', customer_phone: null, installed_capacity_kw: null, manufacturer: null, installation_year: null }
beforeEach(() => { localStorage.clear(); window.history.replaceState(null, '', window.location.pathname) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
async function fillFault() {
  const user = userEvent.setup()
  await screen.findByRole('combobox', { name: 'Sončna elektrarna' })
  await user.type(screen.getByLabelText('Vrsta okvare'), 'Razsmernik')
  await user.type(screen.getByLabelText('Opis težave'), 'Ne deluje.')
  return user
}

describe('Obrazci lastnika', () => {
  it('zahteva vrsto in opis okvare, shrani pravilen zahtevek in prikaže potrditev', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(Response.json(url.endsWith('/plants') ? { plants: [plant] } : { request: fault })))
    vi.stubGlobal('fetch', fetchMock)
    render(<CustomerRequestForm type="fault_report" />)
    await screen.findByRole('combobox')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Oddaj zahtevek' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await user.type(screen.getByLabelText('Vrsta okvare'), 'Razsmernik')
    await user.type(screen.getByLabelText('Opis težave'), 'Ne deluje.')
    await user.click(screen.getByRole('button', { name: 'Oddaj zahtevek' }))
    expect((await screen.findByRole('status')).textContent).toContain('Zahtevek #7 je uspešno oddan')
    expect(fetchMock).toHaveBeenCalledWith('/api/requests', expect.objectContaining({ method: 'POST', body: JSON.stringify({ id_solar_plant: '4', request_type: 'fault_report', description: 'Ne deluje.', preferred_date: null, fault_type: 'Razsmernik' }) }))
    expect(screen.getByRole('link', { name: 'Poglej stanje zahtevka' }).getAttribute('href')).toBe('#lastnik/current-services')
  })
  it('redni pregled pošlje izbrane dodatne storitve in datum, brez vrste okvare', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(Response.json(url.endsWith('/plants') ? { plants: [plant] } : { request: { ...fault, request_type: 'regular_inspection' } })))
    vi.stubGlobal('fetch', fetchMock)
    render(<CustomerRequestForm type="regular_inspection" />)
    const user = userEvent.setup()
    await screen.findByRole('combobox')
    expect(screen.queryByLabelText('Vrsta okvare')).toBeNull()
    await user.click(screen.getByLabelText('Čiščenje panelov'))
    await user.click(screen.getByLabelText('Pregled baterije'))
    await user.type(screen.getByLabelText('Želeni datum (neobvezno)'), '2096-02-29')
    await user.click(screen.getByRole('button', { name: 'Oddaj zahtevek' }))
    await screen.findByRole('status')
    const body = JSON.parse(fetchMock.mock.calls.find(([url]) => url === '/api/requests')![1].body)
    expect(body).toEqual({ id_solar_plant: '4', request_type: 'regular_inspection', description: null, preferred_date: '2096-02-29', requested_services: ['panel_cleaning', 'battery_inspection'] })
  })
  it('lastnik brez elektrarne jo lahko doda neposredno pred oddajo', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, options?: RequestInit) => Promise.resolve(Response.json(options?.method === 'POST' ? { plant } : { plants: [] })))
    vi.stubGlobal('fetch', fetchMock)
    render(<CustomerRequestForm type="fault_report" />)
    const user = userEvent.setup()
    await screen.findByRole('form', { name: 'Dodaj elektrarno' })
    await user.type(screen.getByLabelText('Ime elektrarne'), 'Sončni dom')
    await user.type(screen.getByLabelText('Naslov elektrarne'), 'Sončna 1')
    await user.type(screen.getByLabelText('Poštna številka'), '2000')
    await user.type(screen.getByLabelText('Kraj'), 'Maribor')
    await user.click(screen.getByRole('button', { name: 'Shrani elektrarno' }))
    expect(await screen.findByRole('combobox', { name: 'Sončna elektrarna' })).toHaveProperty('value', '4')
    expect(fetchMock).toHaveBeenCalledWith('/api/plants', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Sončni dom', installation_address: 'Sončna 1', postal_code: '2000', city: 'Maribor' }) }))
  })
  it('napaka nalaganja ponudi ponovni poskus', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Network error')).mockResolvedValueOnce(Response.json({ plants: [plant] })))
    render(<CustomerRequestForm type="fault_report" />)
    const user = userEvent.setup()
    expect((await screen.findByRole('alert')).textContent).toContain('Povezava s strežnikom ni uspela')
    await user.click(screen.getByRole('button', { name: 'Poskusi znova' }))
    expect(await screen.findByRole('combobox')).toBeTruthy()
  })
  it('zavrnitev oddaje ohrani vnos in omogoči popravek', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => Promise.resolve(url.endsWith('/plants') ? Response.json({ plants: [plant] }) : Response.json({ message: 'Elektrarna ni bila najdena.' }, { status: 404 }))))
    render(<CustomerRequestForm type="fault_report" />)
    const user = await fillFault()
    await user.click(screen.getByRole('button', { name: 'Oddaj zahtevek' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Elektrarna ni bila najdena.')
    expect(screen.getByLabelText('Opis težave')).toHaveProperty('value', 'Ne deluje.')
    expect(screen.getByRole('button', { name: 'Oddaj zahtevek' })).toHaveProperty('disabled', false)
  })
  it('med shranjevanjem prepreči večkratni klik in ne prikaže prezgodnje potrditve', async () => {
    let finish!: (value: Response) => void
    const pending = new Promise<Response>(resolve => { finish = resolve })
    const fetchMock = vi.fn().mockImplementation((url: string) => url.endsWith('/plants') ? Promise.resolve(Response.json({ plants: [plant] })) : pending)
    vi.stubGlobal('fetch', fetchMock)
    render(<CustomerRequestForm type="fault_report" />)
    const user = await fillFault()
    await user.click(screen.getByRole('button', { name: 'Oddaj zahtevek' }))
    const button = screen.getByRole('button', { name: 'Oddajanje ...' })
    expect(button).toHaveProperty('disabled', true)
    await user.click(button)
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/requests')).toHaveLength(1)
    expect(screen.queryByText(/uspešno oddan/)).toBeNull()
    finish(Response.json({ request: fault }))
    expect((await screen.findByRole('status')).textContent).toContain('uspešno oddan')
  })
  it('po oddaji povezava v aplikaciji odpre shranjeno stanje zahtevka', async () => {
    localStorage.setItem('solvex:session', 'true')
    window.history.replaceState(null, '', '#lastnik/fault')
    let submitted = false
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith('/auth/me')) return Promise.resolve(Response.json({ account: { id: '1', first_name: 'Ana', last_name: 'Novak', email: 'ana@test.si', role: 'customer', profile_image_data: null } }))
      if (url.endsWith('/plants')) return Promise.resolve(Response.json({ plants: [plant] }))
      if (options?.method === 'POST') { submitted = true; return Promise.resolve(Response.json({ request: fault })) }
      return Promise.resolve(Response.json({ requests: submitted ? [fault] : [], services: [] }))
    }))
    render(<App />)
    const user = await fillFault()
    await user.click(screen.getByRole('button', { name: 'Oddaj zahtevek' }))
    await user.click(await screen.findByRole('link', { name: 'Poglej stanje zahtevka' }))
    expect(await screen.findByRole('heading', { name: /Prijava okvare #7/ })).toBeTruthy()
    expect(screen.getByText('Oddan')).toBeTruthy()
  })
})

describe('Stanje in pregled vodje', () => {
  it('prikaže lastnikove zahtevke, termine servisov in po izbiri tudi zaključene', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ requests: [fault, { ...fault, id: '8', status: 'completed', solar_plant_name: 'Zaključena elektrarna' }], services: [{ id: '9', id_service_request: '7', solar_plant_name: plant.name, service_type: 'electrical', status: 'scheduled', urgency: 'nujno', scheduled_at: '2026-12-01T10:00:00Z', completed_at: null }] })))
    render(<CurrentServicesPage />)
    expect(await screen.findByRole('heading', { name: /Prijava okvare #7/ })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /Zaključena elektrarna/ })).toBeNull()
    expect(screen.getByText('Visoka')).toBeTruthy()
    expect(screen.getByText('Dogovorjen termin')).toBeTruthy()
    const user = userEvent.setup()
    await user.click(screen.getByLabelText('Prikaži tudi zaključene'))
    expect(screen.getByRole('heading', { name: /Zaključena elektrarna/ })).toBeTruthy()
  })
  it('ponudi osvežitev in pravilno prikaže prazen seznam', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Network')).mockResolvedValueOnce(Response.json({ requests: [], services: [] })))
    render(<CurrentServicesPage />)
    const user = userEvent.setup()
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Poskusi znova' }))
    expect(await screen.findByText('Trenutno nimaš odprtih zahtevkov.')).toBeTruthy()
  })
  it('vodja vidi okvare in preglede ločeno ter filtrira vrsto', async () => {
    render(<ManagerRequestInbox requests={[managerFault, { ...managerFault, id: '8', request_type: 'regular_inspection', requested_services: ['panel_cleaning'] }]} search="" loading={false} onChanged={() => {}} />)
    expect(within(screen.getByRole('region', { name: 'Prijave okvar' })).getByText('Ne deluje.')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Redni pregledi' })).getByText('Dodatne storitve: Čiščenje panelov')).toBeTruthy()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Okvare' }))
    expect(screen.queryByRole('region', { name: 'Redni pregledi' })).toBeNull()
  })
  it('vodja shrani visoko nujnost in sproži osvežitev šele ob uspehu', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ request: { ...fault, urgency: 'nujno', status: 'reviewing' } }))
    vi.stubGlobal('fetch', fetchMock)
    const changed = vi.fn()
    render(<ManagerRequestInbox requests={[managerFault]} search="" loading={false} onChanged={changed} />)
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Določi nujnost'), 'nujno')
    await user.click(screen.getByRole('button', { name: 'Shrani nujnost' }))
    expect((await screen.findByRole('status')).textContent).toContain('Nujnost je shranjena')
    expect(fetchMock).toHaveBeenCalledWith('/api/managers/requests/7/urgency', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ urgency: 'nujno' }) }))
    expect(changed).toHaveBeenCalledOnce()
  })
  it('napaka spremembe nujnosti ohrani izbiro brez lažne potrditve', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: 'Zahtevek je zaprt.' }, { status: 409 })))
    const changed = vi.fn()
    render(<ManagerRequestInbox requests={[managerFault]} search="" loading={false} onChanged={changed} />)
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Določi nujnost'), 'resno')
    await user.click(screen.getByRole('button', { name: 'Shrani nujnost' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Zahtevek je zaprt.')
    expect(screen.getByLabelText('Določi nujnost')).toHaveProperty('value', 'resno')
    expect(changed).not.toHaveBeenCalled()
  })
  it('zaključeni zahtevki nimajo obrazca za spreminjanje', () => {
    render(<ManagerRequestInbox requests={[{ ...managerFault, status: 'completed' }]} search="" loading={false} onChanged={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Shrani nujnost' })).toBeNull()
  })
})
