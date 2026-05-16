import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Role, FeatureFlag } from '@hotel/shared';
import { useAuth } from '../../hooks/useAuth';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { useSettings, useUpdateSettings, SystemSettings } from '../../hooks/useSettings';

type BooksMode = 'CONSOLIDATED' | 'PER_BUILDING';

type EditableField = keyof Omit<SystemSettings, 'id'>;

const CURRENCY_OPTIONS = ['AED', 'USD', 'EUR', 'GBP'];
const TIMEZONE_OPTIONS = [
  'Asia/Dubai',
  'Asia/Riyadh',
  'Africa/Cairo',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Kolkata',
  'Asia/Singapore',
];

const FIELD_LABELS: Record<EditableField, string> = {
  companyName: 'Company Name',
  currency: 'Currency',
  timezone: 'Timezone',
  phone: 'Phone',
  email: 'Email',
  address: 'Address',
};

interface InlineFieldProps {
  field: EditableField;
  value: string;
  canEdit: boolean;
  onSave: (field: EditableField, value: string) => Promise<void>;
}

function InlineField({ field, value, canEdit, onSave }: InlineFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const isSelect = field === 'currency' || field === 'timezone';
  const options = field === 'currency' ? CURRENCY_OPTIONS : TIMEZONE_OPTIONS;

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      await onSave(field, draft);
      setEditing(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setSaveError(msg ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between py-3 border-b border-outline-variant last:border-0 group">
      <div className="flex-1">
        <p className="text-xs text-on-surface-variant mb-0.5">{FIELD_LABELS[field]}</p>
        {editing ? (
          <div>
            {isSelect ? (
              <select
                className="text-sm px-2 py-1 rounded border border-outline bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
              >
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                className="text-sm px-2 py-1 rounded border border-outline bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary w-full max-w-xs"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
              />
            )}
            {saveError && <p className="text-error text-xs mt-1">{saveError}</p>}
          </div>
        ) : (
          <p className="text-sm text-on-surface">{value || '—'}</p>
        )}
      </div>
      {canEdit && (
        <div className="flex gap-2 ml-4 shrink-0">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-xs px-3 py-1 rounded-lg bg-primary text-on-primary hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setDraft(value); }}
                className="text-xs px-3 py-1 rounded-lg border border-outline text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => { setDraft(value); setEditing(true); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-variant hover:text-primary"
              title="Edit"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { data: currentUser } = useAuth();
  const { data: flags } = useFeatureFlags();
  const { data: settings, isLoading, isError } = useSettings();
  const updateSettings = useUpdateSettings();

  const [booksMode, setBooksMode] = useState<BooksMode>('CONSOLIDATED');

  useEffect(() => {
    if (settings) {
      const raw = (settings as SystemSettings & { booksMode?: BooksMode }).booksMode;
      setBooksMode(raw ?? 'CONSOLIDATED');
    }
  }, [settings]);

  const canEdit = currentUser?.role === Role.ADMIN || currentUser?.role === Role.SUPER_ADMIN;

  async function handleSave(field: EditableField, value: string) {
    await updateSettings.mutateAsync({ [field]: value });
  }

  async function handleBooksModeChange(value: BooksMode) {
    setBooksMode(value);
    if (canEdit) {
      await updateSettings.mutateAsync({ booksMode: value } as Parameters<typeof updateSettings.mutateAsync>[0]);
    }
  }

  function toggleLanguage() {
    const next = i18n.language === 'ar' ? 'en' : 'ar';
    i18n.changeLanguage(next);
    localStorage.setItem('language', next);
  }

  if (isLoading) return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>;
  if (isError) return <div className="p-8 text-error">Failed to load settings.</div>;
  if (!settings) return null;

  const fields: EditableField[] = ['companyName', 'currency', 'timezone', 'phone', 'email', 'address'];

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-on-surface">Settings</h1>

      {/* System Settings */}
      <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant">
        <h2 className="text-base font-semibold text-on-surface mb-4">System Settings</h2>
        {!canEdit && (
          <p className="text-xs text-on-surface-variant mb-4">
            Read-only. Contact your admin to make changes.
          </p>
        )}
        {fields.map((field) => (
          <InlineField
            key={field}
            field={field}
            value={settings[field]}
            canEdit={canEdit}
            onSave={handleSave}
          />
        ))}
      </div>

      {/* Accounting */}
      {flags?.[FeatureFlag.ACCOUNTING] && (
      <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant">
        <fieldset className="mt-0 border-t-0">
          <legend className="text-base font-bold mb-2">{t('settings.accounting.title', 'Accounting')}</legend>
          <p className="text-sm text-on-surface-variant mb-3">
            {t('settings.accounting.booksModeHelp', 'Switching modes never changes the underlying data — only how reports group and which filters appear.')}
          </p>
          <label className="block text-sm mb-1">
            <input
              type="radio"
              name="booksMode"
              value="CONSOLIDATED"
              checked={booksMode === 'CONSOLIDATED'}
              onChange={() => handleBooksModeChange('CONSOLIDATED')}
              disabled={!canEdit}
              className="ltr:mr-2 rtl:ml-2"
            />
            {t('settings.accounting.consolidated', 'Consolidated (single set of books)')}
          </label>
          <label className="block text-sm">
            <input
              type="radio"
              name="booksMode"
              value="PER_BUILDING"
              checked={booksMode === 'PER_BUILDING'}
              onChange={() => handleBooksModeChange('PER_BUILDING')}
              disabled={!canEdit}
              className="ltr:mr-2 rtl:ml-2"
            />
            {t('settings.accounting.perBuilding', 'Per-building (separate books with consolidation view)')}
          </label>
        </fieldset>
      </div>
      )}

      {/* User Preferences */}
      <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant">
        <h2 className="text-base font-semibold text-on-surface mb-4">Preferences</h2>
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-xs text-on-surface-variant mb-0.5">Language</p>
            <p className="text-sm text-on-surface">{i18n.language === 'ar' ? 'Arabic (عربي)' : 'English'}</p>
          </div>
          <button
            onClick={toggleLanguage}
            className="text-xs px-4 py-2 rounded-lg border border-outline text-on-surface hover:bg-surface-container-high transition-colors"
          >
            {i18n.language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
          </button>
        </div>
      </div>
    </div>
  );
}
