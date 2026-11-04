import { GamingTariffSettings } from '../settings/GamingTariffSettings'
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { workingHoursApi } from '../api/workingHoursApi'
import { timeOffApi } from '../api/timeOffApi'
import { useAuthStore } from '../auth/authStore'
import { hasCapability } from '../auth/capabilities'
import { Badge, Button, PageHeader, PageLayout } from '../components/ui'
import { Tabs } from '../components/ui/Tabs'
import { SetupOverview } from '../settings/SetupOverview'
import { WorkingHoursSettings } from '../settings/WorkingHoursSettings'
import { WorkingHoursExceptions } from '../settings/WorkingHoursExceptions'
import { EmployeeTimeOffSettings } from '../settings/EmployeeTimeOffSettings'
import { SettingsIcon } from '../settings/settingsPresentation'
import { settingsEmployees } from '../settings/settingsPresentation.model'
import '../settings/settings.css'

type Section = 'gaming' | 'overview' | 'hours' | 'exceptions' | 'timeoff'
const hashes: Record<Section, string> = { gaming: '#gaming', overview: '#overview', hours: '#working-hours', exceptions: '#exceptions', timeoff: '#time-off' }
const sections: Record<string, Section> = { '#gaming': 'gaming', '#overview': 'overview', '#working-hours': 'hours', '#exceptions': 'exceptions', '#time-off': 'timeoff', '#timeoff': 'timeoff' }
export function SettingsPage() {
  const actor = useAuthStore(state => state.user), location = useLocation(), navigate = useNavigate(), client = useQueryClient()
  const section = sections[location.hash] ?? 'overview', [dirtyCount, setDirtyCount] = useState(0)
  const canRead = hasCapability(actor, 'WORKING_HOURS_READ'), canManage = hasCapability(actor, 'WORKING_HOURS_MANAGE')
  const hours = useQuery({ queryKey: ['working-hours'], queryFn: workingHoursApi.list, enabled: canRead })
  const employees = useQuery({ queryKey: ['settings', 'employees', actor?.id], queryFn: () => settingsEmployees(hasCapability(actor, 'USER_LIST')),
    enabled: hasCapability(actor, 'EMPLOYEE_LIST') && (section === 'overview' || section === 'timeoff'), staleTime: 60000 })
  const exceptions = useQuery({ queryKey: ['working-hours', 'exceptions', 'summary'], queryFn: workingHoursApi.summary,
    enabled: canRead && section === 'overview' })
  const timeOff = useQuery({ queryKey: ['settings', 'time-off', 'summary', actor?.id], queryFn: timeOffApi.summary,
    enabled: canManage && section === 'overview', refetchInterval: 30000, refetchIntervalInBackground: false })
  useEffect(() => {
    document.getElementById('settings-tab-' + section)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [section])
  const openSection = (value: string) => {
    if (!Object.hasOwn(hashes, value)) return
    void navigate({ pathname: location.pathname, search: location.search, hash: hashes[value as Section] }, { preventScrollReset: true })
  }
  const refreshAvailability = () => Promise.allSettled([
    client.invalidateQueries({ queryKey: ['availability'] }), client.invalidateQueries({ queryKey: ['calendar'] }),
    client.invalidateQueries({ queryKey: ['reservations'] }), client.invalidateQueries({ queryKey: ['waitlist', 'availability'] }),
    client.invalidateQueries({ queryKey: ['staff-booking-plan'] }), client.invalidateQueries({ queryKey: ['resources', 'availability'] }),
  ])
  const exceptionsChanged = async () => {
    await Promise.allSettled([client.invalidateQueries({ queryKey: ['working-hours'] }), refreshAvailability()])
  }
  const timeOffChanged = async () => {
    await Promise.allSettled([client.invalidateQueries({ queryKey: ['settings', 'time-off'] }),
      client.invalidateQueries({ queryKey: ['users', 'employee-statistics'] }), refreshAvailability()])
  }
  return <PageLayout className="gm-settings">
    <PageHeader title="Rad igraonice" description="Radno vreme prostora, izuzeci i dostupnost zaposlenih." icon={<SettingsIcon />} actions={<><Badge tone="info"><SettingsIcon kind="clock" />Europe/Belgrade</Badge></>} />
    <div className="gm-settings-tabs"><Tabs idPrefix="settings" label="Oblasti podešavanja" value={section} onChange={openSection} items={[
      ...(hasCapability(actor, 'GAMING_FINANCE_MANAGE') ? [{ id: 'gaming', label: 'Gaming tarife i naplata' }] : []),
      { id: 'overview', label: 'Pregled' }, { id: 'hours', label: 'Rad igraonice' }, { id: 'exceptions', label: 'Izuzeci' }, { id: 'timeoff', label: 'Odsustva zaposlenih' },
    ]} /></div>
    {section === 'gaming' && hasCapability(actor, 'GAMING_FINANCE_MANAGE') && <GamingTariffSettings />}
    {dirtyCount > 0 && <aside className="gm-settings-dirty" role="status"><span><SettingsIcon kind="edit" />Nesačuvane izmene radnog vremena: {dirtyCount} {dirtyCount === 1 ? 'dan' : 'dana'}. Izmene ostaju sačuvane pri promeni taba.</span>
      {section !== 'hours' && <Button type="button" variant="secondary" onClick={() => openSection('hours')}>Vrati se na radno vreme</Button>}</aside>}
    <div role="tabpanel" id="settings-panel-overview" aria-labelledby="settings-tab-overview" hidden={section !== 'overview'}>
      {section === 'overview' && <SetupOverview hours={hours} employees={employees} exceptions={exceptions} timeOff={timeOff} onOpenTab={openSection} />}
    </div>
    <div role="tabpanel" id="settings-panel-hours" aria-labelledby="settings-tab-hours" hidden={section !== 'hours'}>
      <WorkingHoursSettings query={hours} onDirtyChange={setDirtyCount} />
    </div>
    <div role="tabpanel" id="settings-panel-exceptions" aria-labelledby="settings-tab-exceptions" hidden={section !== 'exceptions'}>
      <WorkingHoursExceptions hours={hours} active={section === 'exceptions'} onChanged={exceptionsChanged} />
    </div>
    <div role="tabpanel" id="settings-panel-timeoff" aria-labelledby="settings-tab-timeoff" hidden={section !== 'timeoff'}>
      <EmployeeTimeOffSettings active={section === 'timeoff'} employees={employees} onChanged={timeOffChanged} />
    </div>
  </PageLayout>
}
