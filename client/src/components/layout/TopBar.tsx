import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../store/ui.store';
import { useAuth, useLogout } from '../../hooks/useAuth';
import BuildingSelector from './BuildingSelector';

export default function TopBar() {
  const { t } = useTranslation();
  const { locale, toggleLocale } = useUIStore();
  const { data: user } = useAuth();
  const logout = useLogout();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

      {/* Building selector */}
      <BuildingSelector />

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
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="w-9 h-9 rounded-full bg-primary-fixed flex items-center justify-center font-bold text-sm text-primary border border-outline-variant"
            >
              {initials}
            </button>
            {menuOpen && (
              <div className="absolute ltr:right-0 rtl:left-0 top-full mt-2 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg py-1 min-w-32 z-50">
                <button
                  onClick={() => { setMenuOpen(false); logout.mutate(); }}
                  className="w-full ltr:text-left rtl:text-right px-4 py-2 text-sm text-on-surface hover:bg-surface-container-low transition-colors"
                >
                  {t('auth.logout')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
