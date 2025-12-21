import { useState, useRef, useEffect } from 'react';

interface PersonalitySelectorProps {
  currentPersonality: string;
  onSelectPersonality: (personality: string) => void;
  isPremium: boolean;
  onUpgradeClick: () => void;
}

interface Personality {
  id: string;
  name: string;
  icon: string;
  description: string;
  tagline: string;
  isPremium: boolean;
  color: string;
}

const personalities: Personality[] = [
  {
    id: 'default',
    name: 'Brain in Cup',
    icon: '🧠',
    description: 'Thoughtful AI consciousness for deep conversations',
    tagline: 'Default mode',
    isPremium: false,
    color: 'from-violet-500 to-fuchsia-500'
  },
  {
    id: 'rpg_dm',
    name: 'Dungeon Master',
    icon: '🎲',
    description: 'Epic fantasy adventures with an AI Game Master',
    tagline: 'Premium $2.50/mo',
    isPremium: true,
    color: 'from-amber-500 to-orange-500'
  }
];

export default function PersonalitySelector({ 
  currentPersonality, 
  onSelectPersonality, 
  isPremium,
  onUpgradeClick 
}: PersonalitySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentPersonalityData = personalities.find(p => p.id === currentPersonality) || personalities[0];

  // Calculate dropdown position when opened
  useEffect(() => {
    if (isOpen && buttonRef.current && dropdownRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const dropdownRect = dropdownRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Start below the button
      let top = buttonRect.bottom + 8;
      let left = buttonRect.right - 320; // Align right edge with button (320px = w-80)

      // If dropdown would go off right edge, align to left edge of button
      if (left < 16) {
        left = buttonRect.left;
      }

      // If dropdown would go off left edge, align to viewport edge with padding
      if (left < 16) {
        left = 16;
      }

      // If dropdown would go off right edge, align to viewport edge with padding
      if (left + 320 > viewportWidth - 16) {
        left = viewportWidth - 320 - 16;
      }

      // If dropdown would go off bottom, position above button
      if (top + dropdownRect.height > viewportHeight - 16) {
        top = buttonRect.top - dropdownRect.height - 8;
      }

      // If still off screen, position at top with padding
      if (top < 16) {
        top = 16;
      }

      setPosition({ top, left });
    }
  }, [isOpen]);

  const handleSelect = (personality: Personality) => {
    if (personality.isPremium && !isPremium) {
      onUpgradeClick();
      setIsOpen(false);
      return;
    }
    onSelectPersonality(personality.id);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Personality Selector Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl glass-hover transition-all duration-200
        hover:bg-brand-surface-hover border border-brand-surface-border hover:border-brand-accent-primary/30
        active:scale-95 group"
        title="Change personality"
      >
        <span className="text-xl">{currentPersonalityData.icon}</span>
        <div className="hidden md:flex flex-col items-start">
          <span className="text-[10px] text-brand-text-muted group-hover:text-brand-text-secondary transition-colors uppercase tracking-wider">
            Mode
          </span>
          <span className="text-xs font-medium text-brand-text-primary">
            {currentPersonalityData.name}
          </span>
        </div>
        <svg 
          className={`w-3 h-3 text-brand-text-muted group-hover:text-brand-text-primary transition-all ml-1 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-[9998]"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu Dropdown */}
          <div 
            ref={dropdownRef}
            className="fixed z-[9999] w-80 glass rounded-2xl border border-brand-surface-border shadow-glass-lg overflow-hidden animate-scale-in"
            style={{ top: `${position.top}px`, left: `${position.left}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-brand-surface-border bg-gradient-to-r from-violet-600/5 to-fuchsia-600/5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-brand-text-primary">Select Mode</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg glass-hover text-brand-text-muted hover:text-brand-text-primary transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Personalities List */}
            <div className="py-2">
              {personalities.map((personality) => {
                const isSelected = personality.id === currentPersonality;
                const isLocked = personality.isPremium && !isPremium;

                return (
                  <button
                    key={personality.id}
                    onClick={() => handleSelect(personality)}
                    className={`w-full text-left px-4 py-3 transition-all duration-200 group relative
                      ${isSelected 
                        ? 'bg-brand-accent-primary/10 border-l-2 border-brand-accent-primary' 
                        : 'hover:bg-brand-surface-hover border-l-2 border-transparent'
                      }
                    `}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${personality.color} flex items-center justify-center text-xl shadow-sm flex-shrink-0
                        ${isSelected ? '' : 'group-hover:scale-105 transition-transform duration-200'}
                      `}>
                        {personality.icon}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-brand-text-primary">
                            {personality.name}
                          </span>
                          {isSelected && (
                            <svg className="w-4 h-4 text-brand-accent-primary flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <p className="text-xs text-brand-text-muted line-clamp-2 mb-1">
                          {personality.description}
                        </p>
                        {personality.isPremium && (
                          <span className="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            {isLocked ? personality.tagline : 'PREMIUM'}
                          </span>
                        )}
                      </div>

                      {/* Lock Icon for premium */}
                      {isLocked && (
                        <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-brand-surface-border bg-gradient-to-r from-brand-bg-secondary/30 to-brand-bg-tertiary/30">
              <p className="text-[10px] text-brand-text-muted text-center">
                More modes coming soon
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
