import { useState } from 'react';

interface CharacterCreationProps {
  onComplete: (character: {
    name: string;
    race: string;
    characterClass: string;
    strength?: number;
    dexterity?: number;
    constitution?: number;
    intelligence?: number;
    wisdom?: number;
    charisma?: number;
  }) => void;
  onCancel?: () => void;
}

const races = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Dragonborn', 'Gnome', 'Half-Elf', 'Half-Orc', 'Tiefling'];
const classes = ['Fighter', 'Wizard', 'Rogue', 'Cleric', 'Ranger', 'Paladin', 'Barbarian', 'Bard', 'Druid', 'Monk', 'Sorcerer', 'Warlock', 'Wanderer'];

export default function CharacterCreation({ onComplete, onCancel }: CharacterCreationProps) {
  const [name, setName] = useState('');
  const [race, setRace] = useState('Human');
  const [characterClass, setCharacterClass] = useState('Wanderer');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Character name is required');
      return;
    }
    
    if (name.length > 50) {
      setError('Character name must be 50 characters or less');
      return;
    }
    
    onComplete({
      name: name.trim(),
      race,
      characterClass,
      strength: 10,
      dexterity: 12,
      constitution: 14,
      intelligence: 16,
      wisdom: 13,
      charisma: 11,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-brand-surface-elevated border border-brand-surface-border rounded-2xl shadow-2xl max-w-md w-full p-6 animate-slide-up">
        <h2 className="text-2xl font-bold text-brand-text-primary mb-2">Create Your Character</h2>
        <p className="text-sm text-brand-text-secondary mb-6">Begin your adventure by creating your character</p>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Character Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-brand-text-primary mb-2">
              Character Name *
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              maxLength={50}
              placeholder="Enter your character's name"
              className="w-full px-4 py-3 bg-brand-surface-hover border border-brand-surface-border rounded-lg text-brand-text-primary placeholder:text-brand-text-muted focus:outline-none focus:ring-2 focus:ring-brand-accent-primary focus:border-transparent transition-all"
              autoFocus
            />
            <p className="text-xs text-brand-text-muted mt-1">{name.length}/50 characters</p>
          </div>

          {/* Race Selection */}
          <div>
            <label htmlFor="race" className="block text-sm font-medium text-brand-text-primary mb-2">
              Race
            </label>
            <select
              id="race"
              value={race}
              onChange={(e) => setRace(e.target.value)}
              className="w-full px-4 py-3 bg-brand-surface-hover border border-brand-surface-border rounded-lg text-brand-text-primary focus:outline-none focus:ring-2 focus:ring-brand-accent-primary focus:border-transparent transition-all cursor-pointer"
            >
              {races.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Class Selection */}
          <div>
            <label htmlFor="class" className="block text-sm font-medium text-brand-text-primary mb-2">
              Class
            </label>
            <select
              id="class"
              value={characterClass}
              onChange={(e) => setCharacterClass(e.target.value)}
              className="w-full px-4 py-3 bg-brand-surface-hover border border-brand-surface-border rounded-lg text-brand-text-primary focus:outline-none focus:ring-2 focus:ring-brand-accent-primary focus:border-transparent transition-all cursor-pointer"
            >
              {classes.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-4 py-3 bg-brand-surface-hover border border-brand-surface-border rounded-lg text-brand-text-secondary hover:bg-brand-surface-tertiary transition-all"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="flex-1 px-4 py-3 bg-brand-accent-primary hover:bg-brand-accent-primary/90 rounded-lg text-white font-medium transition-all"
            >
              Begin Adventure
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
