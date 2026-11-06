import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, PageHeader, PageLayout } from '../components/ui'
import { EmployeeTimeOffSettings } from '../settings/EmployeeTimeOffSettings'
import { SettingsIcon } from '../settings/settingsPresentation'
import { settingsEmployees } from '../settings/settingsPresentation.model'
import '../settings/settings.css'

export function EmployeeTimeOffPage() {
  const actor = useAuthStore(state => state.user), client = useQueryClient()
  const employees = useQuery({ queryKey: ['settings', 'employees', actor?.id],
    queryFn: () => settingsEmployees(hasCapability(actor, 'USER_LIST')),
    enabled: hasCapability(actor, 'EMPLOYEE_LIST'), staleTime: 60000 })
  const timeOffChanged = async () => {
    await Promise.allSettled([
      client.invalidateQueries({ queryKey: ['settings', 'time-off'] }),
      client.invalidateQueries({ queryKey: ['users', 'employee-statistics'] }),
      client.invalidateQueries({ queryKey: ['availability'] }), client.invalidateQueries({ queryKey: ['calendar'] }),
      client.invalidateQueries({ queryKey: ['reservations'] }), client.invalidateQueries({ queryKey: ['waitlist', 'availability'] }),
      client.invalidateQueries({ queryKey: ['staff-booking-plan'] }), client.invalidateQueries({ queryKey: ['resources', 'availability'] }),
    ])
  }
  return <PageLayout className="gm-settings">
    <PageHeader title="Odsustva zaposlenih" description="Pregled i upravljanje odsustvima i zahtevima zaposlenih."
      icon={<SettingsIcon kind="calendar" />} actions={<Badge tone="info"><SettingsIcon kind="clock" />Europe/Belgrade</Badge>} />
    <EmployeeTimeOffSettings active employees={employees} onChanged={timeOffChanged} />
  </PageLayout>
}
