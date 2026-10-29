import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card } from '../components/ui'
import { roleLabels } from '../components/ui/statusPresentation'
import type { UserResponse } from '../types/user.types'
import { ProfileIcon } from './profilePresentation'
import { profileDate } from './profilePresentation.model'

export function ProfileAccountCard({ profile, canRead, onSessions }: {
  profile: UserResponse; canRead: boolean; onSessions: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  return <Card className="gm-profile-card gm-profile-account" aria-labelledby="profile-account-title">
    <header className="gm-profile-card-header"><span className="gm-profile-card-icon"><ProfileIcon kind="info" /></span><div><h2 id="profile-account-title">Informacije o nalogu</h2></div></header>
    <dl className="gm-profile-account-data"><div><dt>Datum registracije</dt><dd><time dateTime={profile.createdAt}>{profileDate(profile.createdAt)}</time></dd></div>
      <div><dt>Poslednja izmena profila</dt><dd><time dateTime={profile.updatedAt}>{profileDate(profile.updatedAt)}</time></dd></div>
      <div><dt>Uloga</dt><dd>{roleLabels[profile.role]}</dd></div><div><dt>Status naloga</dt><dd><Badge tone={profile.active ? 'success' : 'danger'}>{profile.active ? 'Aktivan' : 'Neaktivan'}</Badge></dd></div>
    </dl><p className="gm-profile-timezone">Datumi su prikazani u vremenskoj zoni Europe/Belgrade.</p>
    <section className="gm-profile-security-shortcut" aria-labelledby="profile-security-title"><div className="gm-profile-security-heading"><ProfileIcon kind="shield" /><h3 id="profile-security-title">Bezbednost naloga</h3></div>
      <p>Pregledajte aktivne uređaje i bezbednosne aktivnosti svog naloga.</p>
      {canRead && <Link className="ui-button ui-button--secondary ui-button--medium gm-profile-sessions-link" to="/sessions" onClick={onSessions}><ProfileIcon kind="devices" />Upravljaj sesijama<ProfileIcon kind="arrow" /></Link>}
    </section>
  </Card>
}
