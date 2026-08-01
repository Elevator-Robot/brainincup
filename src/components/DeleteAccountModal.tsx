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
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in"
      onClick={isDeleting ? undefined : onClose}
    >
      <div
        className="bg-brand-surface-elevated border border-brand-surface-border rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold text-brand-text-primary mb-2">Delete account?</h3>
        <p className="text-sm text-brand-text-muted mb-6 leading-relaxed">
          This will permanently delete your account, all your conversations, and every saved
          character. This action cannot be undone.
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-brand-status-error/40 bg-brand-status-error/10 px-3 py-2 text-sm text-brand-status-error">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-xl border border-brand-surface-border/50 bg-brand-surface-secondary/60 px-4 py-2 text-sm font-medium text-brand-text-secondary transition-all duration-200 hover:bg-brand-surface-elevated/70 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-xl border border-brand-status-error/45 bg-brand-status-error/15 px-4 py-2 text-sm font-semibold text-brand-status-error transition-all duration-200 hover:bg-brand-status-error/25 disabled:opacity-50"
          >
            {isDeleting ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
    </div>
  );
}
