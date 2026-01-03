import { useState } from 'react';

export default function WipBanner() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-20 right-4 z-40 max-w-xs animate-slide-up">
      <div className="relative bg-brand-surface-elevated/95 backdrop-blur-xl border border-brand-surface-border/50 rounded-xl shadow-lg p-3">
        {/* Close button */}
        <button
          onClick={() => setIsVisible(false)}
          className="absolute -top-2 -right-2 w-6 h-6 bg-brand-surface-elevated border border-brand-surface-border rounded-full flex items-center justify-center text-brand-text-muted hover:text-brand-text-primary transition-colors shadow-md"
          aria-label="Close banner"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Content */}
        <div className="text-sm text-brand-text-primary leading-relaxed">
          <p className="font-medium text-brand-accent-primary mb-1">Hey bud, guess what??</p>
          <p className="text-brand-text-muted text-xs">
            We're working on it. Thanks for visiting ❤️ feel free to explore
          </p>
        </div>
      </div>
    </div>
  );
}
