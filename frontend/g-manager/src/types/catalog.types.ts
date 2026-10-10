export type ItemType = 'PRODUCT' | 'SERVICE'

export interface CatalogStatistics {
  serviceCount: number
  activeServiceCount: number
  productCount: number
  inactiveCount: number | null
  administrative: boolean
  maxImageBytes: number
}

export interface CatalogItem {
  id: string
  name: string
  description: string | null
  type: ItemType
  price: number
  durationMinutes: number | null
  requiresResource?: boolean
  active: boolean
  imageUrl: string | null
  createdAt: string
  updatedAt: string
  version: number
  deletedAt: string | null
  deletedBy: string | null
  deletionReason: string | null
}

export interface CatalogItemInput {
  name: string
  description?: string
  type: ItemType
  price: number
  durationMinutes?: number
  requiresResource?: boolean
}

export interface CatalogItemUpdate extends Partial<CatalogItemInput> {
  version: number
}
