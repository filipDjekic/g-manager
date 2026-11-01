import { PageLayout, Card } from '../components/ui/Layout'
import { Button } from '../components/ui/Button'
import { Component, type ReactNode } from 'react'
import { reportFrontendError } from '../observability/errorReporter'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    reportFrontendError(error, 'react.error-boundary')
  }

  render() {
    if (this.state.failed) {
      return <PageLayout className="screen-message"><Card>
        <h1>Aplikacija trenutno nije dostupna.</h1>
        <p>Došlo je do greške u prikazu. Ponovo učitajte aplikaciju da biste preuzeli aktuelne podatke.</p>
        <Button variant="secondary" type="button" onClick={() => window.location.reload()}>Osveži</Button>
      </Card></PageLayout>
    }
    return this.props.children
  }
}
