import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

export const server = setupServer(
  http.get('/api/v1/gaming-operations/board', () => HttpResponse.json({ serverTime: '2026-08-15T12:00:00Z', stations: [] })),
  http.get('/api/v1/gaming-sessions/stream', () => HttpResponse.json({}, { status: 503 })),
  http.get('/api/v1/gaming-sessions/customer/:id', () => HttpResponse.json([])),
  http.get('/api/v1/waitlist', () => HttpResponse.json({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 })),
  http.get('/api/v1/features/bootstrap', () => HttpResponse.json([
    { key: 'REPORTS', enabled: true, rolloutPercentage: 100, owner: 'Operations', reviewBy: '2027-02-01', overridden: false, overrideExpiresAt: null, version: null },
    { key: 'WORKFLOWS', enabled: true, rolloutPercentage: 100, owner: 'Product', reviewBy: '2027-02-01', overridden: false, overrideExpiresAt: null, version: null },
    { key: 'PWA_OFFLINE', enabled: true, rolloutPercentage: 100, owner: 'Platform', reviewBy: '2027-02-01', overridden: false, overrideExpiresAt: null, version: null },
    { key: 'AI_ASSISTANT', enabled: false, rolloutPercentage: 0, owner: 'Security', reviewBy: '2026-12-01', overridden: false, overrideExpiresAt: null, version: null },
  ])),
)
