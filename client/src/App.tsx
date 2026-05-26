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
import AccountsPage from './pages/accounting/AccountsPage';
import JournalEntriesPage from './pages/accounting/JournalEntriesPage';
import JournalEntryEditorPage from './pages/accounting/JournalEntryEditorPage';
import GeneralLedgerPage from './pages/accounting/GeneralLedgerPage';
import TrialBalancePage from './pages/accounting/TrialBalancePage';
import AccountMappingPage from './pages/accounting/AccountMappingPage';
import VatReturnPage from './pages/accounting/VatReturnPage';
import IncomeStatementPage from './pages/accounting/IncomeStatementPage';
import BalanceSheetPage from './pages/accounting/BalanceSheetPage';
import CashFlowPage from './pages/accounting/CashFlowPage';
import FiscalPeriodsPage from './pages/accounting/FiscalPeriodsPage';
import BankingPage from './pages/accounting/BankingPage';
import BankAccountDetailPage from './pages/accounting/BankAccountDetailPage';
import ReconciliationPage from './pages/accounting/ReconciliationPage';
import UsersPage from './pages/users/UsersPage';
import SettingsPage from './pages/settings/SettingsPage';
import BrokersPage from './pages/brokers/BrokersPage';
import BrokerDetailPage from './pages/brokers/BrokerDetailPage';

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
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

function AppRoutes() {
  const { data: flags } = useFeatureFlags();
  const f = flags ?? ({} as Partial<Record<FeatureFlag, boolean>>);

  return (
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
        <Route
          path="brokers"
          element={
            <ProtectedRoute allowedRoles={ADMIN_RECEPTIONIST}>
              <BrokersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="brokers/:id"
          element={
            <ProtectedRoute allowedRoles={ADMIN_RECEPTIONIST}>
              <BrokerDetailPage />
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
        {f[FeatureFlag.ACCOUNTING] && (
          <>
            <Route
              path="accounting/accounts"
              element={
                <ProtectedRoute allowedRoles={ADMIN_FINANCE}>
                  <AccountsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="accounting/journal-entries"
              element={
                <ProtectedRoute allowedRoles={ADMIN_FINANCE}>
                  <JournalEntriesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="accounting/journal-entries/new"
              element={
                <ProtectedRoute allowedRoles={ADMIN_FINANCE}>
                  <JournalEntryEditorPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="accounting/journal-entries/:id"
              element={
                <ProtectedRoute allowedRoles={ADMIN_FINANCE}>
                  <JournalEntryEditorPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="accounting/journal-entries/:id/edit"
              element={
                <ProtectedRoute allowedRoles={ADMIN_FINANCE}>
                  <JournalEntryEditorPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="accounting/general-ledger"
              element={
                <ProtectedRoute allowedRoles={ADMIN_FINANCE}>
                  <GeneralLedgerPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="accounting/trial-balance"
              element={
                <ProtectedRoute allowedRoles={ADMIN_FINANCE}>
                  <TrialBalancePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="accounting/mapping"
              element={
                <ProtectedRoute allowedRoles={ADMIN_FINANCE}>
                  <AccountMappingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="accounting/vat-return"
              element={
                <ProtectedRoute allowedRoles={ADMIN_FINANCE}>
                  <VatReturnPage />
                </ProtectedRoute>
              }
            />
            <Route path="accounting/income-statement" element={<ProtectedRoute allowedRoles={ADMIN_FINANCE}><IncomeStatementPage /></ProtectedRoute>} />
            <Route path="accounting/balance-sheet" element={<ProtectedRoute allowedRoles={ADMIN_FINANCE}><BalanceSheetPage /></ProtectedRoute>} />
            <Route path="accounting/cash-flow" element={<ProtectedRoute allowedRoles={ADMIN_FINANCE}><CashFlowPage /></ProtectedRoute>} />
            <Route path="accounting/periods" element={<ProtectedRoute allowedRoles={ADMIN_ONLY}><FiscalPeriodsPage /></ProtectedRoute>} />
            <Route path="accounting/banking" element={<ProtectedRoute allowedRoles={ADMIN_FINANCE}><BankingPage /></ProtectedRoute>} />
            <Route path="accounting/banking/:id" element={<ProtectedRoute allowedRoles={ADMIN_FINANCE}><BankAccountDetailPage /></ProtectedRoute>} />
            <Route path="accounting/banking/reconciliations/:id" element={<ProtectedRoute allowedRoles={ADMIN_FINANCE}><ReconciliationPage /></ProtectedRoute>} />
          </>
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
  );
}
