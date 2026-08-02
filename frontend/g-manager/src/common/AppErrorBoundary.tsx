import { Component, type ReactNode } from 'react'

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

  render() {
    if (this.state.failed) {
      return <main className="screen-message">
        <h1>Aplikacija trenutno nije dostupna.</h1>
        <p>Osvežite stranicu i pokušajte ponovo.</p>
        <button type="button" onClick={() => window.location.reload()}>Osveži</button>
      </main>
    }
    return this.props.children
  }
}
