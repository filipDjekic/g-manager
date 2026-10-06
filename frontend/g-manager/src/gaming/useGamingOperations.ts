import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { connectGamingSessionStream, gamingSessionApi, type GamingStreamState } from '../api/gamingSessionApi'

export function useGamingOperations(enabled = true) {
  const client = useQueryClient()
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')
  const [connection, setConnection] = useState<GamingStreamState>('connecting')
  const board = useQuery({ queryKey: ['gaming-operations', 'board'], queryFn: () => gamingSessionApi.board(),
    enabled, refetchInterval: enabled && visible ? 15000 : false, refetchIntervalInBackground: false })
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  useEffect(() => {
    if (!enabled || !visible) return
    let pending: number | undefined
    const refresh = () => {
      if (pending !== undefined) return
      pending = window.setTimeout(() => {
        pending = undefined
        void client.invalidateQueries({ queryKey: ['gaming-operations'] })
      }, 150)
    }
    const disconnect = connectGamingSessionStream(refresh, (state) => {
      setConnection(state)
      if (state === 'connected') refresh()
    })
    return () => { disconnect(); window.clearTimeout(pending) }
  }, [client, enabled, visible])
  return { board, connection, visible }
}
