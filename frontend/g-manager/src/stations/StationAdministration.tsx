import { Badge, Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import type { ApplicationDefinition, ApplicationProfile, GamingClientPackage } from '../types/station.types'
import { applicationTypeLabels, StationIcon, stationError } from './stationPresentation'

export function StationAdministration({ definitions, profiles, loadingDefinitions, loadingProfiles, definitionsError, profilesError, manage, busy, onDefinition, onProfile, deleteDefinition, deleteProfile, onRefresh }: {
  definitions: ApplicationDefinition[]; profiles: ApplicationProfile[]; loadingDefinitions: boolean; loadingProfiles: boolean
  definitionsError: unknown; profilesError: unknown; manage: boolean; busy: boolean
  onDefinition: (value: ApplicationDefinition | null) => void; onProfile: (value: ApplicationProfile | null) => void
  deleteDefinition: (value: ApplicationDefinition) => void; deleteProfile: (value: ApplicationProfile) => void; onRefresh: () => void
}) {
  return <div className="gm-stations-administration">
    <section className="gm-stations-section" aria-labelledby="station-applications-title">
      <header className="gm-stations-section-heading"><div><h2 id="station-applications-title"><StationIcon kind="apps" />Dozvoljene aplikacije</h2><p>Katalog aplikacija i pravila provere njihovog identiteta.</p></div>
        {manage && <Button type="button" disabled={busy || loadingDefinitions || Boolean(definitionsError)} onClick={() => onDefinition(null)}>+ Nova aplikacija</Button>}</header>
      {loadingDefinitions ? <Skeleton lines={4} label="Učitavanje dozvoljenih aplikacija" /> : definitionsError
        ? <ErrorState message={stationError(definitionsError, 'Aplikacije nisu dostupne.')} action={<Button type="button" onClick={onRefresh}>Pokušaj ponovo</Button>} />
        : !definitions.length ? <EmptyState title="Nema dozvoljenih aplikacija" description="Dodajte aplikacije pre kreiranja profila za gaming stanice." />
          : <div className="gm-stations-definition-list">{definitions.map(definition => <article key={definition.id}>
            <div className="gm-stations-definition-title"><StationIcon kind="apps" /><div><h3>{definition.name}</h3><small>{definition.code} · {applicationTypeLabels[definition.type]}</small></div>
              <Badge tone={definition.active ? 'success' : 'neutral'}>{definition.active ? 'Aktivna' : 'Neaktivna'}</Badge></div>
            <code className="gm-stations-executable">{definition.executablePath}</code>
            <dl><div><dt>Izdavač</dt><dd>{definition.publisher || 'Nije naveden'}</dd></div>
              {definition.minimumFileVersion && <div><dt>Minimalna verzija</dt><dd>{definition.minimumFileVersion}</dd></div>}
              {definition.publisherCertificateThumbprint && <div><dt>Sertifikat</dt><dd><code>{definition.publisherCertificateThumbprint}</code></dd></div>}
              {definition.executableSha256 && <div><dt>SHA-256</dt><dd><code>{definition.executableSha256}</code></dd></div>}
              {definition.defaultArguments && <div><dt>Argumenti</dt><dd><code>{definition.defaultArguments}</code></dd></div>}</dl>
            {manage && <footer><Button type="button" variant="secondary" disabled={busy} onClick={() => onDefinition(definition)}>Izmeni</Button>
              <Button type="button" variant="danger" disabled={busy} onClick={() => deleteDefinition(definition)}>Obriši</Button></footer>}
          </article>)}</div>}
    </section>
    <section className="gm-stations-section" aria-labelledby="station-profiles-title">
      <header className="gm-stations-section-heading"><div><h2 id="station-profiles-title"><StationIcon kind="settings" />Profili aplikacija</h2><p>Dozvoljene aplikacije, redosled pokretanja i zavisnosti.</p></div>
        {manage && <Button type="button" disabled={busy || loadingProfiles || loadingDefinitions || Boolean(profilesError || definitionsError)} onClick={() => onProfile(null)}>+ Novi profil</Button>}</header>
      {loadingProfiles ? <Skeleton lines={4} label="Učitavanje profila aplikacija" /> : profilesError
        ? <ErrorState message={stationError(profilesError, 'Profili nisu dostupni.')} action={<Button type="button" onClick={onRefresh}>Pokušaj ponovo</Button>} />
        : !profiles.length ? <EmptyState title="Nema profila aplikacija" description="Kreirajte profil i dodelite ga gaming stanicama kroz podešavanja." />
          : <div className="gm-stations-profile-list">{profiles.map(profile => <article key={profile.id}><header><div><h3>{profile.name}</h3><small>{profile.code} · Konfiguracija v{profile.configurationVersion}</small></div>
            <Badge tone={profile.active ? 'success' : 'neutral'}>{profile.active ? 'Aktivan' : 'Neaktivan'}</Badge></header>
            {profile.description && <p>{profile.description}</p>}
            <ul>{[...profile.entries].sort((a, b) => a.launchOrder - b.launchOrder).map(entry => <li key={entry.id}><strong>{entry.applicationName}</strong>
              <small>{applicationTypeLabels[entry.applicationType]} · Redosled {entry.launchOrder}{entry.autoStart ? ' · Automatsko pokretanje' : ''}{entry.requiredProcess ? ' · Obavezan proces' : ''}{entry.dependencyGroup ? ` · Grupa: ${entry.dependencyGroup}` : ''}</small></li>)}</ul>
            {manage && <footer><Button type="button" variant="secondary" disabled={busy || loadingDefinitions || Boolean(definitionsError)} onClick={() => onProfile(profile)}>Izmeni</Button>
              <Button type="button" variant="danger" disabled={busy} onClick={() => deleteProfile(profile)}>Obriši</Button></footer>}</article>)}</div>}
    </section>
  </div>
}

const packageStatus: Record<string, string> = { AVAILABLE: 'Dostupan', READY: 'Spreman', NOT_CONFIGURED: 'Nije konfigurisan', UNAVAILABLE: 'Nije dostupan', DEVELOPMENT: 'Razvojna verzija', MANUAL: 'Ručna distribucija' }
export function StationClientPackage({ data, loading, error, onRefresh }: { data?: GamingClientPackage; loading: boolean; error: unknown; onRefresh: () => void }) {
  return <section className="gm-stations-section gm-stations-client-package" aria-labelledby="station-client-title">
    <header className="gm-stations-section-heading"><div><h2 id="station-client-title"><StationIcon kind="shield" />G-Manager Gaming Client</h2><p>Windows servis i klijentski interfejs za gaming računare.</p></div>
      {data?.downloadUrl && !error && <a className="button button-primary" href={data.downloadUrl}>Preuzmi Client</a>}</header>
    {loading ? <Skeleton lines={2} label="Učitavanje Gaming Client paketa" /> : error
      ? <ErrorState message={stationError(error, 'Informacije o Client paketu nisu dostupne.')} action={<Button type="button" onClick={onRefresh}>Pokušaj ponovo</Button>} />
      : data && <dl><div><dt>Dostupna verzija</dt><dd>{data.version || 'Nije objavljena'}</dd></div><div><dt>Status paketa</dt><dd>{packageStatus[data.status] ?? data.status}</dd></div>
        <div className="gm-stations-package-digest"><dt>SHA-256</dt><dd><code>{data.sha256 || 'Nije objavljen'}</code></dd></div>
        {!data.downloadUrl && <div className="gm-stations-full"><dd>Preuzimanje paketa trenutno nije dostupno.</dd></div>}</dl>}
  </section>
}
