import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gamingSessionApi, connectGamingSessionStream } from '../api/gamingSessionApi'
import { customerApi } from '../api/customerApi'
import type { GamingOperationsBoard, GamingSessionEvent, GamingStationAction, GamingStationBoardStatus } from '../types/gamingSession.types'
import { GamingSessionsPage } from './GamingSessionsPage'

vi.mock('../api/gamingSessionApi',()=>({gamingSessionApi:{board:vi.fn(),start:vi.fn(),extend:vi.fn(),terminate:vi.fn()},connectGamingSessionStream:vi.fn()}))
vi.mock('../api/customerApi',()=>({customerApi:{list:vi.fn()}}))
const statuses:GamingStationBoardStatus[]=['AVAILABLE','ACTIVE','MAINTENANCE','OFFLINE','EXPIRED','LOCK_PENDING','RETIRED']
const labels=['Dostupna','Aktivna sesija','Održavanje','Offline','Sesija istekla','Čeka zaključavanje','Penzionisana']
function response():GamingOperationsBoard{return{serverTime:'2026-08-15T12:00:00Z',stations:statuses.map((status,index)=>({
  resourceId:`station-${index}`,resourceCode:`PC-${index}`,resourceName:`Stanica ${index}`,locationId:'location-1',status,
  clientEnabled:false,staleHeartbeat:false,enforcementStatus:status==='LOCK_PENDING'?'LOCK_PENDING':'LOCKED',remainingSeconds:status==='ACTIVE'?3600:0,sessionId:status==='ACTIVE'?'session-1':undefined,
  customerId:status==='ACTIVE'?'customer-1':undefined,customerDisplayName:status==='ACTIVE'?'Milica Manager':undefined,
  startedAt:status==='ACTIVE'?'2026-08-15T11:00:00Z':undefined,endsAt:status==='ACTIVE'?'2026-08-15T13:00:00Z':undefined,
  sessionVersion:status==='ACTIVE'?4:undefined,allowedActions:(status==='ACTIVE'?['EXTEND','TERMINATE']:status==='AVAILABLE'?['START']:[]) as GamingStationAction[],
}))}}
function setup(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<QueryClientProvider client={client}><GamingSessionsPage/></QueryClientProvider>)}

describe('Gaming operations board',()=>{
  beforeEach(()=>{vi.clearAllMocks();vi.mocked(gamingSessionApi.board).mockResolvedValue(response());vi.mocked(customerApi.list).mockResolvedValue({content:[],page:0,size:8,totalElements:0,totalPages:0});vi.mocked(connectGamingSessionStream).mockReturnValue(()=>{})})
  it('renders every operational station state and authoritative countdown',async()=>{setup();for(const label of labels)expect(await screen.findByText(label)).toBeVisible();expect(screen.getByLabelText(/Preostalo vreme 1h 0m/)).toBeVisible()})
  it('extends the same active session and immediately refreshes its projection',async()=>{vi.mocked(gamingSessionApi.extend).mockResolvedValue({} as never);setup();const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'+60 min'}));
    await waitFor(()=>expect(gamingSessionApi.extend).toHaveBeenCalledWith('session-1',60,4,expect.any(String)));await waitFor(()=>expect(gamingSessionApi.board).toHaveBeenCalledTimes(2))})
  it('invalidates the board when a session SSE event arrives',async()=>{let emit:((event:GamingSessionEvent)=>void)|undefined;vi.mocked(connectGamingSessionStream).mockImplementation(callback=>{emit=callback;return()=>{}});setup();await screen.findByText('Dostupna');emit?.({eventId:'e1',type:'GAMING_SESSION_STARTED',sessionId:'session-1',occurredAt:'2026-08-15T12:00:00Z'});
    await waitFor(()=>expect(gamingSessionApi.board).toHaveBeenCalledTimes(2))})
})
