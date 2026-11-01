import { useId, type ReactNode } from 'react'
import { Badge, Card, Skeleton, PageHeader, TableShell } from '../components/ui'
import type { NotificationPreference, NotificationType } from '../types/notification.types'
import { channelState, notificationDefinitions, notificationGroups, type NotificationChannel, type NotificationIconKind } from './notificationPreferences'

export function NotificationIcon({ kind, className = '' }: { kind: NotificationIconKind; className?: string }) {
  const paths: Record<NotificationIconKind, ReactNode> = {
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    monitor: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8 12 3 3 5-6" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    calendarPlus: <><path d="M8 2v4M16 2v4M3 10h18M12 13v6M9 16h6" /><rect x="3" y="4" width="18" height="18" rx="2" /></>,
    calendarClock: <><path d="M8 2v4M16 2v4M3 10h17M11 21H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4" /><circle cx="17" cy="17" r="5" /><path d="M17 14v3l2 1" /></>,
    bag: <><path d="m5 7-2 14h18L19 7zM8 9V6a4 4 0 0 1 8 0v3" /></>,
    package: <><path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10M8 4l9 5" /><path d="m8 15 2 2 4-4" /></>,
    ticket: <><path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4zM15 5v2M15 10v4M15 17v2" /></>,
    calendarX: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v4M16 2v4M3 10h18m-12 4 6 5m0-5-6 5" /></>,
    file: <><path d="M14 2H5v20h14V7zM14 2v5h5m-11 7 3 3 5-6" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    save: <><path d="M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-7h8v7" /></>,
    arrow: <path d="M20 12H4m6-6-6 6 6 6" />,
  }
  return <svg className={`gm-notification-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[kind]}</svg>
}

function PreferenceSwitch({ label, value, disabled, locked = false, describedBy, onChange }: {
  label: string; value: boolean | 'mixed'; disabled?: boolean; locked?: boolean; describedBy?: string
  onChange: (value: boolean) => void
}) {
  const state = value === 'mixed' ? 'Mešovito' : value ? 'Uključeno' : 'Isključeno'
  return <div className="gm-notification-switch-control">
    <button type="button" role="checkbox" aria-checked={value} aria-label={label} aria-describedby={describedBy}
      disabled={disabled} className="gm-notification-switch" data-state={value === 'mixed' ? 'mixed' : value ? 'on' : 'off'}
      onClick={() => onChange(value !== true)}>
      <span className="gm-notification-switch-track" aria-hidden="true"><span>{value === 'mixed' ? '−' : value ? '✓' : ''}</span></span>
    </button>
    <span className="gm-notification-switch-state" aria-hidden="true">{locked && <NotificationIcon kind="lock" />}{state}</span>
  </div>
}

export function NotificationPreferencesHeading({ actions }: { actions?: ReactNode }) {
  return <PageHeader title="Obaveštenja" description={<>Podesite kako i kada želite da primate obaveštenja.</>} icon={<NotificationIcon kind="bell" />} actions={<>{actions && <div className="gm-notification-header-actions">{actions}</div>}</>} />
}

export function NotificationChannels({ items, saving, onChange }: {
  items: NotificationPreference[]; saving: boolean; onChange: (channel: NotificationChannel, value: boolean) => void
}) {
  const id = useId()
  const channels: { channel: NotificationChannel; label: string; description: string; icon: NotificationIconKind }[] = [
    { channel: 'emailEnabled', label: 'Email', description: 'Obaveštenja na vašu email adresu.', icon: 'mail' },
    { channel: 'inAppEnabled', label: 'U aplikaciji', description: 'Obaveštenja unutar G-Manager aplikacije.', icon: 'monitor' },
  ]
  const hasEditable = items.some(value => !value.mandatory)
  return <Card className="gm-notification-card gm-notification-channels">
    <div className="gm-notification-section-heading"><h2>Kanali obaveštenja</h2><p>Izaberite načine na koje želite da primate obaveštenja.</p></div>
    <div className="gm-notification-channel-grid">
      {channels.map(({ channel, label, description, icon }) => <div className={`gm-notification-channel gm-notification-channel--${channel}`} key={channel}>
        <span className="gm-notification-channel-icon"><NotificationIcon kind={icon} /></span>
        <div className="gm-notification-channel-description"><h3>{label}</h3><p>{description}</p></div>
        <PreferenceSwitch label={`${label}: sva neobavezna obaveštenja`} value={channelState(items, channel)}
          disabled={saving || !hasEditable} describedBy={`${id}-channel-help`} onChange={value => onChange(channel, value)} />
      </div>)}
    </div>
    <p className="gm-notification-channel-help" id={`${id}-channel-help`}>
      Grupni prekidači menjaju samo neobavezna obaveštenja. Mešovito znači da se podešavanja razlikuju po vrstama.
    </p>
  </Card>
}

export function NotificationTypes({ items, changed, failures, saving, onChange }: {
  items: NotificationPreference[]; changed: Set<NotificationType>; failures: Partial<Record<NotificationType, string>>
  saving: boolean; onChange: (type: NotificationType, channel: NotificationChannel, value: boolean) => void
}) {
  const id = useId()
  const byType = new Map(items.map(value => [value.type, value]))
  return <Card className="gm-notification-card gm-notification-types">
    <div className="gm-notification-section-heading"><h2 id={`${id}-title`}>Vrste obaveštenja</h2>
      <p>Izaberite za koje događaje želite da primate obaveštenja i preko kojih kanala.</p></div>
    <TableShell label="Tabelarni pregled" className="gm-notification-table-wrap">
      <table className="ui-data-table gm-notification-table" role="table" aria-labelledby={`${id}-title`}>
        <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Vrsta obaveštenja</th>
          <th scope="col" role="columnheader">U aplikaciji</th><th scope="col" role="columnheader">Email</th></tr></thead>
        {notificationGroups.map(group => {
          const values = group.types.flatMap(type => { const item = byType.get(type); return item ? [item] : [] })
          return values.length > 0 && <tbody key={group.label} role="rowgroup">
            <tr className="gm-notification-group" role="row"><th colSpan={3} scope="rowgroup" role="rowheader">
              <span><NotificationIcon kind={group.icon} />{group.label}</span>
            </th></tr>
            {values.map(item => {
              const definition = notificationDefinitions[item.type]
              const mandatoryId = `${id}-${item.type}-mandatory`, failureId = `${id}-${item.type}-error`
              const description = [item.mandatory && mandatoryId, failures[item.type] && failureId].filter(Boolean).join(' ') || undefined
              return <tr className="gm-notification-type-row" key={item.type} role="row" data-changed={changed.has(item.type)}>
                <th scope="row" role="rowheader" className="gm-notification-type-summary">
                  <div className="gm-notification-type-identity"><span className="gm-notification-type-icon"><NotificationIcon kind={definition.icon} /></span>
                    <div><div className="gm-notification-type-title"><strong>{definition.label}</strong>
                      {item.mandatory && <Badge tone="accent"><NotificationIcon kind="lock" />Obavezno</Badge>}
                      {changed.has(item.type) && <span className="gm-notification-edited">Izmenjeno</span>}
                    </div><p>{definition.description}</p>
                      {item.mandatory && <p className="gm-notification-mandatory" id={mandatoryId}>Ovo bezbednosno obaveštenje nije moguće isključiti.</p>}
                      {failures[item.type] && <p className="gm-notification-row-error" id={failureId}>{failures[item.type]}</p>}
                    </div>
                  </div>
                </th>
                {(['inAppEnabled', 'emailEnabled'] as const).map(channel => <td key={channel} role="cell" className="gm-notification-channel-cell">
                  <span className="gm-notification-mobile-label">{channel === 'inAppEnabled' ? 'U aplikaciji' : 'Email'}</span>
                  <PreferenceSwitch label={`${definition.label} - ${channel === 'inAppEnabled' ? 'u aplikaciji' : 'email'}`}
                    value={item[channel]} disabled={item.mandatory || saving} locked={item.mandatory}
                    describedBy={description} onChange={value => onChange(item.type, channel, value)} />
                </td>)}
              </tr>
            })}
          </tbody>
        })}
      </table>
    </TableShell>
  </Card>
}

export function NotificationPreferencesLoading() {
  return <div className="gm-notification-loading" aria-busy="true">
    <Card className="gm-notification-card"><Skeleton lines={2} label="Učitavanje kanala obaveštenja" />
      <div className="gm-notification-channel-grid">{[0, 1].map(value => <div className="gm-notification-channel" key={value}>
        <Skeleton lines={2} label="Učitavanje kanala" /></div>)}</div></Card>
    <Card className="gm-notification-card"><Skeleton lines={2} label="Učitavanje vrsta obaveštenja" />
      {[0, 1, 2, 3].map(value => <div className="gm-notification-loading-row" key={value}><Skeleton lines={2} label="Učitavanje podešavanja" /></div>)}</Card>
  </div>
}
