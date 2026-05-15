import { useRef } from 'react';
import toast from 'react-hot-toast';
import { useAttachments, useUploadAttachment, useDeleteAttachment } from '../hooks/useAttachments';
import type { AttachmentItem } from '../hooks/useAttachments';

type EntityType = 'APARTMENT' | 'TENANT' | 'BOOKING' | 'TICKET';

interface Props {
  entityType: EntityType;
  entityId: number;
  canEdit: boolean;
}

function fileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'picture_as_pdf';
  if (mimeType.startsWith('image/')) return 'image';
  return 'description';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentPanel({ entityType, entityId, canEdit }: Props) {
  const { data: attachments = [], isLoading } = useAttachments(entityType, entityId);
  const upload = useUploadAttachment(entityType, entityId);
  const remove = useDeleteAttachment(entityType, entityId);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await upload.mutateAsync(file);
      toast.success('File uploaded');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Upload failed');
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDelete = async (att: AttachmentItem) => {
    if (!window.confirm(`Delete "${att.filename}"?`)) return;
    try {
      await remove.mutateAsync(att.id);
      toast.success('Attachment deleted');
    } catch {
      toast.error('Failed to delete attachment');
    }
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-on-surface">Attachments</h3>
        {canEdit && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={upload.isPending}
              className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">upload</span>
              {upload.isPending ? 'Uploading…' : 'Upload file'}
            </button>
          </>
        )}
      </div>

      {isLoading && (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      )}

      {!isLoading && attachments.length === 0 && (
        <p className="text-sm text-on-surface-variant">No attachments yet.</p>
      )}

      <ul className="space-y-2">
        {attachments.map((att) => (
          <li
            key={att.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[22px] text-on-surface-variant flex-shrink-0">
              {fileIcon(att.mimeType)}
            </span>
            <div className="flex-1 min-w-0">
              <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline truncate block"
              >
                {att.filename}
              </a>
              <p className="text-xs text-on-surface-variant">
                {formatSize(att.size)} · {att.uploadedBy.name}
              </p>
            </div>
            {canEdit && (
              <button
                onClick={() => handleDelete(att)}
                disabled={remove.isPending}
                className="p-1 hover:bg-surface-container rounded-full text-on-surface-variant disabled:opacity-50 flex-shrink-0"
                title="Delete attachment"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
