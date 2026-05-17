import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Role, FeatureFlag } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';

type NavLeaf = { to: string; icon: string; key: string; roles: Role[]; feature?: FeatureFlag };
type NavGroup = { groupKey: string; icon: string; roles: Role[]; feature?: FeatureFlag; children: NavLeaf[] };
type NavEntry = NavLeaf | NavGroup;

const isGroup = (e: NavEntry): e is NavGroup => 'children' in e;

const ACCT_FULL = [Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE];
const ACCT_ADMIN = [Role.SUPER_ADMIN, Role.ADMIN];

const NAV_ITEMS: NavEntry[] = [
  { to: '/dashboard', icon: 'dashboard', key: 'dashboard', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.FINANCE] },
  { to: '/apartments', icon: 'apartment', key: 'apartments', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST] },
  { to: '/bookings', icon: 'calendar_month', key: 'bookings', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST], feature: FeatureFlag.BOOKINGS },
  { to: '/tenants', icon: 'groups', key: 'tenants', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST] },
  { to: '/buildings', icon: 'business', key: 'buildings', roles: [Role.SUPER_ADMIN, Role.ADMIN], feature: FeatureFlag.MULTI_BUILDING },
  { to: '/payments', icon: 'payments', key: 'payments', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.FINANCE], feature: FeatureFlag.PAYMENTS },
  { to: '/tickets', icon: 'build', key: 'tickets', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.BUILDING_ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE], feature: FeatureFlag.TICKETS },
  { to: '/reports', icon: 'assessment', key: 'reports', roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE], feature: FeatureFlag.REPORTS },
  {
    groupKey: 'accounting',
    icon: 'account_balance',
    roles: ACCT_FULL,
    feature: FeatureFlag.ACCOUNTING,
    children: [
      { to: '/accounting/accounts', icon: 'account_tree', key: 'accountingAccounts', roles: ACCT_FULL },
      { to: '/accounting/journal-entries', icon: 'receipt_long', key: 'accountingJournal', roles: ACCT_FULL },
      { to: '/accounting/general-ledger', icon: 'menu_book', key: 'accountingGL', roles: ACCT_FULL },
      { to: '/accounting/trial-balance', icon: 'balance', key: 'accountingTB', roles: ACCT_FULL },
      { to: '/accounting/mapping', icon: 'settings_input_component', key: 'accountingMapping', roles: ACCT_FULL },
      { to: '/accounting/vat-return', icon: 'request_quote', key: 'accountingVAT', roles: ACCT_FULL },
      { to: '/accounting/income-statement', icon: 'trending_up', key: 'accountingIncome', roles: ACCT_FULL },
      { to: '/accounting/balance-sheet', icon: 'account_balance_wallet', key: 'accountingBalance', roles: ACCT_FULL },
      { to: '/accounting/cash-flow', icon: 'water_drop', key: 'accountingCashflow', roles: ACCT_FULL },
      { to: '/accounting/periods', icon: 'lock_clock', key: 'accountingPeriods', roles: ACCT_ADMIN },
      { to: '/accounting/banking', icon: 'savings', key: 'accountingBanking', roles: ACCT_FULL },
    ],
  },
  { to: '/users', icon: 'group', key: 'users', roles: [Role.SUPER_ADMIN, Role.ADMIN] },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
    isActive
      ? 'text-primary font-bold ltr:border-r-4 rtl:border-l-4 border-primary bg-secondary-container/30'
      : 'text-on-surface-variant hover:bg-surface-container-high'
  }`;

const subLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-200 ${
    isActive
      ? 'text-primary font-bold bg-secondary-container/30'
      : 'text-on-surface-variant hover:bg-surface-container-high'
  }`;

function GroupRow({ group }: { group: NavGroup }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { data: user } = useAuth();
  const { data: flags } = useFeatureFlags();

  const visibleChildren = group.children.filter((c) => {
    if (!user || !c.roles.includes(user.role as Role)) return false;
    if (c.feature && !flags?.[c.feature]) return false;
    return true;
  });

  const containsActive = visibleChildren.some((c) => location.pathname.startsWith(c.to));
  const [open, setOpen] = useState(containsActive);

  useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);

  if (visibleChildren.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
          containsActive
            ? 'text-primary font-bold'
            : 'text-on-surface-variant hover:bg-surface-container-high'
        }`}
      >
        <span className="material-symbols-outlined text-[22px]">{group.icon}</span>
        <span className="text-sm flex-1 ltr:text-left rtl:text-right">
          {t(`nav.${group.groupKey}`, group.groupKey.charAt(0).toUpperCase() + group.groupKey.slice(1))}
        </span>
        <span
          className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        >
          expand_more
        </span>
      </button>
      {open && (
        <div className="ltr:ml-5 rtl:mr-5 ltr:pl-3 rtl:pr-3 ltr:border-l rtl:border-r border-outline-variant mt-1 space-y-1">
          {visibleChildren.map((c) => (
            <NavLink key={c.to} to={c.to} className={subLinkClass}>
              <span className="material-symbols-outlined text-[18px]">{c.icon}</span>
              <span className="text-sm">
                {t(`nav.${c.key}`, c.key.charAt(0).toUpperCase() + c.key.slice(1))}
              </span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { t } = useTranslation();
  const { data: user } = useAuth();
  const { data: flags } = useFeatureFlags();

  const visibleEntries = NAV_ITEMS.filter((entry) => {
    if (!user || !entry.roles.includes(user.role as Role)) return false;
    if (entry.feature && !flags?.[entry.feature]) return false;
    return true;
  });

  return (
    <aside className="fixed h-full w-[280px] ltr:left-0 rtl:right-0 top-0 ltr:border-r rtl:border-l border-outline-variant bg-surface flex flex-col z-20">
      <div className="px-4 pt-6 pb-4 shrink-0">
        <div className="px-2 flex items-center gap-3">
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
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-4 space-y-1">
        {visibleEntries.map((entry) =>
          isGroup(entry) ? (
            <GroupRow key={entry.groupKey} group={entry} />
          ) : (
            <NavLink key={entry.to} to={entry.to} className={linkClass}>
              <span className="material-symbols-outlined text-[22px]">{entry.icon}</span>
              <span className="text-sm">
                {t(`nav.${entry.key}`, entry.key.charAt(0).toUpperCase() + entry.key.slice(1))}
              </span>
            </NavLink>
          ),
        )}
      </nav>

      <div className="shrink-0 px-4 pt-4 pb-6 border-t border-outline-variant">
        <NavLink to="/settings" className={linkClass}>
          <span className="material-symbols-outlined text-[20px]">settings</span>
          <span className="text-sm">{t('nav.settings', 'Settings')}</span>
        </NavLink>
      </div>
    </aside>
  );
}
