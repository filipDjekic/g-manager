import type { CatalogItem } from '../types/catalog.types'
export function testCatalogItem(patch: Partial<CatalogItem> = {}): CatalogItem {
  return { id: 'item-1', name: 'Game hour', description: 'An hour in the arena', type: 'SERVICE', price: 1200, durationMinutes: 60, requiresResource: true, active: true, imageUrl: null, createdAt: '2028-01-01T10:00:00Z', updatedAt: '2028-01-01T10:00:00Z', version: 3, deletedAt: null, deletedBy: null, deletionReason: null, ...patch }
}
