import { PageLayout, Button } from '../components/ui'
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
      return <PageLayout className="screen-message">
        <h1>Aplikacija trenutno nije dostupna.</h1>
        <p>Osvežite stranicu i pokušajte ponovo.</p>
        <Button variant="secondary" type="button" onClick={() => window.location.reload()}>Osveži</Button>
      </PageLayout>
    }
    return this.props.children
  }
}
