import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Role } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';

const NAV_ITEMS = [
  { to: '/dashboard', icon: 'dashboard', key: 'dashboard', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.FINANCE] },
  { to: '/apartments', icon: 'apartment', key: 'apartments', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST] },
  { to: '/bookings', icon: 'calendar_month', key: 'bookings', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST] },
  { to: '/tenants', icon: 'groups', key: 'tenants', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST] },
  { to: '/buildings', icon: 'business', key: 'buildings', roles: [Role.SUPER_ADMIN, Role.ADMIN] },
  { to: '/payments', icon: 'payments', key: 'payments', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.FINANCE] },
  { to: '/tickets', icon: 'build', key: 'tickets', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE] },
  { to: '/reports', icon: 'assessment', key: 'reports', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE] },
  { to: '/users', icon: 'group', key: 'users', roles: [Role.SUPER_ADMIN, Role.ADMIN] },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
    isActive
      ? 'text-primary font-bold ltr:border-r-4 rtl:border-l-4 border-primary bg-secondary-container/30'
      : 'text-on-surface-variant hover:bg-surface-container-high'
  }`;

export default function Sidebar() {
  const { t } = useTranslation();
  const { data: user } = useAuth();

  const visibleItems = NAV_ITEMS.filter(
    (item) => user && item.roles.includes(user.role as Role)
  );

  return (
    <aside className="fixed h-full w-[280px] ltr:left-0 rtl:right-0 top-0 ltr:border-r rtl:border-l border-outline-variant bg-surface flex flex-col py-6 px-4 z-20">
      {/* Logo */}
      <div className="mb-10 px-2 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary flex items-center justify-center rounded-lg shrink-0">
          <span className="material-symbols-outlined text-on-primary text-xl">apartment</span>
        </div>
        <div>
          <h1 className="text-base font-bold text-primary leading-tight">LuxStay Admin</h1>
          <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
            {t('brand.subtitle', 'Property Management')}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        {visibleItems.map(({ to, icon, key }) => (
          <NavLink key={to} to={to} className={navLinkClass}>
            <span className="material-symbols-outlined text-[22px]">{icon}</span>
            <span className="text-sm">{t(`nav.${key}`, key.charAt(0).toUpperCase() + key.slice(1))}</span>
          </NavLink>
        ))}
      </nav>

      {/* Settings link — all roles */}
      <div className="pt-6 border-t border-outline-variant space-y-1">
        <NavLink to="/settings" className={navLinkClass}>
          <span className="material-symbols-outlined text-[20px]">settings</span>
          <span className="text-sm">{t('nav.settings', 'Settings')}</span>
        </NavLink>
      </div>
    </aside>
  );
}
