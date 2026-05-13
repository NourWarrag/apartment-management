import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Role } from '@hotel/shared';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginPage from './pages/auth/LoginPage';
import ApartmentsPage from './pages/apartments/ApartmentsPage';
import ApartmentDetailPage from './pages/apartments/ApartmentDetailPage';
import TenantsPage from './pages/tenants/TenantsPage';
import TenantDetailPage from './pages/tenants/TenantDetailPage';
import DashboardPage from './pages/dashboard/DashboardPage';

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
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="apartments"
            element={
              <ProtectedRoute allowedRoles={ADMIN_RECEPTIONIST}>
                <ApartmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="apartments/:id"
            element={
              <ProtectedRoute allowedRoles={ADMIN_RECEPTIONIST}>
                <ApartmentDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="tenants"
            element={
              <ProtectedRoute allowedRoles={ADMIN_RECEPTIONIST}>
                <TenantsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="tenants/:id"
            element={
              <ProtectedRoute allowedRoles={ADMIN_RECEPTIONIST}>
                <TenantDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="payments/*"
            element={
              <ProtectedRoute allowedRoles={[Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE]}>
                <div className="text-on-surface font-semibold p-4">Payments — coming in Phase 3</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="tickets/*"
            element={
              <ProtectedRoute allowedRoles={TICKETS_ROLES}>
                <div className="text-on-surface font-semibold p-4">Tickets — coming in Phase 4</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="reports/*"
            element={
              <ProtectedRoute allowedRoles={ADMIN_FINANCE}>
                <div className="text-on-surface font-semibold p-4">Reports — coming in Phase 5</div>
              </ProtectedRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
