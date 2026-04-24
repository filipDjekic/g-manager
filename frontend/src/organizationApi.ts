import { apiClient } from './api/apiClient';

export type Organization = {
  id: number;
  name: string;
  address: string;
  phone: string;
  ownerId: number;
  ownerName: string;
  createdAt?: string;
  updatedAt?: string;
};

export type OrganizationPayload = { name: string; address: string; phone: string };

export async function getMyOrganization(): Promise<Organization> {
  const { data } = await apiClient.get<Organization>('/organizations/me');
  return data;
}

export async function createOrganization(payload: OrganizationPayload): Promise<Organization> {
  const { data } = await apiClient.post<Organization>('/organizations', payload);
  return data;
}

export async function updateMyOrganization(payload: OrganizationPayload): Promise<Organization> {
  const { data } = await apiClient.put<Organization>('/organizations/me', payload);
  return data;
}
