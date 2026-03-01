import type { ReactNode, HTMLAttributes } from 'react';

type PanelVariant = 'standard' | 'header' | 'highlight' | 'inset';

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: PanelVariant;
  /** Rendered as uppercase label text for the header variant */
  title?: string;
  children?: ReactNode;
}

const variantClass: Record<PanelVariant, string> = {
  standard: 'rpg-panel',
  header: 'rpg-panel rpg-panel--header',
  highlight: 'rpg-panel rpg-panel--highlight',
  inset: 'rpg-panel rpg-panel--inset',
};

export default function Panel({
  variant = 'standard',
  title,
  className = '',
  children,
  ...rest
}: PanelProps) {
  const base = variantClass[variant];

  if (variant === 'header') {
    return (
      <div className={`${base} ${className}`} {...rest}>
        {title && <span>{title}</span>}
        {children}
      </div>
    );
  }

  return (
    <div className={`${base} ${className}`} {...rest}>
      {children}
    </div>
  );
}
