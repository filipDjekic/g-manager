import { apiClient } from './api/apiClient';

export type Role = 'OWNER' | 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER';
export type User = { id: number; name: string; email: string; role: Role; active: boolean; organizationId?: number | null; organizationName?: string | null; createdAt?: string; updatedAt?: string };
export type EmployeePayload = { name: string; email: string; password?: string; role: Exclude<Role, 'CUSTOMER'> };

export async function getMe(): Promise<User> { const { data } = await apiClient.get<User>('/users/me'); return data; }
export async function getEmployees(): Promise<User[]> { const { data } = await apiClient.get<User[]>('/users/employees'); return data; }
export async function createEmployee(payload: Required<EmployeePayload>): Promise<User> { const { data } = await apiClient.post<User>('/users/employees', payload); return data; }
export async function updateEmployee(id: number, payload: Omit<EmployeePayload, 'password'>): Promise<User> { const { data } = await apiClient.put<User>(`/users/employees/${id}`, payload); return data; }
export async function setEmployeeActive(id: number, active: boolean): Promise<User> { const { data } = await apiClient.patch<User>(`/users/employees/${id}/active?active=${active}`); return data; }
export async function changePassword(id: number, currentPassword: string, newPassword: string): Promise<void> { await apiClient.patch(`/users/${id}/password`, { currentPassword, newPassword }); }
