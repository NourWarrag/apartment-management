import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Role } from '@hotel/shared';
import { useUsers, UserListItem } from '../../hooks/useUsers';
import { useDeactivateUser, useReactivateUser, useUpdateUserById } from '../../hooks/useUsersMutations';
import { useAuth } from '../../hooks/useAuth';
import UserFormModal from './UserFormModal';
import toast from 'react-hot-toast';

const ROLE_BADGE: Record<Role, string> = {
  [Role.SUPER_ADMIN]: 'bg-purple-100 text-purple-700',
  [Role.ADMIN]: 'bg-primary/10 text-primary',
  [Role.BUILDING_ADMIN]: 'bg-secondary/10 text-secondary',
  [Role.RECEPTIONIST]: 'bg-amber-100 text-amber-700',
  [Role.FINANCE]: 'bg-green-100 text-green-700',
  [Role.MAINTENANCE]: 'bg-orange-100 text-orange-700',
};

const STAFF_STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  ON_CALL: 'bg-amber-100 text-amber-700',
  OFF_DUTY: 'bg-surface-container text-on-surface-variant',
};

const STAFF_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  ON_CALL: 'On Call',
  OFF_DUTY: 'Off Duty',
};

type Tab = 'all' | 'staff';

export default function UsersPage() {
  const { t } = useTranslation();
  const { data: currentUser } = useAuth();
  const { data: users = [], isLoading } = useUsers();
  const deactivate = useDeactivateUser();
  const reactivate = useReactivateUser();
  const updateUser = useUpdateUserById();
  const [modalUser, setModalUser] = useState<UserListItem | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('all');
  const isAdmin = currentUser?.role === Role.ADMIN || currentUser?.role === Role.SUPER_ADMIN;

  const visibleUsers = tab === 'staff'
    ? users.filter(u => u.role === Role.MAINTENANCE)
    : users;

  if (isLoading) {
    return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>;
  }

  function handleStatusChange(userId: number, staffStatus: string) {
    updateUser.mutate(
      { id: userId, staffStatus },
      {
        onSuccess: () => toast.success('Status updated'),
        onError: () => toast.error('Failed to update status'),
      }
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-on-surface">Users</h1>
        <button
          onClick={() => setModalUser(null)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm hover:bg-primary/90 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Add User
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-surface-container rounded-xl p-1 w-fit">
        {(['all', 'staff'] as Tab[]).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === tabKey
                ? 'bg-surface text-on-surface shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tabKey === 'all' ? 'All Users' : 'Staff'}
          </button>
        ))}
      </div>

      <div className="bg-surface-container rounded-2xl overflow-hidden border border-outline-variant">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant">
              <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Name</th>
              <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Email</th>
              <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Role</th>
              <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Building</th>
              <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Status</th>
              <th className="text-right px-4 py-3 text-on-surface-variant font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((user) => {
              const isDeactivated = !!user.deletedAt;
              const isSelf = user.id === currentUser?.id;
              return (
                <tr
                  key={user.id}
                  className={`border-b border-outline-variant last:border-0 ${isDeactivated ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3 font-medium text-on-surface">{user.name}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_BADGE[user.role]}`}>
                      {user.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    {user.assignedBuilding ? `${user.assignedBuilding.name} (${user.assignedBuilding.code})` : '—'}
                  </td>
                  {tab === 'staff' ? (
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <select
                          value={user.staffStatus ?? 'OFF_DUTY'}
                          onChange={(e) => handleStatusChange(user.id, e.target.value)}
                          className="px-2 py-1 rounded-lg border border-outline-variant bg-surface text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="ACTIVE">Active</option>
                          <option value="ON_CALL">On Call</option>
                          <option value="OFF_DUTY">Off Duty</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STAFF_STATUS_BADGE[user.staffStatus ?? 'OFF_DUTY']}`}>
                          {STAFF_STATUS_LABEL[user.staffStatus ?? 'OFF_DUTY']}
                        </span>
                      )}
                    </td>
                  ) : (
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${isDeactivated ? 'text-error' : 'text-tertiary'}`}>
                        {isDeactivated ? 'Deactivated' : 'Active'}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-right space-x-2">
                    {!isDeactivated && (
                      <button
                        onClick={() => setModalUser(user)}
                        className="text-xs px-3 py-1 rounded-lg border border-outline hover:bg-surface-container-high transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    {isDeactivated ? (
                      <button
                        onClick={() => reactivate.mutate(user.id)}
                        className="text-xs px-3 py-1 rounded-lg bg-tertiary/10 text-tertiary hover:bg-tertiary/20 transition-colors"
                      >
                        Reactivate
                      </button>
                    ) : (
                      <button
                        disabled={isSelf}
                        title={isSelf ? 'Cannot deactivate your own account' : undefined}
                        onClick={() => !isSelf && deactivate.mutate(user.id)}
                        className="text-xs px-3 py-1 rounded-lg bg-error/10 text-error hover:bg-error/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {visibleUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-on-surface-variant">
                  {tab === 'staff' ? 'No maintenance staff found.' : 'No users found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalUser !== undefined && (
        <UserFormModal user={modalUser} onClose={() => setModalUser(undefined)} />
      )}
    </div>
  );
}
