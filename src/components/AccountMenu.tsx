import { useEffect, useRef, useState, type ReactNode } from 'react';

interface AccountMenuProps {
  displayName: string;
  email: string;
  onSignOut: () => void;
  onDeleteAccount: () => void;
  children: ReactNode;
}

export default function AccountMenu({ displayName, email, onSignOut, onDeleteAccount, children }: AccountMenuProps) {
  const [settings, setSettings] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const settingsHeading = useRef<HTMLHeadingElement>(null);
  const previousView = useRef(settings);
  useEffect(() => {
    if (previousView.current !== settings) {
      (settings ? settingsHeading.current : settingsButton.current)?.focus();
      previousView.current = settings;
    }
  }, [settings]);
  return <div className="cosmic-account-menu" onKeyDown={event => {
    if (event.key === 'Escape' && settings) { event.stopPropagation(); setSettings(false); }
  }}>
    <div className="cosmic-account-identity">
      <span className="cosmic-account-avatar" aria-hidden="true">{(displayName || email || 'B').slice(0, 1).toUpperCase()}</span>
      <div className="min-w-0"><p className="truncate font-semibold text-brand-text-primary">{displayName || 'Your account'}</p><p className="truncate text-[12px] text-brand-text-muted">{email}</p></div>
    </div>
    {settings ? <div className="cosmic-account-settings">
      <button type="button" className="cosmic-menu-back" onClick={() => setSettings(false)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m12 19-7-7 7-7M5 12h14" /></svg>
        Back to menu
      </button>
      <h3 ref={settingsHeading} tabIndex={-1} className="text-base text-brand-text-primary">Account settings</h3>
      <p className="mt-2 text-sm leading-relaxed text-brand-text-muted">Manage your account and stored data.</p>
      <div className="cosmic-account-danger">
        <p className="text-sm font-semibold text-brand-text-secondary">Account deletion</p>
        <p className="mt-1 text-[12px] leading-relaxed text-brand-text-muted">Permanently remove your account, conversations, and characters.</p>
        <button type="button" className="cosmic-delete-link" onClick={onDeleteAccount}>Delete account…</button>
      </div>
    </div> : <>
      <div className="cosmic-menu-section"><p className="cosmic-menu-label">Conversation</p>{children}</div>
      <div className="cosmic-menu-section">
        <p className="cosmic-menu-label">Account</p>
        <button ref={settingsButton} type="button" className="cosmic-menu-row" onClick={() => setSettings(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 7h16M4 17h16" /><circle cx="8" cy="7" r="3" fill="currentColor" /><circle cx="16" cy="17" r="3" fill="currentColor" /></svg>
          <span>Account settings</span><span className="cosmic-menu-chevron" aria-hidden="true">›</span>
        </button>
        <button type="button" className="cosmic-menu-row" onClick={onSignOut}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m17 16 4-4-4-4M21 12H8M13 5V3H3v18h10v-2" /></svg>
          <span>Sign out</span>
        </button>
      </div>
    </>}
  </div>;
}
