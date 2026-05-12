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
        <span className="material-symbols-outlined text-on-surface-variant text-[20px] mr-2">search</span>
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
        <div className="flex items-center gap-3 ml-1 pl-3 border-l border-outline-variant">
          <div className="text-right">
            <p className="text-sm font-semibold text-primary leading-tight">{user?.name ?? '...'}</p>
            <p className="text-[10px] text-on-surface-variant">{user?.role ?? ''}</p>
          </div>
          <div className="relative group">
            <button className="w-9 h-9 rounded-full bg-primary-fixed flex items-center justify-center font-bold text-sm text-primary border border-outline-variant">
              {initials}
            </button>
            <div className="hidden group-hover:block absolute right-0 top-full mt-2 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg py-1 min-w-32 z-50">
              <button
                onClick={() => logout.mutate()}
                className="w-full text-left px-4 py-2 text-sm text-on-surface hover:bg-surface-container-low transition-colors"
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
