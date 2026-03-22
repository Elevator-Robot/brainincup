import { useEffect, useId, useMemo, useState } from 'react';
import { calculateFinalStats, getAllRaces, getAllClasses } from '../game';
import {
  getAvatarOptionsForRace,
  getAvatarOptionById,
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
const raceOptions = getAllRaces().map((raceOption) => ({
  id: raceOption.id,
  name: raceOption.name,
}));
const classes = getAllClasses().map(c => c.name);
const DEFAULT_RACE_NAME = raceOptions.find((raceOption) => raceOption.id === 'terran')?.name ?? raceOptions[0]?.name ?? 'Terran';

export default function CharacterCreation({ onComplete, onCancel, inline = false, embedded = false }: CharacterCreationProps) {
  const [name, setName] = useState('');
  const [race, setRace] = useState(DEFAULT_RACE_NAME);
  const [characterClass, setCharacterClass] = useState('Wanderer');
  const [avatarId, setAvatarId] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputId = useId();
  const raceSelectId = useId();
  const classSelectId = useId();

  const availableAvatarOptions = useMemo(() => getAvatarOptionsForRace(race), [race]);

  useEffect(() => {
    if (avatarId && availableAvatarOptions.some((avatarOption) => avatarOption.id === avatarId)) {
      return;
    }
    setAvatarId('');
  }, [availableAvatarOptions, avatarId]);

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

    const selectedAvatarId = getAvatarOptionById(avatarId)?.id ?? '';
    if (availableAvatarOptions.length > 0 && !selectedAvatarId) {
      setError('Please select an avatar before starting.');
      return;
    }
    
    // Calculate stats using game framework
    const raceId = raceOptions.find((raceOption) => raceOption.name === race)?.id ?? 'terran';
    const classId = characterClass.toLowerCase();
    
    const finalStats = calculateFinalStats(classId, raceId);

    setError('');
    setIsSubmitting(true);
    try {
      await onComplete({
        name: name.trim(),
        race,
        characterClass,
        avatarId: selectedAvatarId,
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
            aria-label="Character Name"
            className="w-full bg-transparent border-0 border-b border-brand-surface-border/70 rounded-none px-1 pt-1 pb-2 text-lg tracking-wide text-brand-text-primary focus:outline-none focus:ring-0 focus:border-brand-accent-primary/80 transition-all disabled:opacity-60"
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
            className="w-full px-4 py-3 bg-brand-surface-secondary/35 border border-brand-surface-border/70 rounded-lg text-brand-text-primary focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/45 focus:border-brand-accent-primary/45 transition-all cursor-pointer disabled:opacity-60"
            disabled={isSubmitting}
          >
            {raceOptions.map((raceOption) => (
              <option key={raceOption.id} value={raceOption.name}>{raceOption.name}</option>
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
            className="w-full px-4 py-3 bg-brand-surface-secondary/35 border border-brand-surface-border/70 rounded-lg text-brand-text-primary focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/45 focus:border-brand-accent-primary/45 transition-all cursor-pointer disabled:opacity-60"
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
          {availableAvatarOptions.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {availableAvatarOptions.map((avatarOption) => (
                <button
                  key={avatarOption.id}
                  type="button"
                  onClick={() => {
                    setAvatarId(avatarOption.id);
                    setError('');
                  }}
                  className={`group relative overflow-hidden rounded-lg p-0.5 transition-all duration-200 disabled:opacity-60 ${
                    avatarOption.id === avatarId
                      ? 'shadow-[0_0_0_1px_rgba(168,85,247,0.45),0_10px_24px_rgba(44,14,84,0.28)]'
                      : 'hover:scale-[1.04] hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(28,16,56,0.28)]'
                  }`}
                  aria-label={`Select ${avatarOption.label}`}
                  disabled={isSubmitting}
                >
                  <img
                    src={avatarOption.src}
                    alt={avatarOption.label}
                    className="h-20 w-full rounded-md object-cover object-center transition-all duration-200"
                  />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-brand-text-muted italic">No avatars available for this race yet.</p>
          )}
          {availableAvatarOptions.length > 0 && !avatarId && (
            <p className="mt-2 text-xs text-brand-text-muted">Select an avatar to continue.</p>
          )}
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
              className="flex-1 rounded-xl border border-brand-surface-border/45 bg-brand-surface-elevated/55 px-3 py-2 text-sm font-medium text-brand-text-secondary backdrop-blur-md transition-all duration-200 hover:border-brand-surface-border/70 hover:bg-brand-surface-elevated/70 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
            >
              Quick
            </button>
          )}
          <button
            type="submit"
            className="flex-1 rounded-xl border border-brand-accent-primary/45 bg-brand-accent-primary/18 px-3 py-2 text-sm font-semibold text-brand-text-primary backdrop-blur-md transition-all duration-200 hover:border-brand-accent-primary/65 hover:bg-brand-accent-primary/26 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Starting…' : 'Start'}
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
