import { create } from 'zustand';
import { setLanguage } from '../i18n';

interface UIStore {
  locale: 'en' | 'ar';
  sidebarExpanded: boolean;
  toggleLocale: () => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  locale: 'en',
  sidebarExpanded: false,
  toggleLocale: () => {
    const next = get().locale === 'en' ? 'ar' : 'en';
    setLanguage(next);
    set({ locale: next });
  },
  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
}));
