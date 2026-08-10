import type { FeatureFlagKey, FeatureFlagState } from '../types/feature.types'
import { apiClient } from './client'
export const featureApi = {
  bootstrap: () => apiClient.get<FeatureFlagState[]>('/features/bootstrap').then((response) => response.data),
  list: () => apiClient.get<FeatureFlagState[]>('/features').then((response) => response.data),
  update: (key: FeatureFlagKey, data: { enabled: boolean; rolloutPercentage: number; expiresAt: string | null; reason: string; version: number | null }) => apiClient.patch<FeatureFlagState>(`/features/${key}`, data).then((response) => response.data),
}
