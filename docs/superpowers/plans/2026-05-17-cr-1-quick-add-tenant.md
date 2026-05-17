# CR-1: Inline Quick-Add Tenant in Booking Form — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When creating a booking, allow staff to add a new tenant inline via a minimal 3-field sub-modal beside the Tenant dropdown, auto-selecting the new tenant on success.

**Architecture:** New `QuickAddTenantModal` component (3 fields: fullName/phone/idNumber) opened from a `+` icon button next to the Tenant `<select>` in `BookingFormModal`. Reuses the existing `useCreateTenant` hook and `POST /tenants` endpoint — no backend change. New tenant flows back through an `onCreated(tenant)` callback that does `setValue('tenantId', newTenant.id)` on the parent form. 409 errors on `idNumber` uniqueness become inline form errors via `setError`.

**Tech Stack:** React 18, TypeScript, react-hook-form, zod, TanStack Query v5, Tailwind, react-i18next. Client has no test framework — verification is TypeScript build + manual browser check.

**Source spec:** `docs/superpowers/specs/2026-05-17-broker-and-booking-crs-brd.md` § "CR-1".

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `client/src/pages/bookings/QuickAddTenantModal.tsx` | Create | Minimal 3-field tenant creation form. Wraps `useCreateTenant`. Calls `onCreated(tenant)` then `onClose()` on success. Surfaces 409 (duplicate idNumber) as inline error on the field. |
| `client/src/pages/bookings/BookingFormModal.tsx` | Modify | Add `+` icon button beside the Tenant dropdown (hidden when `prefilledTenantId` is set). Mount `QuickAddTenantModal`. On `onCreated`, call `setValue('tenantId', newTenant.id, { shouldValidate: true })`. |

The new modal lives in the bookings folder, not tenants — it is a booking-flow concern (intentionally minimal, not a substitute for the full TenantFormModal). Putting it next to its only consumer keeps the dependency local.

---

## Task 1: Create `QuickAddTenantModal`

**Files:**
- Create: `client/src/pages/bookings/QuickAddTenantModal.tsx`

- [ ] **Step 1: Write the full component**

Create `client/src/pages/bookings/QuickAddTenantModal.tsx` with this exact content:

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useCreateTenant } from '../../hooks/useTenants';
import type { TenantListItem } from '../../hooks/useTenants';

const schema = z.object({
  fullName: z.string().min(2, 'Required'),
  phone: z.string().min(5, 'Required'),
  idNumber: z.string().min(3, 'Required'),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (tenant: TenantListItem) => void;
}

export default function QuickAddTenantModal({ open, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const create = useCreateTenant();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', phone: '', idNumber: '' },
  });

  if (!open) return null;

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const res = await create.mutateAsync(values);
      onCreated(res.data as TenantListItem);
      reset();
      onClose();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (status === 409) {
        setError('idNumber', {
          type: 'server',
          message: msg ?? 'ID number already in use',
        });
        return;
      }
      setError('root', {
        type: 'server',
        message: msg ?? 'Something went wrong. Please try again.',
      });
    }
  };

  const inputCls =
    'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary';
  const labelCls = 'block text-sm font-semibold text-on-surface mb-1.5';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-[90vw] lg:max-w-sm p-6 border border-outline-variant">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-primary">
            {t('tenants.quickAdd', 'Quick add tenant')}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={labelCls}>{t('tenants.fullName')}</label>
            <input {...register('fullName')} className={inputCls} autoFocus />
            {errors.fullName && (
              <p className="text-error text-xs mt-1">{errors.fullName.message}</p>
            )}
          </div>
          <div>
            <label className={labelCls}>{t('tenants.phone')}</label>
            <input {...register('phone')} type="tel" className={inputCls} />
            {errors.phone && (
              <p className="text-error text-xs mt-1">{errors.phone.message}</p>
            )}
          </div>
          <div>
            <label className={labelCls}>{t('tenants.idNumber')}</label>
            <input {...register('idNumber')} className={inputCls} />
            {errors.idNumber && (
              <p className="text-error text-xs mt-1">{errors.idNumber.message}</p>
            )}
          </div>

          {errors.root && (
            <p className="text-error text-sm">{errors.root.message}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 border border-outline-variant text-on-surface-variant rounded-lg py-2 text-sm font-medium hover:bg-surface-container transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-primary text-on-primary rounded-lg py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

Design notes (do NOT add as comments in the file — explanation only):

- `z-[60]` (versus the parent BookingFormModal's `z-50`) ensures the quick-add overlays the booking form even though it's mounted as a sibling at the bottom of BookingFormModal's JSX.
- `defaults applied server-side`: this component intentionally does NOT send `kycStatus` or `tier`. The server's `POST /tenants` already defaults them to `PENDING` and `NEW` per the Prisma schema. Sending undefined values would be wasted bytes and creates two places where defaults are set.
- `errors.root` is react-hook-form's reserved key for form-level errors not tied to any field. `setError('root', {...})` works without a registered input.
- `i18n key `tenants.quickAdd` has an English fallback. If the project's locale files don't have this key, the fallback "Quick add tenant" is shown. Adding the translation entry is a separate, follow-up concern.

- [ ] **Step 2: TypeScript check passes**

Run from repo root:
```
npm --prefix client run build
```
Expected: build completes with no errors. (`vite build` runs `tsc` first per `client/package.json`.)

If the build fails because of a missing translation key — that would be runtime-only behaviour, not a type error. The fallback ensures correctness without locale changes. If the build fails for other reasons in unrelated files, STOP and report BLOCKED.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/bookings/QuickAddTenantModal.tsx
git commit -m "$(cat <<'EOF'
feat(bookings): QuickAddTenantModal for inline tenant creation (CR-1)

New minimal 3-field modal (fullName/phone/idNumber) for adding a
tenant from inside the booking flow. Reuses useCreateTenant and the
existing POST /tenants endpoint; server defaults kycStatus=PENDING
and tier=NEW. Surfaces a 409 from idNumber uniqueness as an inline
form error.

Standalone in this commit — the BookingFormModal trigger that uses
it is wired in the next commit.

Spec: docs/superpowers/specs/2026-05-17-broker-and-booking-crs-brd.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wire `QuickAddTenantModal` into `BookingFormModal`

**Files:**
- Modify: `client/src/pages/bookings/BookingFormModal.tsx`

- [ ] **Step 1: Add the import**

The current imports at the top of `BookingFormModal.tsx`:

```ts
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateBooking } from '../../hooks/useBookings';
import { useApartments } from '../../hooks/useApartments';
import { useTenants } from '../../hooks/useTenants';
import { ApartmentStatus } from '@hotel/shared';
```

Add a single new import after the `useTenants` line:

```ts
import type { TenantListItem } from '../../hooks/useTenants';
import QuickAddTenantModal from './QuickAddTenantModal';
```

Final imports (after edit):

```ts
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateBooking } from '../../hooks/useBookings';
import { useApartments } from '../../hooks/useApartments';
import { useTenants } from '../../hooks/useTenants';
import type { TenantListItem } from '../../hooks/useTenants';
import QuickAddTenantModal from './QuickAddTenantModal';
import { ApartmentStatus } from '@hotel/shared';
```

- [ ] **Step 2: Pull `setValue` out of `useForm` and add quick-add state**

Locate the `useForm` destructure block (currently lines 45-58):

```ts
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      apartmentId: prefilledApartmentId ?? ('' as unknown as number),
      tenantId: prefilledTenantId ?? ('' as unknown as number),
      paymentMethod: 'CASH',
    },
  });
```

Add `setValue` to the destructured properties:

```ts
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      apartmentId: prefilledApartmentId ?? ('' as unknown as number),
      tenantId: prefilledTenantId ?? ('' as unknown as number),
      paymentMethod: 'CASH',
    },
  });
```

Then locate the existing local state line (currently line 40):

```ts
  const [apiError, setApiError] = useState<string | null>(null);
```

Immediately after it, add the new state:

```ts
  const [quickAddOpen, setQuickAddOpen] = useState(false);
```

- [ ] **Step 3: Replace the Tenant field block with the flex layout including the + button**

Locate the existing Tenant field block (currently lines 131-149):

```tsx
          {/* Tenant */}
          <div>
            <label className={labelCls}>Tenant</label>
            <select
              {...register('tenantId')}
              disabled={!!prefilledTenantId}
              className={inputCls + (prefilledTenantId ? ' opacity-60 cursor-not-allowed' : '')}
            >
              <option value="">Select tenant…</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName} — {t.phone}
                </option>
              ))}
            </select>
            {errors.tenantId && (
              <p className="text-red-600 text-xs mt-1">{errors.tenantId.message}</p>
            )}
          </div>
```

Replace with:

```tsx
          {/* Tenant */}
          <div>
            <label className={labelCls}>Tenant</label>
            <div className="flex gap-2">
              <select
                {...register('tenantId')}
                disabled={!!prefilledTenantId}
                className={inputCls + (prefilledTenantId ? ' opacity-60 cursor-not-allowed' : '')}
              >
                <option value="">Select tenant…</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName} — {t.phone}
                  </option>
                ))}
              </select>
              {!prefilledTenantId && (
                <button
                  type="button"
                  onClick={() => setQuickAddOpen(true)}
                  title="Add new tenant"
                  className="shrink-0 px-3 rounded-lg border border-outline-variant bg-surface-container-low hover:bg-surface-container transition-colors flex items-center justify-center text-on-surface-variant"
                >
                  <span className="material-symbols-outlined text-[20px]">person_add</span>
                </button>
              )}
            </div>
            {errors.tenantId && (
              <p className="text-red-600 text-xs mt-1">{errors.tenantId.message}</p>
            )}
          </div>
```

Notes:
- The button is hidden when `prefilledTenantId` is set (matches the existing pattern for the apartment field; you cannot replace a prefilled tenant from this modal).
- `type="button"` is required to prevent the button from submitting the outer form.
- The icon `person_add` is from material-symbols-outlined (already used elsewhere in the project).

- [ ] **Step 4: Mount `QuickAddTenantModal` and define the `onCreated` callback**

Locate the form's outermost JSX wrapper. The form opens at the current line `<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">` and the entire return ends with two closing divs and the closing tag of the outer wrapper:

```tsx
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-lg p-6 border border-outline-variant max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          ...
        </div>
        <form ...>
          ...
        </form>
      </div>
    </div>
  );
```

Add the `QuickAddTenantModal` as a SIBLING of the outermost `<div className="fixed inset-0 ...">` — that is, both modals share the same parent (which is the React fragment returned by the function). Wrap the return in a fragment if needed:

Replace the return's opening from:

```tsx
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
```

to:

```tsx
  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
```

And replace the return's closing `</div>\n  );` (the last `</div>` before `);`) so that the quick-add modal is added after it and the fragment is closed:

Locate the very end of the return:

```tsx
        </form>
      </div>
    </div>
  );
}
```

Replace with:

```tsx
        </form>
      </div>
    </div>
    <QuickAddTenantModal
      open={quickAddOpen}
      onClose={() => setQuickAddOpen(false)}
      onCreated={(tenant: TenantListItem) => {
        setValue('tenantId', tenant.id, { shouldValidate: true });
      }}
    />
    </>
  );
}
```

**Do not re-indent** the existing inner JSX (the two wrapper `<div>`s and the form). Wrapping the return in a fragment adds one logical level of nesting, but re-indenting hundreds of lines would explode the diff for zero functional gain. JSX doesn't care about indentation.

Resulting structure of the return (high-level):

```tsx
return (
  <>
    <div className="fixed inset-0 ... z-50">    {/* booking form */}
      <div ...>
        <div ...> ... </div>                    {/* header */}
        <form ...> ... </form>                  {/* form */}
      </div>
    </div>
    <QuickAddTenantModal ... />                 {/* quick-add overlay */}
  </>
);
```

The `QuickAddTenantModal` returns `null` when `open={false}`, so it's safe to leave mounted alongside the form at all times. When it opens, its own `z-[60]` overlay sits above the booking form's `z-50` overlay.

- [ ] **Step 5: TypeScript check passes**

Run from repo root:
```
npm --prefix client run build
```
Expected: build completes with no errors.

If you get a JSX error about adjacent elements at the return statement, the fragment wrapping in Step 4 was not applied correctly — re-read the step.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/bookings/BookingFormModal.tsx
git commit -m "$(cat <<'EOF'
feat(bookings): inline tenant quick-add button in booking form (CR-1)

Adds a person_add icon button next to the Tenant dropdown that opens
the new QuickAddTenantModal. On successful creation the new tenant is
auto-selected via setValue('tenantId', newTenant.id). Button is hidden
when tenantId is prefilled (e.g. when opening from the tenant detail
page).

Spec: docs/superpowers/specs/2026-05-17-broker-and-booking-crs-brd.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Manual browser verification (controller runs after both commits)

Start the dev server (if not already running):
```
npm --prefix client run dev
```

**Golden path:**

1. Log in as `RECEPTIONIST` or `ADMIN`.
2. Navigate to `/bookings`.
3. Click `+ New Booking` → booking modal opens.
4. Click the `person_add` icon next to the Tenant dropdown → quick-add modal opens on top.
5. Fill in: fullName = `Test Walkin Tenant`, phone = `+971501234567`, idNumber = a fresh value not used by any existing tenant.
6. Click Save → quick-add modal closes; the Tenant dropdown in the booking form now shows `Test Walkin Tenant — +971501234567` selected.
7. Fill out the rest of the booking form and submit → booking is created.
8. Verify on `/tenants` that `Test Walkin Tenant` exists with `kycStatus = PENDING` and `tier = NEW`.

**Duplicate idNumber path:**

1. Open booking form → quick-add modal.
2. Enter an idNumber that already exists on an existing tenant.
3. Click Save → expect inline error under the idNumber field saying `ID number already in use` (or whatever the server returns). Modal stays open.

**Prefilled tenant path (regression check):**

1. Navigate to `/tenants/:id` for an existing tenant.
2. Open the booking form for them (the path that prefills `tenantId`).
3. Expect: the `person_add` icon button is **absent** next to the (disabled) Tenant dropdown.

If any of these fail, report the failing step and I'll dispatch a fix subagent.

---

## Acceptance check (BRD § CR-1)

- [x] `+` icon button next to the Tenant select in `BookingFormModal` — verified in golden path Step 4.
- [x] Quick-add sub-modal collects only fullName, phone, idNumber — verified in Step 5 / Task 1's component shape.
- [x] On submit, POST to existing `POST /tenants` with defaults `kycStatus=PENDING`, `tier=NEW` (server-side, not in the request payload) — verified in tenants list check Step 8.
- [x] New tenant auto-selected in the parent form via `setValue('tenantId', newTenant.id)` — verified in Step 6.
- [x] 409 on `idNumber` uniqueness surfaces as inline error — verified in duplicate-idNumber path.

---

## Notes for the implementer

- **No new endpoint.** Server already supports `POST /tenants`. Don't touch the server.
- **No locale-file edits.** The new `tenants.quickAdd` key uses react-i18next's English fallback — a follow-up can add translations to the locale JSON if needed; it is not blocking.
- **Don't refactor `useCreateTenant`.** It returns `AxiosResponse` — `mutateAsync` will give you the full response, and `.data` is the tenant body. Don't change the hook signature to "return data directly" — that would change the contract for other consumers (`TenantFormModal`) and is out of scope.
- **Don't add KYC / tier / notes fields to the quick-add.** The whole point per the BRD is to be intentionally minimal.
- **If the build fails on something unrelated to your change**, stop and report BLOCKED (Rule 3 — surgical changes).
