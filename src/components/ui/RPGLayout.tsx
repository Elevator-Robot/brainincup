import type { ReactNode, HTMLAttributes } from 'react';

/* ── Grid wrapper ── */
interface RPGLayoutProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function RPGLayout({ children, className = '', ...rest }: RPGLayoutProps) {
  return (
    <div className={`rpg-grid ${className}`} {...rest}>
      {children}
    </div>
  );
}

/* ── Named slots ── */
interface SlotProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function LeftSidebar({ children, className = '', ...rest }: SlotProps) {
  return (
    <aside className={`rpg-grid__left hidden lg:flex ${className}`} {...rest}>
      {children}
    </aside>
  );
}

export function CenterNarrative({ children, className = '', ...rest }: SlotProps) {
  return (
    <div className={`rpg-grid__center ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function RightStatus({ children, className = '', ...rest }: SlotProps) {
  return (
    <aside className={`rpg-grid__right hidden lg:flex ${className}`} {...rest}>
      {children}
    </aside>
  );
}

export function BottomInput({ children, className = '', ...rest }: SlotProps) {
  return (
    <div
      className={`retro-input-dock sticky bottom-0 left-0 right-0 bg-gradient-to-t from-brand-bg-primary via-brand-bg-primary to-transparent pt-6 pb-4 px-4 sm:px-6 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
