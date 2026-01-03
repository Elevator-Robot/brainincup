import { useState, useEffect } from 'react';

export default function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const dismissed = localStorage.getItem('installPromptDismissed');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    
    if (!dismissed && !isStandalone) {
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setShowPrompt(true);
      };
      
      window.addEventListener('beforeinstallprompt', handler);
      
      // For iOS/Safari that don't support beforeinstallprompt
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS && !isStandalone) {
        setTimeout(() => setShowPrompt(true), 3000);
      }
      
      return () => window.removeEventListener('beforeinstallprompt', handler);
    }
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('installPromptDismissed', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-slide-up">
      <div className="bg-gradient-to-br from-purple-900/95 to-indigo-900/95 backdrop-blur-lg border border-purple-500/30 rounded-lg shadow-2xl shadow-purple-500/20 p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h3 className="text-white font-semibold mb-1">Install Brain in Cup</h3>
            <p className="text-purple-200 text-sm mb-3">
              Add to your home screen for the best experience
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleInstall}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-md text-sm font-medium transition-colors"
              >
                Install
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2 bg-purple-900/50 hover:bg-purple-900/70 text-purple-200 rounded-md text-sm font-medium transition-colors"
              >
                Not Now
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-purple-300 hover:text-white transition-colors"
          >
            <svg 
              className="w-5 h-5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M6 18L18 6M6 6l12 12" 
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
