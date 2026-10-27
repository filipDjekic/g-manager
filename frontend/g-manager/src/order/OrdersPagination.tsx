import { Pagination } from '../components/ui'

export function OrdersPagination({ page, size, totalPages, totalElements, busy, onPage, onSize }: {
  page: number; size: number; totalPages: number; totalElements: number; busy: boolean
  onPage: (page: number) => void; onSize: (size: number) => void
}) {
  return <Pagination numbered label="Stranice narudžbina" page={page} pageSize={size} totalPages={totalPages}
    totalElements={totalElements} loading={busy} onPageChange={onPage} onPageSizeChange={onSize} />
}
