import { AxiosError } from 'axios';
import { apiClient } from '../api/apiClient';
import type { ApiErrorResponse, AuthResponse } from './authTypes';

export type RegisterPayload = { name: string; email: string; password: string };
export type LoginPayload = { email: string; password: string };

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/register', payload);
  return data;
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', payload);
  return data;
}

export function extractApiError(error: unknown): string {
  const axiosError = error as AxiosError<ApiErrorResponse>;
  return axiosError.response?.data?.message ?? 'Request failed. Try again.';
}
