import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import ClinicLogin from './pages/clinic-login/ClinicLogin';
import ClinicPanel from './pages/clinic-panel/ClinicPanel';
import AdminApp from './pages/admin/AdminApp';

function Protected({ children, requireAdmin = false }) {
  const { session, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!session) {
    return <Navigate to="/" replace />;
  }

  if (requireAdmin && session.papel !== 'admin') {
    return <Navigate to="/panel" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ClinicLogin />} />
      <Route
        path="panel"
        element={
          <Protected>
            <ClinicPanel />
          </Protected>
        }
      />
      <Route
        path="admin"
        element={
          <Protected requireAdmin>
            <AdminApp />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
