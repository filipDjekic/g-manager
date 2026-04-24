import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getToken } from '../auth/tokenStorage';

type ProtectedRouteProps = { redirectTo?: string };

export function ProtectedRoute({ redirectTo = '/login' }: ProtectedRouteProps) {
  const location = useLocation();
  const token = getToken();

  if (!token) return <Navigate to={redirectTo} replace state={{ from: location }} />;

  return <Outlet />;
}
