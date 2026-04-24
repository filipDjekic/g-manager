export type Role = 'OWNER' | 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER';

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: boolean;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export type ApiErrorResponse = {
  status: number;
  message: string;
  timestamp: string;
};
