import { Link, useNavigate } from 'react-router-dom'
import { Button, PageHeader, PageLayout, Card } from '../components/ui'
import { homeForUser } from '../layout/navigation'
import { useAuthStore } from '../auth/authStore'
import { useFeatureStore } from '../feature/featureStore'

export function RouteStatePage({ kind }: { kind: 'unauthorized' | 'missing' | 'unavailable' }) {
  const user = useAuthStore(state => state.user), flags = useFeatureStore(state => state.flags), navigate = useNavigate()
  const title = kind === 'unauthorized' ? 'Pristup nije dozvoljen' : kind === 'missing' ? 'Stranica nije pronađena' : 'Funkcija trenutno nije dostupna'
  return <PageLayout className="screen-message"><Card><PageHeader title={title} description={kind === 'unauthorized'
    ? 'Vaš nalog nema dozvolu za ovaj pregled. Otvorite početnu stranicu ili se obratite administratoru.'
    : kind === 'missing' ? 'Proverite adresu ili nastavite sa početne stranice.' : 'Ovaj deo aplikacije trenutno nije uključen. Ostali dostupni pregledi ostaju na početnoj stranici.'} />
    <div className="ui-actions"><Button variant="secondary" onClick={() => navigate(-1)}>Nazad</Button>
      <Link className="ui-button ui-button--primary ui-button--medium" to={user ? homeForUser(user, flags) : '/login'}>{user ? 'Početna stranica' : 'Prijava'}</Link></div>
  </Card></PageLayout>
}
