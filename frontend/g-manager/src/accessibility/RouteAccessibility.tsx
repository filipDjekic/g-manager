import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const routeNames: Record<string, string> = {
  '/': 'Aktivne sesije', '/sessions': 'Aktivne sesije', '/login': 'Prijava',
  '/activate': 'Aktivacija naloga', '/unauthorized': 'Nedozvoljen pristup',
  '/profile': 'Moj profil', '/catalog': 'Katalog', '/employees': 'Zaposleni', '/customers': 'Klijenti',
  '/settings': 'Radno vreme', '/my-reservations': 'Moji termini',
  '/my-orders': 'Moje narudžbine', '/dashboard': 'Dashboard', '/notification-preferences': 'Podešavanja obaveštenja',
  '/reservations': 'Rezervacije', '/orders': 'Narudžbine', '/users': 'Korisnici',
  '/calendar': 'Kalendar rezervacija',
  '/audit': 'Audit evidencija', '/documents': 'Dokumenti', '/reports': 'Izveštaji', '/workflows': 'Workflow', '/features': 'Feature flags',
}

export function RouteAccessibility() {
  const { pathname } = useLocation()
  const name = routeNames[pathname] ?? 'G-Manager'

  useEffect(() => {
    document.title = `${name} | G-Manager`

    let attempts = 0
    const focusRoute = () => {
      const main = document.querySelector<HTMLElement>('main')
      const heading = main?.querySelector<HTMLElement>('h1')
      if (!main || !heading) {
        if (attempts++ < 20) window.setTimeout(focusRoute, 50)
        return
      }
      main.id = 'main-content'
      main.tabIndex = -1
      heading.tabIndex = -1
      heading.focus({ preventScroll: true })
    }
    focusRoute()
  }, [name])

  const focusMain = () => {
    const target = document.querySelector<HTMLElement>('#main-content')
    target?.focus()
    target?.scrollIntoView({ block: 'start' })
  }

  return <>
    <a className="skip-link" href="#main-content" onClick={(event) => {
      event.preventDefault()
      focusMain()
    }} onKeyDown={(event) => {
      if (event.key === 'Enter') { event.preventDefault(); focusMain() }
    }} onKeyUp={(event) => {
      if (event.key === 'Enter') { event.preventDefault(); focusMain() }
    }}>Preskoči na glavni sadržaj</a>
    <div className="sr-only" aria-live="polite" aria-atomic="true">Otvorena stranica: {name}</div>
  </>
}
