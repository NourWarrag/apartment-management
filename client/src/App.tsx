import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Role, FeatureFlag } from '@hotel/shared';
import { useFeatureFlags } from './hooks/useFeatureFlags';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginPage from './pages/auth/LoginPage';
import BookingsPage from './pages/bookings/BookingsPage';
import ApartmentsPage from './pages/apartments/ApartmentsPage';
import ApartmentDetailPage from './pages/apartments/ApartmentDetailPage';
import TenantsPage from './pages/tenants/TenantsPage';
import TenantDetailPage from './pages/tenants/TenantDetailPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import PaymentsPage from './pages/payments/PaymentsPage';
import TicketsPage from './pages/tickets/TicketsPage';
import BuildingsPage from './pages/buildings/BuildingsPage';
import ReportsPage from './pages/reports/ReportsPage';
import UsersPage from './pages/users/UsersPage';
import SettingsPage from './pages/settings/SettingsPage';

const ALL_STAFF = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.BUILDING_ADMIN,
  Role.RECEPTIONIST,
  Role.MAINTENANCE,
  Role.FINANCE,
];
const ADMIN_ONLY = [Role.SUPER_ADMIN, Role.ADMIN];
const ADMIN_RECEPTIONIST = [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST];
const ADMIN_FINANCE = [Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE];
const TICKETS_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE];

export default function App() {
  const { data: flags, isLoading } = useFeatureFlags();
  if (isLoading) return null;
  const f = flags ?? ({} as Record<FeatureFlag, boolean>);

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
          {f[FeatureFlag.BOOKINGS] && (
            <Route
              path="bookings"
              element={
                <ProtectedRoute allowedRoles={ADMIN_RECEPTIONIST}>
                  <BookingsPage />
                </ProtectedRoute>
              }
            />
          )}
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
          {f[FeatureFlag.PAYMENTS] && (
            <Route
              path="payments"
              element={
                <ProtectedRoute allowedRoles={[Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE]}>
                  <PaymentsPage />
                </ProtectedRoute>
              }
            />
          )}
          {f[FeatureFlag.TICKETS] && (
            <Route
              path="tickets"
              element={
                <ProtectedRoute allowedRoles={TICKETS_ROLES}>
                  <TicketsPage />
                </ProtectedRoute>
              }
            />
          )}
          {f[FeatureFlag.MULTI_BUILDING] && (
            <Route
              path="buildings"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ONLY}>
                  <BuildingsPage />
                </ProtectedRoute>
              }
            />
          )}
          {f[FeatureFlag.REPORTS] && (
            <Route
              path="reports"
              element={
                <ProtectedRoute allowedRoles={ADMIN_FINANCE}>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />
          )}
          <Route
            path="users"
            element={
              <ProtectedRoute allowedRoles={ADMIN_ONLY}>
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="settings"
            element={
              <ProtectedRoute allowedRoles={ALL_STAFF}>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
