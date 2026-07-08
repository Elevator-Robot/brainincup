import { useState } from 'react';
import { MODE_OPTIONS } from '../constants/personalityModes';
import type { PersonalityModeId } from '../constants/personalityModes';

interface ModeSelectorProps {
  onSelectMode: (mode: PersonalityModeId) => void;
}

export default function ModeSelector({ onSelectMode }: ModeSelectorProps) {
  const [hoveredMode, setHoveredMode] = useState<PersonalityModeId | null>(null);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-brand-surface-dark via-brand-surface-secondary to-brand-surface-dark">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-light text-brand-text-primary mb-4">
            Choose Your Experience
          </h1>
          <p className="text-lg text-brand-text-secondary max-w-2xl mx-auto">
            Select how you'd like to interact with Brain
          </p>
        </div>

        {/* Mode Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {MODE_OPTIONS.map((mode) => (
            <button
              key={mode.id}
              onClick={() => onSelectMode(mode.id)}
              onMouseEnter={() => setHoveredMode(mode.id)}
              onMouseLeave={() => setHoveredMode(null)}
              className={`group relative overflow-hidden rounded-2xl p-8 text-left transition-all duration-300 ${
                hoveredMode === mode.id
                  ? 'scale-[1.02] shadow-2xl'
                  : 'hover:scale-[1.01]'
              } bg-gradient-to-br ${mode.accent} border border-white/10`}
            >
              {/* Background Pattern */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:20px_20px]" />
              </div>

              {/* Content */}
              <div className="relative z-10">
                {/* Icon */}
                <div className="text-5xl mb-4">{mode.icon}</div>

                {/* Title */}
                <h2 className="text-2xl font-semibold text-white mb-2">
                  {mode.title}
                </h2>

                {/* Description */}
                <p className="text-white/90 mb-6 leading-relaxed">
                  {mode.description}
                </p>

                {/* Badge */}
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${mode.tagClass} border`}>
                  <span>{mode.badge}</span>
                </div>

                {/* Arrow Indicator */}
                <div className="absolute top-8 right-8 text-white/60 group-hover:text-white transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>

              {/* Hover Glow Effect */}
              <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br ${mode.accent} blur-xl -z-10`} />
            </button>
          ))}
        </div>

        {/* Footer Info */}
        <div className="text-center text-sm text-brand-text-muted">
          <p>You can switch between modes at any time from the conversation list</p>
        </div>
      </div>
    </div>
  );
}
