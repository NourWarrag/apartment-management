import { Navigate } from 'react-router-dom';
import { Role } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';

interface Props {
  allowedRoles: Role[];
  children: React.ReactNode;
}

export default function ProtectedRoute({ allowedRoles, children }: Props) {
  const { data: user, isLoading, isError } = useAuth();

  if (isLoading) return <div className="p-8 text-amber-700">Loading...</div>;
  if (isError || !user) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role as Role)) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
