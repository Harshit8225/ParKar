import { Navigate, useLocation } from 'react-router-dom';
import { homeRouteFor, useAuth } from '../context/AuthContext';
import { Spinner } from './ui';

/**
 * Gate a route on authentication and, optionally, on role. A signed-in user who
 * lands on a panel meant for another role is sent to their own home rather than
 * shown an error - the nav is role-specific, so this only happens via a stale
 * bookmark or a typed URL.
 */
const ProtectedRoute = ({ roles, children }) => {
  const { isAuthenticated, loading, role } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Checking your session..." />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(role)) {
    return <Navigate to={homeRouteFor(role)} replace />;
  }

  return children;
};

export default ProtectedRoute;
