import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
const classOptions = getAllClasses().map((classOption) => ({
  id: classOption.id,
  name: classOption.name,
}));
const DEFAULT_RACE_NAME = raceOptions.find((raceOption) => raceOption.id === 'terran')?.name ?? raceOptions[0]?.name ?? 'Terran';
const DEFAULT_CLASS_NAME = classOptions.find((classOption) => classOption.id === 'wanderer')?.name ?? classOptions[0]?.name ?? 'Wanderer';

export default function CharacterCreation({ onComplete, onCancel, inline = false, embedded = false }: CharacterCreationProps) {
  const [name, setName] = useState('');
  const [race, setRace] = useState(DEFAULT_RACE_NAME);
  const [characterClass, setCharacterClass] = useState(DEFAULT_CLASS_NAME);
  const [avatarId, setAvatarId] = useState('');
  const [openPicker, setOpenPicker] = useState<'race' | 'class' | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputId = useId();
  const racePickerId = useId();
  const classPickerId = useId();
  const racePickerRef = useRef<HTMLDivElement>(null);
  const classPickerRef = useRef<HTMLDivElement>(null);

  const availableAvatarOptions = useMemo(() => getAvatarOptionsForRace(race), [race]);

  useEffect(() => {
    if (avatarId && availableAvatarOptions.some((avatarOption) => avatarOption.id === avatarId)) {
      return;
    }
    setAvatarId('');
  }, [availableAvatarOptions, avatarId]);

  useEffect(() => {
    if (!openPicker) return;

    const handleOutsideClick = (event: Event) => {
      const target = event.target as Node;
      const insideRacePicker = racePickerRef.current?.contains(target);
      const insideClassPicker = classPickerRef.current?.contains(target);
      if (!insideRacePicker && !insideClassPicker) {
        setOpenPicker(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenPicker(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openPicker]);

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
    const classId = classOptions.find((classOption) => classOption.name === characterClass)?.id ?? characterClass.toLowerCase();
    
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
    <div className={`${embedded ? 'w-full p-0' : 'retro-frame bg-brand-surface-elevated/95 border border-amber-700/35 rounded-2xl shadow-2xl max-w-md w-full p-4'} animate-slide-up`}>
      <h2 className="text-2xl font-bold text-brand-text-primary mb-1">Create Your Character</h2>
      <p className="text-sm text-brand-text-secondary mb-3">Begin your adventure without leaving the story.</p>
      
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor={nameInputId} className="block text-sm font-medium text-brand-text-primary mb-1">
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
            className="w-full bg-transparent border-0 border-b border-brand-surface-border/70 rounded-none px-1 py-1 text-lg tracking-wide text-brand-text-primary focus:outline-none focus:ring-0 focus:border-brand-accent-primary/80 transition-all disabled:opacity-60"
            autoFocus
            disabled={isSubmitting}
          />
          <p className="mt-0.5 text-xs text-brand-text-muted">{name.length}/50 characters</p>
        </div>

        <div>
          <label id={`${racePickerId}-label`} className="mb-1 block text-sm font-medium text-brand-text-primary">
            Race
          </label>
          <div ref={racePickerRef} className="relative">
            <button
              id={racePickerId}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={openPicker === 'race'}
              aria-controls={`${racePickerId}-listbox`}
              aria-labelledby={`${racePickerId}-label ${racePickerId}`}
              onClick={() => setOpenPicker((prev) => (prev === 'race' ? null : 'race'))}
              className="w-full rounded-xl border border-brand-surface-border/70 bg-brand-surface-secondary/35 px-3 py-2 text-left text-brand-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-200 hover:border-brand-surface-border/90 focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/45"
              disabled={isSubmitting}
            >
              <span className="flex items-center justify-between gap-3">
                <span>{race}</span>
                <svg className={`h-4 w-4 text-brand-text-muted transition-transform duration-200 ${openPicker === 'race' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </button>
            <div
              id={`${racePickerId}-listbox`}
              role="listbox"
              aria-labelledby={`${racePickerId}-label`}
              className={`absolute left-0 right-0 z-40 mt-2 origin-top overflow-hidden rounded-xl border border-brand-surface-border/80 bg-[linear-gradient(180deg,rgba(20,36,32,0.92)_0%,rgba(9,20,18,0.95)_100%)] shadow-[0_14px_30px_rgba(3,9,8,0.45)] transition-all duration-200 ${openPicker === 'race' ? 'max-h-56 scale-y-100 opacity-100' : 'pointer-events-none max-h-0 scale-y-95 opacity-0'}`}
            >
              <div className="h-1 bg-gradient-to-r from-transparent via-brand-accent-primary/40 to-transparent" />
              <div className="max-h-52 overflow-y-auto p-1.5">
                {raceOptions.map((raceOption) => {
                  const isSelected = raceOption.name === race;
                  return (
                    <button
                      key={raceOption.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setRace(raceOption.name);
                        setOpenPicker(null);
                        setError('');
                      }}
                      className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                        isSelected
                          ? 'bg-brand-accent-primary/20 text-brand-text-primary'
                          : 'text-brand-text-secondary hover:bg-brand-surface-hover/55 hover:text-brand-text-primary'
                      }`}
                      disabled={isSubmitting}
                    >
                      {raceOption.name}
                    </button>
                  );
                })}
              </div>
              <div className="h-1 bg-gradient-to-r from-transparent via-brand-accent-primary/25 to-transparent" />
            </div>
          </div>
        </div>

        <div>
          <label id={`${classPickerId}-label`} className="mb-1 block text-sm font-medium text-brand-text-primary">
            Class
          </label>
          <div ref={classPickerRef} className="relative">
            <button
              id={classPickerId}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={openPicker === 'class'}
              aria-controls={`${classPickerId}-listbox`}
              aria-labelledby={`${classPickerId}-label ${classPickerId}`}
              onClick={() => setOpenPicker((prev) => (prev === 'class' ? null : 'class'))}
              className="w-full rounded-xl border border-brand-surface-border/70 bg-brand-surface-secondary/35 px-3 py-2 text-left text-brand-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-200 hover:border-brand-surface-border/90 focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/45"
              disabled={isSubmitting}
            >
              <span className="flex items-center justify-between gap-3">
                <span>{characterClass}</span>
                <svg className={`h-4 w-4 text-brand-text-muted transition-transform duration-200 ${openPicker === 'class' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </button>
            <div
              id={`${classPickerId}-listbox`}
              role="listbox"
              aria-labelledby={`${classPickerId}-label`}
              className={`absolute left-0 right-0 z-40 mt-2 origin-top overflow-hidden rounded-xl border border-brand-surface-border/80 bg-[linear-gradient(180deg,rgba(20,36,32,0.92)_0%,rgba(9,20,18,0.95)_100%)] shadow-[0_14px_30px_rgba(3,9,8,0.45)] transition-all duration-200 ${openPicker === 'class' ? 'max-h-56 scale-y-100 opacity-100' : 'pointer-events-none max-h-0 scale-y-95 opacity-0'}`}
            >
              <div className="h-1 bg-gradient-to-r from-transparent via-brand-accent-primary/40 to-transparent" />
              <div className="max-h-52 overflow-y-auto p-1.5">
                {classOptions.map((classOption) => {
                  const isSelected = classOption.name === characterClass;
                  return (
                    <button
                      key={classOption.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setCharacterClass(classOption.name);
                        setOpenPicker(null);
                        setError('');
                      }}
                      className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                        isSelected
                          ? 'bg-brand-accent-primary/20 text-brand-text-primary'
                          : 'text-brand-text-secondary hover:bg-brand-surface-hover/55 hover:text-brand-text-primary'
                      }`}
                      disabled={isSubmitting}
                    >
                      {classOption.name}
                    </button>
                  );
                })}
              </div>
              <div className="h-1 bg-gradient-to-r from-transparent via-brand-accent-primary/25 to-transparent" />
            </div>
          </div>
        </div>

        <div>
          <p className="mb-1 block text-sm font-medium text-brand-text-primary">
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
                      : 'hover:scale-[1.08] hover:-translate-y-1 hover:shadow-[0_16px_28px_rgba(28,16,56,0.34)]'
                  }`}
                  aria-label={`Select ${avatarOption.label}`}
                  disabled={isSubmitting}
                >
                  <img
                    src={avatarOption.src}
                    alt={avatarOption.label}
                    className="h-20 w-full rounded-md object-cover object-center transition-all duration-200 group-hover:scale-[1.08]"
                  />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-brand-text-muted italic">No avatars available for this race yet.</p>
          )}
          {availableAvatarOptions.length > 0 && !avatarId && (
            <p className="mt-1 text-xs text-brand-text-muted">Select an avatar to continue.</p>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {onCancel && (
            <button
              type="button"
              onClick={() => { void handleCancel(); }}
              className="flex-1 rounded-xl border border-brand-surface-border/45 bg-brand-surface-elevated/55 px-3 py-1.5 text-sm font-medium text-brand-text-secondary backdrop-blur-md transition-all duration-200 hover:border-brand-surface-border/70 hover:bg-brand-surface-elevated/70 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
            >
              Quick
            </button>
          )}
          <button
            type="submit"
            className="flex-1 rounded-xl border border-brand-accent-primary/45 bg-brand-accent-primary/18 px-3 py-1.5 text-sm font-semibold text-brand-text-primary backdrop-blur-md transition-all duration-200 hover:border-brand-accent-primary/65 hover:bg-brand-accent-primary/26 disabled:cursor-not-allowed disabled:opacity-60"
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
