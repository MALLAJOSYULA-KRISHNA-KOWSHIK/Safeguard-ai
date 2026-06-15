import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

interface Props {
  children: JSX.Element;
  allowedRoles?: ('admin' | 'supervisor' | 'manager' | 'worker')[];
}

const ProtectedRoute = ({ children, allowedRoles }: Props) => {
  const { isAuthenticated, role } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    if (role === 'worker') return <Navigate to="/kiosk" replace />;
    if (role === 'manager') return <Navigate to="/manager" replace />;
    if (role === 'supervisor') return <Navigate to="/supervisor" replace />;
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;