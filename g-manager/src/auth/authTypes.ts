export type Role = 'USER' | 'ADMIN';

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
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
