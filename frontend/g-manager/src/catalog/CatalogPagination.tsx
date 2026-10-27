import { Pagination } from '../components/ui'

export function CatalogPagination({ page, size, totalPages, totalElements, loading, onPageChange, onSizeChange }: {
  page: number; size: number; totalPages: number; totalElements: number; loading: boolean
  onPageChange: (page: number) => void; onSizeChange: (size: number) => void
}) {
  return <Pagination numbered label="Stranice kataloga" page={page} pageSize={size} totalPages={totalPages}
    totalElements={totalElements} loading={loading} onPageChange={onPageChange} onPageSizeChange={onSizeChange} />
}
