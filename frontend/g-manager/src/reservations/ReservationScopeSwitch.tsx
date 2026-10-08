import { Button } from '../components/ui'
import type { ReservationScope } from '../types/reservation.types'
export function ReservationScopeSwitch({ scope, onChange }: { scope: ReservationScope; onChange: (scope: ReservationScope) => void }) {
  return <div className="reservation-scope" role="group" aria-label="Opseg rezervacija">
    <Button variant={scope==='MANAGEABLE'?'primary':'secondary'} aria-pressed={scope==='MANAGEABLE'} onClick={()=>onChange('MANAGEABLE')}>Moje stanice</Button>
    <Button variant={scope==='ALL'?'primary':'secondary'} aria-pressed={scope==='ALL'} onClick={()=>onChange('ALL')}>Sve stanice</Button>
  </div>
}
