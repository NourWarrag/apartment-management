import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateTicket, useMaintenanceStaff } from '../../hooks/useTickets';
import { useApartments } from '../../hooks/useApartments';

const schema = z.object({
  apartmentId: z.coerce.number().min(1, 'Apartment is required'),
  description: z.string().min(1, 'Description is required'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  type: z.enum(['MAINTENANCE', 'CLEANING']).default('MAINTENANCE'),
  assignedToId: z.preprocess(
    v => (v === '' || v === undefined || v === null) ? undefined : Number(v),
    z.number().optional()
  ),
});

type FormValues = z.infer<typeof schema>;

interface NewTicketModalProps {
  open: boolean;
  onClose: () => void;
  defaultType?: 'MAINTENANCE' | 'CLEANING';
}

export default function NewTicketModal({ open, onClose, defaultType = 'MAINTENANCE' }: NewTicketModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);

  const createTicket = useCreateTicket();
  const { data: apartments = [] } = useApartments();
  const { data: staff = [] } = useMaintenanceStaff();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'MEDIUM', type: defaultType },
  });

  if (!open) return null;

  function onSubmit(values: FormValues) {
    setApiError(null);
    createTicket.mutate(
      {
        apartmentId: values.apartmentId,
        description: values.description,
        priority: values.priority,
        type: values.type,
        assignedToId: values.assignedToId || undefined,
      },
      {
        onSuccess: () => { reset(); onClose(); },
        onError: (err: any) => setApiError(err.response?.data?.message ?? 'Failed to create ticket'),
      }
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md border border-outline-variant overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-on-surface">New Ticket</h2>
            <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Type</label>
              <select
                {...register('type')}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm text-on-surface"
              >
                <option value="MAINTENANCE">Maintenance</option>
                <option value="CLEANING">Cleaning</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Apartment</label>
              <select
                {...register('apartmentId')}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm text-on-surface"
              >
                <option value="">Select apartment…</option>
                {apartments.map(a => (
                  <option key={a.id} value={a.id}>Apt. {a.number} — Floor {a.floor}</option>
                ))}
              </select>
              {errors.apartmentId && <p className="text-xs text-error mt-1">{errors.apartmentId.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Description</label>
              <textarea
                {...register('description')}
                rows={3}
                placeholder="Describe the issue…"
                className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm text-on-surface resize-none placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              {errors.description && <p className="text-xs text-error mt-1">{errors.description.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Priority</label>
              <select
                {...register('priority')}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm text-on-surface"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1">Assign To (optional)</label>
              <select
                {...register('assignedToId')}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm text-on-surface"
              >
                <option value="">Unassigned</option>
                {staff.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {apiError && <p className="text-sm text-error">{apiError}</p>}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg border border-outline-variant text-sm font-bold text-on-surface hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createTicket.isPending}
                className="flex-1 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {createTicket.isPending ? 'Creating…' : 'Create Ticket'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
