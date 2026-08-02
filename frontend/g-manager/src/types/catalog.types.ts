export type ItemType = 'PRODUCT' | 'SERVICE'

export interface CatalogItem {
  id: string
  name: string
  description: string | null
  type: ItemType
  price: number
  durationMinutes: number | null
  active: boolean
  imageUrl: string | null
  createdAt: string
  updatedAt: string
  version: number
}

export interface CatalogItemInput {
  name: string
  description?: string
  type: ItemType
  price: number
  durationMinutes?: number
}

export interface CatalogItemUpdate extends Partial<CatalogItemInput> {
  version: number
}
