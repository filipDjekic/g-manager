
import { Pagination } from '../components/ui'

export function GamingBoardPagination({ page, pageSize, total, label, onChange, onSizeChange, loading }: {
  page: number; pageSize: number; total: number; label: string; onChange: (page: number) => void
  onSizeChange?: (size: number) => void; loading?: boolean
}) {
  return <Pagination numbered label={label} page={page} pageSize={pageSize} totalElements={total}
    totalPages={Math.ceil(total / pageSize)} onPageChange={onChange} onPageSizeChange={onSizeChange} loading={loading} />
}
