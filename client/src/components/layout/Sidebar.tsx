import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Building2, Users, CreditCard, Wrench, BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/ui.store';
import { Role } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, key: 'dashboard', roles: [Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE] },
  { to: '/apartments', icon: Building2, key: 'apartments', roles: [Role.ADMIN, Role.RECEPTIONIST] },
  { to: '/tenants', icon: Users, key: 'tenants', roles: [Role.ADMIN, Role.RECEPTIONIST] },
  { to: '/payments', icon: CreditCard, key: 'payments', roles: [Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE] },
  { to: '/tickets', icon: Wrench, key: 'tickets', roles: [Role.ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE] },
  { to: '/reports', icon: BarChart3, key: 'reports', roles: [Role.ADMIN, Role.FINANCE] },
];

export default function Sidebar() {
  const { t } = useTranslation();
  const { sidebarExpanded } = useUIStore();
  const { data: user } = useAuth();

  const visibleItems = NAV_ITEMS.filter(
    (item) => user && item.roles.includes(user.role as Role)
  );

  return (
    <nav
      className={`bg-[#78350f] flex flex-col items-center py-3 gap-1 shrink-0 transition-all duration-200 ${
        sidebarExpanded ? 'w-44' : 'w-[52px]'
      }`}
    >
      {visibleItems.map(({ to, icon: Icon, key }) => (
        <NavLink
          key={to}
          to={to}
          title={t(`nav.${key}`)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-2 py-2 ${sidebarExpanded ? 'w-36' : 'w-[38px]'} transition-colors ${
              isActive ? 'bg-white/22' : 'hover:bg-white/10'
            }`
          }
        >
          <Icon size={16} className="text-white shrink-0" />
          {sidebarExpanded && (
            <span className="text-white text-xs font-medium truncate">{t(`nav.${key}`)}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
