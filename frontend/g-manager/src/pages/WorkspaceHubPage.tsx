import { Link } from 'react-router-dom'
import { useAuthStore } from '../auth/authStore'
import { useFeatureStore } from '../feature/featureStore'
import { Card, PageHeader, PageLayout } from '../components/ui'
import { equipmentItems, managementItems, permittedItems, toolItems } from '../layout/navigation'
import { NavigationIcon } from '../layout/NavigationIcon'

export function WorkspaceHubPage({ kind }: { kind: 'management' | 'equipment' | 'tools' }) {
  const user = useAuthStore(state => state.user), flags = useFeatureStore(state => state.flags)
  if (!user) return null
  const title = kind === 'management' ? 'Upravljanje' : kind === 'equipment' ? 'Oprema' : 'Alati'
  const items = permittedItems(user, flags, kind === 'management' ? managementItems : kind === 'equipment' ? equipmentItems : toolItems)
  return <PageLayout><PageHeader title={title} description={kind === 'management'
    ? 'Podešavanja poslovanja i pristupa na jednom mestu.' : 'Izaberite oblast koja vam je potrebna.'} />
    <div className="ui-hub-grid">{items.map(item => <Card key={item.to}><NavigationIcon to={item.to} />
      <h2>{item.children ? item.label : <Link to={item.to}>{item.label}</Link>}</h2><p>{item.description}</p>
      {item.children ? <div className="ui-actions">{item.children.map(child => <Link key={child.to} to={child.to}>{child.label} →</Link>)}</div>
        : <Link to={item.to}>Otvori →</Link>}
    </Card>)}</div>
  </PageLayout>
}
