import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/ui.store';
import { useAuth, useLogout } from '../../hooks/useAuth';

export default function TopBar() {
  const { t } = useTranslation();
  const { locale, toggleLocale } = useUIStore();
  const { data: user } = useAuth();
  const logout = useLogout();

  return (
    <header className="h-12 bg-[#92400e] flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-white font-bold text-sm">Hotel Apartments</span>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={toggleLocale}
          className="text-white text-xs bg-white/15 rounded-full px-3 py-1 font-semibold tracking-wide hover:bg-white/25 transition"
        >
          {locale === 'en' ? 'EN | عر' : 'عر | EN'}
        </button>
        <Bell size={16} className="text-white/80 cursor-pointer hover:text-white" />
        <div className="relative group">
          <button className="flex items-center gap-2 bg-white/15 rounded-full px-3 py-1 text-white text-xs hover:bg-white/25 transition">
            <span>{user?.name ?? '...'}</span>
          </button>
          <div className="hidden group-hover:block absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg py-1 min-w-28 z-50">
            <button
              onClick={() => logout.mutate()}
              className="w-full text-left px-4 py-2 text-sm text-amber-900 hover:bg-amber-50"
            >
              {t('auth.logout')}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
