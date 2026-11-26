interface MobileMenuToggleProps {
  expanded: boolean;
  onToggle: () => void;
}

/** Keep the same hamburger and hit target in the shell and modal header. */
export default function MobileMenuToggle({ expanded, onToggle }: MobileMenuToggleProps) {
  return <button type="button" onClick={onToggle} className="cosmic-mobile-menu-trigger"
    aria-label={expanded ? 'Close menu' : 'Open menu'} aria-haspopup="dialog" aria-expanded={expanded}>
    <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true">
      <path className="cosmic-mobile-menu-stroke" d="M4 7h16" />
      <path className="cosmic-mobile-menu-stroke" d="M4 12h16" />
      <path className="cosmic-mobile-menu-stroke" d="M4 17h16" />
    </svg>
  </button>;
}
