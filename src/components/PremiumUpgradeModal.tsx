interface PremiumUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}

export default function PremiumUpgradeModal({ isOpen, onClose, onUpgrade }: PremiumUpgradeModalProps) {
  if (!isOpen) return null;

  const features = [
    {
      icon: '🎲',
      title: 'RPG Dungeon Master',
      description: 'Experience unlimited fantasy adventures with an AI Game Master'
    },
    {
      icon: '📖',
      title: 'Dynamic Storytelling',
      description: 'Every choice matters in your personalized narrative journey'
    },
    {
      icon: '🎭',
      title: 'Rich Characters & Worlds',
      description: 'Interact with memorable NPCs in vivid, immersive settings'
    },
    {
      icon: '⚔️',
      title: 'Epic Campaigns',
      description: 'Long-form adventures that continue across sessions'
    },
    {
      icon: '🌟',
      title: 'Early Access',
      description: 'Get first access to new personalities and features'
    },
    {
      icon: '💾',
      title: 'Save Progress',
      description: 'Your adventures are saved and ready when you return'
    }
  ];

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-lg z-50 flex items-center justify-center p-4 sm:p-6 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="glass rounded-3xl border-2 border-brand-accent-primary/50 shadow-glow max-w-3xl w-full max-h-[90vh] mx-auto animate-scale-in overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero Section */}
        <div className="relative p-6 md:p-8 bg-gradient-to-br from-violet-600/20 via-fuchsia-600/20 to-amber-600/20 overflow-hidden">
          {/* Animated background elements */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-10 left-10 w-32 h-32 bg-violet-500 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-10 right-10 w-40 h-40 bg-fuchsia-500 rounded-full blur-3xl animate-pulse delay-1000"></div>
            <div className="absolute top-1/2 left-1/2 w-36 h-36 bg-amber-500 rounded-full blur-3xl animate-pulse delay-500"></div>
          </div>

          <div className="relative z-10">
            <button
              onClick={onClose}
              className="absolute top-0 right-0 p-2 rounded-xl glass-hover text-brand-text-muted hover:text-brand-text-primary transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 mb-3">
                <span className="text-4xl animate-float">🎲</span>
                <span className="text-4xl animate-float delay-200">⚔️</span>
                <span className="text-4xl animate-float delay-400">🏰</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-brand-text-primary mb-3">
                Unlock Premium
              </h1>
              <p className="text-xl text-brand-text-secondary max-w-2xl mx-auto">
                Transform your AI companion into an endless RPG adventure
              </p>
            </div>

            {/* Pricing Card */}
            <div className="max-w-md mx-auto glass rounded-2xl border-2 border-brand-accent-primary/50 p-6 shadow-glow-lg">
              <div className="text-center mb-6">
                <div className="inline-block px-4 py-1 rounded-full bg-amber-500/20 text-amber-400 text-sm font-semibold mb-4">
                  LAUNCH SPECIAL
                </div>
                <div className="flex items-baseline justify-center gap-2 mb-2">
                  <span className="text-5xl font-bold text-brand-text-primary">$2.50</span>
                  <span className="text-xl text-brand-text-muted">/month</span>
                </div>
                <p className="text-sm text-brand-text-muted">Cancel anytime, no commitment</p>
              </div>

              <button
                onClick={onUpgrade}
                className="w-full px-8 py-4 rounded-2xl bg-gradient-mesh text-white font-semibold text-lg
                shadow-glow hover:shadow-neon-purple hover:scale-[1.02] active:scale-[0.98]
                transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/50 
                animate-glow-pulse"
              >
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Upgrade to Premium
                </span>
              </button>

              <p className="text-xs text-center text-brand-text-muted mt-4">
                Secure payment powered by Stripe
              </p>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="p-6 md:p-8 bg-gradient-to-b from-transparent to-brand-bg-secondary/30">
          <h2 className="text-2xl font-bold text-brand-text-primary mb-6 text-center">
            What You'll Get
          </h2>
          <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="glass rounded-2xl p-5 border border-brand-surface-border hover:border-brand-accent-primary/30 
                transition-all duration-300 hover:shadow-glow-sm group"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-start gap-4">
                  <div className="text-4xl flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-brand-text-primary mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-brand-text-muted">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Social Proof / Guarantee */}
        <div className="p-6 bg-gradient-to-r from-violet-600/10 to-fuchsia-600/10 border-t border-brand-surface-border">
          <div className="max-w-3xl mx-auto">
            <div className="grid md:grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-3xl font-bold text-brand-accent-primary mb-2">∞</div>
                <div className="text-sm text-brand-text-muted">Unlimited Adventures</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-brand-accent-primary mb-2">24/7</div>
                <div className="text-sm text-brand-text-muted">Always Available</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-brand-accent-primary mb-2">100%</div>
                <div className="text-sm text-brand-text-muted">Satisfaction Guarantee</div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="p-6 text-center text-xs text-brand-text-muted border-t border-brand-surface-border">
          <p>
            By upgrading, you agree to our{' '}
            <a href="/terms" className="text-brand-accent-primary hover:underline">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" className="text-brand-accent-primary hover:underline">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
}
