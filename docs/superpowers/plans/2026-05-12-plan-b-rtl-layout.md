# Plan B: RTL Layout Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the sidebar, main content offset, and TopBar to flip correctly when the app is in Arabic (RTL) mode.

**Architecture:** Tailwind v3 ships `rtl:` and `ltr:` variants out of the box — no config changes required. The app toggles RTL via `document.documentElement.dir` (managed by react-i18next / the UI store). Every `left-*`, `right-*`, `ml-*`, `mr-*`, `border-r-*`, `border-l-*`, and `text-right`/`text-left` that is directional must get an `ltr:` prefix and a mirrored `rtl:` counterpart.

**Tech Stack:** React + Tailwind CSS v3, react-i18next RTL toggle, `dir` attribute on `<html>`

---

## Context

- Layout files are in `client/src/components/layout/`
- The `<html dir="rtl">` attribute is set by the i18n store when Arabic is active
- Tailwind's `rtl:` variant applies when the closest ancestor has `dir="rtl"`
- This plan is fully independent of Plan A and Plan C — it can run in any order

---

## Task 1: Fix AppLayout.tsx

**Files:**
- Modify: `client/src/components/layout/AppLayout.tsx`

Current file (`client/src/components/layout/AppLayout.tsx`):
```tsx
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import Sidebar from './Sidebar';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ml-[280px] flex flex-col min-h-screen">
        <TopBar />
        <main className="flex-1 p-container-padding">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 1: Replace AppLayout.tsx with RTL-aware version**

```tsx
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import Sidebar from './Sidebar';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ltr:ml-[280px] rtl:mr-[280px] flex flex-col min-h-screen">
        <TopBar />
        <main className="flex-1 p-container-padding">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/layout/AppLayout.tsx
git commit -m "fix: RTL-aware main content offset in AppLayout"
```

---

## Task 2: Fix Sidebar.tsx

**Files:**
- Modify: `client/src/components/layout/Sidebar.tsx`

Current file:
```tsx
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Role } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';

const NAV_ITEMS = [
  { to: '/dashboard', icon: 'dashboard', key: 'dashboard', roles: [Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE] },
  { to: '/apartments', icon: 'apartment', key: 'apartments', roles: [Role.ADMIN, Role.RECEPTIONIST] },
  { to: '/tenants', icon: 'groups', key: 'tenants', roles: [Role.ADMIN, Role.RECEPTIONIST] },
  { to: '/payments', icon: 'payments', key: 'payments', roles: [Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE] },
  { to: '/tickets', icon: 'build', key: 'tickets', roles: [Role.ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE] },
  { to: '/reports', icon: 'assessment', key: 'reports', roles: [Role.ADMIN, Role.FINANCE] },
];

export default function Sidebar() {
  const { t } = useTranslation();
  const { data: user } = useAuth();

  const visibleItems = NAV_ITEMS.filter(
    (item) => user && item.roles.includes(user.role as Role)
  );

  return (
    <aside className="fixed h-full w-[280px] left-0 top-0 border-r border-outline-variant bg-surface flex flex-col py-6 px-4 z-20">
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
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
                isActive
                  ? 'text-primary font-bold border-r-4 border-primary bg-secondary-container/30'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`
            }
          >
            <span className="material-symbols-outlined text-[22px]">{icon}</span>
            <span className="text-sm">{t(`nav.${key}`)}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom links */}
      <div className="pt-6 border-t border-outline-variant space-y-1">
        <a className="flex items-center gap-3 px-4 py-2 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors duration-200" href="#">
          <span className="material-symbols-outlined text-[20px]">settings</span>
          <span className="text-sm">{t('nav.settings', 'Settings')}</span>
        </a>
      </div>
    </aside>
  );
}
```

- [ ] **Step 1: Replace Sidebar.tsx with RTL-aware version**

Three changes needed:
1. `fixed ... left-0` → `ltr:left-0 rtl:right-0`
2. `border-r` → `ltr:border-r rtl:border-l`
3. Active state `border-r-4` → `ltr:border-r-4 rtl:border-l-4`

```tsx
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Role } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';

const NAV_ITEMS = [
  { to: '/dashboard', icon: 'dashboard', key: 'dashboard', roles: [Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE] },
  { to: '/apartments', icon: 'apartment', key: 'apartments', roles: [Role.ADMIN, Role.RECEPTIONIST] },
  { to: '/tenants', icon: 'groups', key: 'tenants', roles: [Role.ADMIN, Role.RECEPTIONIST] },
  { to: '/payments', icon: 'payments', key: 'payments', roles: [Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE] },
  { to: '/tickets', icon: 'build', key: 'tickets', roles: [Role.ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE] },
  { to: '/reports', icon: 'assessment', key: 'reports', roles: [Role.ADMIN, Role.FINANCE] },
];

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
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
                isActive
                  ? 'text-primary font-bold ltr:border-r-4 rtl:border-l-4 border-primary bg-secondary-container/30'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`
            }
          >
            <span className="material-symbols-outlined text-[22px]">{icon}</span>
            <span className="text-sm">{t(`nav.${key}`)}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom links */}
      <div className="pt-6 border-t border-outline-variant space-y-1">
        <a className="flex items-center gap-3 px-4 py-2 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors duration-200" href="#">
          <span className="material-symbols-outlined text-[20px]">settings</span>
          <span className="text-sm">{t('nav.settings', 'Settings')}</span>
        </a>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/layout/Sidebar.tsx
git commit -m "fix: RTL-aware sidebar positioning and active indicator"
```

---

## Task 3: Fix TopBar.tsx

**Files:**
- Modify: `client/src/components/layout/TopBar.tsx`

Current file has two directional issues:
1. `text-right` on the user name/role div — should flip in RTL
2. `ml-1 pl-3 border-l` on the avatar separator — should flip in RTL (`mr-1 pr-3 border-r`)
3. The dropdown `right-0` (absolute positioned) — should flip in RTL

- [ ] **Step 1: Replace TopBar.tsx with RTL-aware version**

```tsx
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/ui.store';
import { useAuth, useLogout } from '../../hooks/useAuth';

export default function TopBar() {
  const { t } = useTranslation();
  const { locale, toggleLocale } = useUIStore();
  const { data: user } = useAuth();
  const logout = useLogout();

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  return (
    <header className="flex justify-between items-center h-16 px-8 bg-surface border-b border-outline-variant sticky top-0 z-10">
      {/* Search */}
      <div className="flex items-center bg-surface-container-low px-4 py-1.5 rounded-full border border-outline-variant w-80">
        <span className="material-symbols-outlined text-on-surface-variant text-[20px] ltr:mr-2 rtl:ml-2">search</span>
        <input
          className="bg-transparent border-none outline-none text-sm w-full placeholder-on-surface-variant/60 text-on-surface"
          placeholder={t('common.search')}
          type="text"
        />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Language toggle */}
        <button
          onClick={toggleLocale}
          className="text-on-surface-variant text-xs border border-outline-variant rounded-full px-3 py-1.5 font-semibold hover:bg-surface-container transition-colors"
        >
          {locale === 'en' ? 'EN | عر' : 'عر | EN'}
        </button>

        {/* Notifications */}
        <button className="hover:bg-surface-container-low rounded-full p-2 transition-colors duration-200">
          <span className="material-symbols-outlined text-on-surface-variant text-[22px]">notifications</span>
        </button>

        {/* User menu */}
        <div className="flex items-center gap-3 ltr:ml-1 rtl:mr-1 ltr:pl-3 rtl:pr-3 ltr:border-l rtl:border-r border-outline-variant">
          <div className="ltr:text-right rtl:text-left">
            <p className="text-sm font-semibold text-primary leading-tight">{user?.name ?? '...'}</p>
            <p className="text-[10px] text-on-surface-variant">{user?.role ?? ''}</p>
          </div>
          <div className="relative group">
            <button className="w-9 h-9 rounded-full bg-primary-fixed flex items-center justify-center font-bold text-sm text-primary border border-outline-variant">
              {initials}
            </button>
            <div className="hidden group-hover:block absolute ltr:right-0 rtl:left-0 top-full mt-2 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg py-1 min-w-32 z-50">
              <button
                onClick={() => logout.mutate()}
                className="w-full ltr:text-left rtl:text-right px-4 py-2 text-sm text-on-surface hover:bg-surface-container-low transition-colors"
              >
                {t('auth.logout')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify the client builds without TypeScript errors**

```bash
cd client
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/layout/TopBar.tsx
git commit -m "fix: RTL-aware TopBar user menu alignment and separator"
```

---

## Manual Verification Checklist

After committing, start the dev server and toggle to Arabic to verify:

```bash
cd client
npm run dev
```

Open the app, click the language toggle (EN | عر) to switch to Arabic, then check:

- [ ] Sidebar appears on the **right** side of the screen
- [ ] Sidebar has border on its **left** edge (not right)
- [ ] Active nav item has indicator bar on its **left** edge (not right)
- [ ] Main content is offset from the **right** (not left)
- [ ] TopBar user section: name/role text is **left-aligned**
- [ ] TopBar separator is on the **right** of the user block
- [ ] Dropdown menu opens from the **left** corner of the avatar button
- [ ] Toggle back to English and verify LTR layout is restored correctly
