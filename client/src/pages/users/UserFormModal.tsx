import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Role } from '@hotel/shared';
import { UserListItem } from '../../hooks/useUsers';
import { useCreateUser, useUpdateUser, CreateUserDto, UpdateUserDto } from '../../hooks/useUsersMutations';
import { useAuth } from '../../hooks/useAuth';
import { useBuildings } from '../../hooks/useBuildings';

interface Props {
  user?: UserListItem | null;
  onClose: () => void;
}

const ROLE_OPTIONS_SUPER_ADMIN: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.BUILDING_ADMIN,
  Role.RECEPTIONIST,
  Role.MAINTENANCE,
  Role.FINANCE,
];

const ROLE_OPTIONS_ADMIN: Role[] = [
  Role.BUILDING_ADMIN,
  Role.RECEPTIONIST,
  Role.MAINTENANCE,
  Role.FINANCE,
];

export default function UserFormModal({ user, onClose }: Props) {
  const { t } = useTranslation();
  const { data: currentUser } = useAuth();
  const { data: buildings = [] } = useBuildings();
  const isEdit = !!user;

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(user?.role ?? Role.RECEPTIONIST);
  const [assignedBuildingId, setAssignedBuildingId] = useState<number | ''>(
    user?.assignedBuildingId ?? ''
  );
  const [error, setError] = useState('');

  const createUser = useCreateUser();
  const updateUser = useUpdateUser(user?.id ?? 0);

  const roleOptions =
    currentUser?.role === Role.SUPER_ADMIN ? ROLE_OPTIONS_SUPER_ADMIN : ROLE_OPTIONS_ADMIN;

  useEffect(() => {
    if (role !== Role.BUILDING_ADMIN) setAssignedBuildingId('');
  }, [role]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (isEdit) {
        const dto: UpdateUserDto = { name, email, role };
        if (role === Role.BUILDING_ADMIN) dto.assignedBuildingId = Number(assignedBuildingId) || null;
        else dto.assignedBuildingId = null;
        await updateUser.mutateAsync(dto);
      } else {
        const dto: CreateUserDto = {
          name,
          email,
          password,
          role,
          assignedBuildingId: role === Role.BUILDING_ADMIN ? (Number(assignedBuildingId) || null) : null,
        };
        await createUser.mutateAsync(dto);
      }
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Something went wrong');
    }
  }

  const isPending = createUser.isPending || updateUser.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-on-surface mb-4">
          {isEdit ? 'Edit User' : 'Add User'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-on-surface-variant">Name</label>
            <input
              className="w-full mt-1 px-3 py-2 rounded-lg border border-outline bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm text-on-surface-variant">Email</label>
            <input
              type="email"
              className="w-full mt-1 px-3 py-2 rounded-lg border border-outline bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {!isEdit && (
            <div>
              <label className="text-sm text-on-surface-variant">Password</label>
              <input
                type="password"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-outline bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
          )}
          <div>
            <label className="text-sm text-on-surface-variant">Role</label>
            <select
              className="w-full mt-1 px-3 py-2 rounded-lg border border-outline bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>{r.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          {role === Role.BUILDING_ADMIN && (
            <div>
              <label className="text-sm text-on-surface-variant">Building</label>
              <select
                className="w-full mt-1 px-3 py-2 rounded-lg border border-outline bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={assignedBuildingId}
                onChange={(e) => setAssignedBuildingId(Number(e.target.value))}
                required
              >
                <option value="">Select building…</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="text-error text-sm">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-lg text-sm bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
