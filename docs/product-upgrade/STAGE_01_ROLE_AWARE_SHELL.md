# Product upgrade Stage 1 — role-aware shell and design-system foundation

## Existing foundation reused

Stage 1 reuses the backend permission payload, frontend capability fallback, feature flags, responsive Drawer, CommandPalette, NotificationCenter, theme/density preferences, focus management, design tokens and existing routes. No backend, API or database change was needed: adding a second navigation authorization model would have weakened the existing architecture.

## Implemented

- The flat header link list is replaced by a grouped desktop sidebar and equivalent mobile Drawer.
- OWNER/ADMIN receive management groups: Pregled, Poslovanje, Ljudi, Upravljanje, Sistem and Moj nalog.
- EMPLOYEE receives an operational-first Danas/Operativa structure.
- CUSTOMER receives a reduced catalog, booking/order and account structure.
- Every item is filtered using the authenticated capability list; reports/workflows also honor their existing feature flags.
- `/` now redirects customers to catalog and other roles to their operational dashboard instead of sending every user to session management.
- Theme/density controls remain available in the sidebar/Drawer, while identity, search, notifications and logout remain in the compact top bar.
- Design tokens now include semantic warning/info colors, sidebar sizing and shared raised elevation.
- Desktop/mobile layout uses semantic header/aside/nav/content structure and preserves keyboard focus/Drawer behavior.

## Contracts and limitations

Frontend navigation is presentation only. Existing route guards and backend permissions remain the security boundaries. Calendar, dedicated Employee Today and separate customer catalog routes are intentionally not linked before their later vertical-slice stages exist. The current customer reservations page combines booking and history, so Stage 1 exposes one truthful “Termini i zakazivanje” entry rather than duplicate links to the same screen.

No migration or API contract changed. Stage 2 depends on this shell and will introduce the reusable reservation details/action Drawer without changing the navigation authorization model.
