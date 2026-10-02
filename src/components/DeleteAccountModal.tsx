import { useEffect, useId, useRef, useState } from 'react';

interface DeleteAccountModalProps {
  isOpen: boolean;
  isDeleting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteAccountModal({
  isOpen,
  isDeleting,
  error,
  onClose,
  onConfirm,
}: DeleteAccountModalProps) {
  const [confirmation, setConfirmation] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    setConfirmation('');
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [isOpen]);
  if (!isOpen) return null;

  return (
    <dialog ref={dialogRef} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      className="cosmic-delete-dialog fixed inset-0 m-0 h-dvh w-screen max-h-none max-w-none bg-transparent flex items-center justify-center border-0 p-4 animate-fade-in"
      onClick={isDeleting ? undefined : onClose}
      onCancel={event => { event.preventDefault(); if (!isDeleting) onClose(); }}
    >
      <div
        className="bg-brand-surface-elevated border border-brand-surface-border rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={`${id}-title`} className="text-xl font-bold text-brand-text-primary mb-2">Delete account?</h3>
        <p id={`${id}-description`} className="text-sm text-brand-text-muted mb-6 leading-relaxed">
          This will permanently delete your account, all your conversations, and every saved
          character. This action cannot be undone.
        </p>

        <label htmlFor={`${id}-confirmation`} className="mb-2 block text-sm text-brand-text-secondary">Type <strong>DELETE</strong> to confirm</label>
        <input id={`${id}-confirmation`} value={confirmation} onChange={event => setConfirmation(event.target.value)}
          disabled={isDeleting} autoComplete="off" spellCheck={false}
          className="mb-6 w-full rounded-xl border border-brand-surface-border bg-brand-bg-primary px-3 py-2 text-brand-text-primary" />

        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-brand-status-error/40 bg-brand-status-error/10 px-3 py-2 text-sm text-brand-status-error">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            disabled={isDeleting}
            className="rounded-xl border border-brand-surface-border/50 bg-brand-surface-secondary/60 px-4 py-2 text-sm font-medium text-brand-text-secondary transition-all duration-200 hover:bg-brand-surface-elevated/70 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { if (confirmation === 'DELETE' && !isDeleting) onConfirm(); }}
            disabled={isDeleting || confirmation !== 'DELETE'}
            className="rounded-xl border border-brand-status-error/45 bg-brand-status-error/15 px-4 py-2 text-sm font-semibold text-brand-status-error transition-all duration-200 hover:bg-brand-status-error/25 disabled:opacity-50"
          >
            {isDeleting ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
