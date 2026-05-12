import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Role } from '@hotel/shared';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginPage from './pages/auth/LoginPage';

const ALL_STAFF = [Role.ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE, Role.FINANCE];
const ADMIN_RECEPTIONIST = [Role.ADMIN, Role.RECEPTIONIST];
const ADMIN_FINANCE = [Role.ADMIN, Role.FINANCE];
const TICKETS_ROLES = [Role.ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE];

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute allowedRoles={ALL_STAFF}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            path="dashboard"
            element={
              <ProtectedRoute allowedRoles={[Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE]}>
                <div className="text-amber-900 font-semibold">Dashboard — coming in Phase 5</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="apartments/*"
            element={
              <ProtectedRoute allowedRoles={ADMIN_RECEPTIONIST}>
                <div className="text-amber-900 font-semibold">Apartments — coming in Phase 2</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="tenants/*"
            element={
              <ProtectedRoute allowedRoles={ADMIN_RECEPTIONIST}>
                <div className="text-amber-900 font-semibold">Tenants — coming in Phase 2</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="payments/*"
            element={
              <ProtectedRoute allowedRoles={[Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE]}>
                <div className="text-amber-900 font-semibold">Payments — coming in Phase 3</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="tickets/*"
            element={
              <ProtectedRoute allowedRoles={TICKETS_ROLES}>
                <div className="text-amber-900 font-semibold">Tickets — coming in Phase 4</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="reports/*"
            element={
              <ProtectedRoute allowedRoles={ADMIN_FINANCE}>
                <div className="text-amber-900 font-semibold">Reports — coming in Phase 5</div>
              </ProtectedRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
