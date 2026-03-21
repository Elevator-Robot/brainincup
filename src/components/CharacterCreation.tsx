import { useEffect, useId, useState } from 'react';
import { calculateFinalStats, getAllRaces, getAllClasses } from '../game';
import {
  CHARACTER_AVATAR_OPTIONS,
  DEFAULT_CHARACTER_AVATAR_ID,
  chooseAutoAvatarId,
} from '../constants/gameMasterAvatars';

interface CharacterCreationProps {
  onComplete: (character: {
    name: string;
    race: string;
    characterClass: string;
    avatarId: string;
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  }) => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
  inline?: boolean;
  embedded?: boolean;
}

// Get races and classes from game framework
const races = getAllRaces().map(r => r.name);
const classes = getAllClasses().map(c => c.name);

export default function CharacterCreation({ onComplete, onCancel, inline = false, embedded = false }: CharacterCreationProps) {
  const [name, setName] = useState('');
  const [race, setRace] = useState('Human');
  const [characterClass, setCharacterClass] = useState('Wanderer');
  const [avatarId, setAvatarId] = useState(() => chooseAutoAvatarId({ name: '', race: 'Human', characterClass: 'Wanderer' }));
  const [isAvatarManuallySelected, setIsAvatarManuallySelected] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputId = useId();
  const raceSelectId = useId();
  const classSelectId = useId();

  useEffect(() => {
    if (isAvatarManuallySelected) return;
    setAvatarId(chooseAutoAvatarId({ name, race, characterClass }));
  }, [name, race, characterClass, isAvatarManuallySelected]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Character name is required');
      return;
    }
    
    if (name.length > 50) {
      setError('Character name must be 50 characters or less');
      return;
    }
    
    // Calculate stats using game framework
    const raceId = race.toLowerCase().replace('-', '');
    const classId = characterClass.toLowerCase();
    
    const finalStats = calculateFinalStats(classId, raceId);

    setError('');
    setIsSubmitting(true);
    try {
      await onComplete({
        name: name.trim(),
        race,
        characterClass,
        avatarId: avatarId || DEFAULT_CHARACTER_AVATAR_ID,
        ...finalStats,
      });
    } catch (submitError) {
      console.error('Character creation failed:', submitError);
      const detail = submitError instanceof Error ? submitError.message : '';
      setError(detail ? `Unable to begin adventure right now: ${detail}` : 'Unable to begin adventure right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!onCancel || isSubmitting) return;
    setError('');
    setIsSubmitting(true);
    try {
      await onCancel();
    } catch (cancelError) {
      console.error('Quick start failed:', cancelError);
      setError('Unable to start quickly right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const card = (
    <div className={`${embedded ? 'w-full p-0' : 'retro-frame bg-brand-surface-elevated/95 border border-amber-700/35 rounded-2xl shadow-2xl max-w-md w-full p-6'} animate-slide-up`}>
      <h2 className="text-2xl font-bold text-brand-text-primary mb-2">Create Your Character</h2>
      <p className="text-sm text-brand-text-secondary mb-6">Begin your adventure without leaving the story.</p>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor={nameInputId} className="block text-sm font-medium text-brand-text-primary mb-2">
            Character Name *
          </label>
          <input
            id={nameInputId}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            maxLength={50}
            placeholder="Enter your character's name"
            className="w-full px-4 py-3 bg-brand-surface-hover border border-brand-surface-border rounded-lg text-brand-text-primary placeholder:text-brand-text-muted focus:outline-none focus:ring-2 focus:ring-brand-accent-primary focus:border-transparent transition-all disabled:opacity-60"
            autoFocus
            disabled={isSubmitting}
          />
          <p className="text-xs text-brand-text-muted mt-1">{name.length}/50 characters</p>
        </div>

        <div>
          <label htmlFor={raceSelectId} className="block text-sm font-medium text-brand-text-primary mb-2">
            Race
          </label>
          <select
            id={raceSelectId}
            value={race}
            onChange={(e) => setRace(e.target.value)}
            className="w-full px-4 py-3 bg-brand-surface-hover border border-brand-surface-border rounded-lg text-brand-text-primary focus:outline-none focus:ring-2 focus:ring-brand-accent-primary focus:border-transparent transition-all cursor-pointer disabled:opacity-60"
            disabled={isSubmitting}
          >
            {races.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={classSelectId} className="block text-sm font-medium text-brand-text-primary mb-2">
            Class
          </label>
          <select
            id={classSelectId}
            value={characterClass}
            onChange={(e) => setCharacterClass(e.target.value)}
            className="w-full px-4 py-3 bg-brand-surface-hover border border-brand-surface-border rounded-lg text-brand-text-primary focus:outline-none focus:ring-2 focus:ring-brand-accent-primary focus:border-transparent transition-all cursor-pointer disabled:opacity-60"
            disabled={isSubmitting}
          >
            {classes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <p className="block text-sm font-medium text-brand-text-primary mb-2">
            Avatar
          </p>
          <div className="grid grid-cols-3 gap-2">
            {CHARACTER_AVATAR_OPTIONS.map((avatarOption) => (
              <button
                key={avatarOption.id}
                type="button"
                onClick={() => {
                  setAvatarId(avatarOption.id);
                  setIsAvatarManuallySelected(true);
                  setError('');
                }}
                className={`rounded-lg border p-0.5 transition-all disabled:opacity-60 ${
                  avatarOption.id === avatarId
                    ? 'border-brand-accent-primary'
                    : 'border-brand-surface-border/60 hover:border-brand-surface-border'
                }`}
                aria-label={`Select ${avatarOption.label}`}
                disabled={isSubmitting}
              >
                <img src={avatarOption.src} alt={avatarOption.label} className="h-16 w-full rounded-md object-cover" />
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          {onCancel && (
            <button
              type="button"
              onClick={() => { void handleCancel(); }}
              className="flex-1 px-4 py-3 bg-brand-surface-hover border border-brand-surface-border rounded-lg text-brand-text-secondary hover:bg-brand-surface-tertiary transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              Quick Start
            </button>
          )}
          <button
            type="submit"
            className="flex-1 px-4 py-3 bg-brand-accent-primary hover:bg-brand-accent-primary/90 rounded-lg text-white font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Forging Hero...' : 'Begin Adventure'}
          </button>
        </div>
      </form>
    </div>
  );

  if (inline) {
    if (embedded) {
      return card;
    }
    return <div className="flex justify-center">{card}</div>;
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      {card}
    </div>
  );
}
