import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { UiPreferencesProvider } from './UiPreferences'
import { useUiPreferences } from './uiPreferencesContext'

function Controls() {
  const preferences = useUiPreferences()
  return <><button onClick={() => preferences.setTheme('light')}>Svetla</button>
    <button onClick={() => preferences.setDensity('compact')}>Kompaktna</button>
    <output>{preferences.theme}:{preferences.density}</output></>
}

describe('UI preferences', () => {
  beforeEach(() => localStorage.clear())

  it('persists theme and density and applies them to the document', async () => {
    const user = userEvent.setup()
    const view = render(<UiPreferencesProvider><Controls /></UiPreferencesProvider>)
    await user.click(screen.getByRole('button', { name: 'Svetla' }))
    await user.click(screen.getByRole('button', { name: 'Kompaktna' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(document.documentElement).toHaveAttribute('data-density', 'compact')
    view.unmount()

    render(<UiPreferencesProvider><Controls /></UiPreferencesProvider>)
    expect(screen.getByText('light:compact')).toBeVisible()
  })
})
