import { gamingSessionApi } from '../api/gamingSessionApi'
import { useAuthStore } from '../auth/authStore'
import { usePagedQuery } from '../query/usePagedQuery'
import { Button, ErrorState, Skeleton, Pagination } from '../components/ui'
import { GamingVisitList } from './GamingVisitList'
export function GamingVisitHistory({ customerId }: { customerId?: string }) {
  const actor = useAuthStore(state => state.user)
  const query = usePagedQuery(['gaming-visits', 'history', actor?.id, customerId], (page, size) => customerId ? gamingSessionApi.customerHistory(customerId, page, size) : gamingSessionApi.myHistory(page, size), 10, true, 15000)
  return <>{query.isLoading ? <Skeleton lines={3} /> : query.error ? <ErrorState message="Gaming istorija nije dostupna." action={<Button onClick={() => void query.refetch()}>Osveži</Button>} /> : <GamingVisitList visits={query.data?.content ?? []} staff={!!customerId} />}
    {query.data && <Pagination page={query.page} onPageChange={query.setPage} totalPages={query.data.totalPages} totalElements={query.data.totalElements} pageSize={10} loading={query.isFetching} />}</>
}
