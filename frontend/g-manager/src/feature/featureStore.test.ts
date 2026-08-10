import { beforeEach, describe, expect, it } from 'vitest'
import { useFeatureStore } from './featureStore'
describe('featureStore', () => {
  beforeEach(() => useFeatureStore.getState().reset())
  it('uses typed safe defaults and applies server bootstrap atomically', () => {
    expect(useFeatureStore.getState().flags).toEqual({ REPORTS: true, WORKFLOWS: true, PWA_OFFLINE: true, AI_ASSISTANT: false })
    useFeatureStore.getState().apply([{ key: 'REPORTS', enabled: false, rolloutPercentage: 0, owner: 'Operations', reviewBy: '2027-02-01', overridden: true, overrideExpiresAt: null, version: 1 }])
    expect(useFeatureStore.getState().flags.REPORTS).toBe(false)
    expect(useFeatureStore.getState().flags.AI_ASSISTANT).toBe(false)
  })
})
