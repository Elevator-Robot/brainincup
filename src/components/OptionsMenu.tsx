import { useEffect, useRef, useState, type ReactNode } from 'react';

interface OptionsMenuContentProps {
  email: string;
  /** Conversation-scoped action (clear or delete the open chat), rendered in its own scope group. */
  conversationAction?: ReactNode;
  onSignOut: () => void;
  onDeleteAccount: () => void;
}

/**
 * Account/options menu shaped like ChatGPT's compact account popover:
 *
 * 1. One muted line with the signed-in email. Players never get usernames,
 *    nicknames, or profile pictures, so there is no identity block.
 * 2. Flat, unlabeled rows grouped by scope instead of uppercase section labels.
 * 3. A hairline divider separates the exit action; the danger zone stays one
 *    level deeper inside Account settings, never beside routine actions.
 */
export default function OptionsMenuContent({
  email,
  conversationAction,
  onSignOut,
  onDeleteAccount,
}: OptionsMenuContentProps) {
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const settingsHeading = useRef<HTMLHeadingElement>(null);
  const previousView = useRef(showAccountSettings);
  useEffect(() => {
    if (previousView.current !== showAccountSettings) {
      (showAccountSettings ? settingsHeading.current : settingsButton.current)?.focus();
      previousView.current = showAccountSettings;
    }
  }, [showAccountSettings]);

  return <div className="cosmic-account-menu" onKeyDown={event => {
    if (event.key === 'Escape' && showAccountSettings) { event.stopPropagation(); setShowAccountSettings(false); }
  }}>
    {showAccountSettings ? <div className="cosmic-account-settings">
      <button type="button" className="cosmic-menu-back" onClick={() => setShowAccountSettings(false)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m12 19-7-7 7-7M5 12h14" /></svg>
        Back to options
      </button>
      <h3 ref={settingsHeading} tabIndex={-1} className="text-sm font-semibold text-brand-text-primary">Account settings</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-brand-text-muted">Manage your account and stored data.</p>
      <div className="cosmic-account-danger">
        <p className="text-[12px] font-semibold text-brand-text-secondary">Danger zone</p>
        <p className="mt-1 text-[11px] leading-relaxed text-brand-text-muted">Permanently remove your account, conversations, and characters.</p>
        <button type="button" className="cosmic-delete-link" onClick={onDeleteAccount}>Delete account…</button>
      </div>
    </div> : <>
      <p className="cosmic-account-email" title={email}>{email}</p>
      {conversationAction ? <div className="cosmic-menu-section">
        {conversationAction}
      </div> : null}
      <div className="cosmic-menu-section">
        <button ref={settingsButton} type="button" className="cosmic-menu-row" onClick={() => setShowAccountSettings(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 7h16M4 17h16" /><circle cx="8" cy="7" r="3" fill="currentColor" /><circle cx="16" cy="17" r="3" fill="currentColor" /></svg>
          <span>Account settings</span>
        </button>
      </div>
      <div className="cosmic-menu-section cosmic-menu-section-exit">
        <button type="button" className="cosmic-menu-row" onClick={onSignOut}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m17 16 4-4-4-4M21 12H8M13 5V3H3v18h10v-2" /></svg>
          <span>Sign out</span>
        </button>
      </div>
    </>}
  </div>;
}
