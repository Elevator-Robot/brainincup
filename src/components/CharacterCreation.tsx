import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { calculateFinalStats, getAllRaces, getAllClasses } from '../game';
import {
  getAvatarOptionsForRace,
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
  description: raceOption.description,
}));
const classOptions = getAllClasses().map((classOption) => ({
  id: classOption.id,
  name: classOption.name,
  description: classOption.description,
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
  const selectedRace = raceOptions.find(option => option.name === race)!;
  const selectedClass = classOptions.find(option => option.name === characterClass)!;
  const selectedAvatar = availableAvatarOptions.find(option => option.id === avatarId);
  const previewStats = useMemo(() => calculateFinalStats(selectedClass.id, selectedRace.id), [selectedClass.id, selectedRace.id]);

  const navigatePicker = (event: React.KeyboardEvent<HTMLDivElement>, picker: 'race' | 'class') => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setOpenPicker(null);
      document.getElementById(picker === 'race' ? racePickerId : classPickerId)?.focus();
      return;
    }
    if (openPicker !== picker) { setOpenPicker(picker); return; }
    const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
      : event.key === 'ArrowDown' ? (index + 1) % options.length : (index + options.length - 1) % options.length;
    options[next]?.focus();
  };

  useEffect(() => {
    if (avatarId && availableAvatarOptions.some((avatarOption) => avatarOption.id === avatarId)) {
      return;
    }
    setAvatarId('');
  }, [availableAvatarOptions, avatarId]);

  useEffect(() => {
    if (!openPicker) return;
    const picker = openPicker === 'race' ? racePickerRef.current : classPickerRef.current;
    const frame = requestAnimationFrame(() => picker?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());

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
      cancelAnimationFrame(frame);
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

    const selectedAvatarId = selectedAvatar?.id ?? '';
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
    <div className={`${embedded ? 'w-full p-0' : 'retro-frame bg-brand-surface-elevated/95 border border-amber-700/35 rounded-2xl shadow-2xl max-w-md w-full p-4'} ${!inline ? 'max-h-[calc(100dvh-2rem)] overflow-y-auto' : ''} gm-menu-content-reveal`}>
      
      <form onSubmit={handleSubmit} className="gm-character-form space-y-3">
        <div className="gm-character-preview">
          {selectedAvatar
            ? <img src={selectedAvatar.srcThumbnail} width="64" height="64" alt="Selected portrait" />
            : <span className="gm-portrait-placeholder" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="8" r="3" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg></span>}
          <div>{name.trim() && <strong>{name.trim()}</strong>}<span>{race} · {characterClass}</span></div>
        </div>
        <div>
          <label htmlFor={nameInputId} className="block text-sm font-medium text-brand-text-primary mb-1">
            Name
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
            aria-label="Character name"
            autoComplete="off"
            className="w-full bg-transparent border-0 border-b border-brand-surface-border/70 rounded-none px-1 py-1 text-lg tracking-wide text-brand-text-primary focus:outline-none focus:ring-0 focus:border-brand-accent-primary/80 transition-all disabled:opacity-60"
            autoFocus={typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches}
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label id={`${racePickerId}-label`} className="mb-1 block text-sm font-medium text-brand-text-primary">
            Race
          </label>
          <div ref={racePickerRef} className="relative" onKeyDown={event => navigatePicker(event, 'race')}>
            <button
              id={racePickerId}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={openPicker === 'race'}
              aria-controls={`${racePickerId}-listbox`}
              aria-labelledby={`${racePickerId}-label ${racePickerId}`}
              onClick={() => setOpenPicker((prev) => (prev === 'race' ? null : 'race'))}
              className="w-full rounded-xl border border-brand-surface-border/70 bg-brand-bg-secondary/70 px-3 py-2 text-left text-brand-text-primary shadow-[inset_0_1px_0_rgba(94,234,212,0.16)] transition-all duration-200 hover:border-brand-surface-border/90 hover:bg-brand-bg-tertiary/55 focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/45"
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
              aria-hidden={openPicker !== 'race'}
              aria-labelledby={`${racePickerId}-label`}
              className={`retro-dropdown absolute left-0 right-0 z-40 mt-2 origin-top overflow-hidden rounded-xl border border-brand-surface-border/80 shadow-glass-lg transition-all duration-200 ${openPicker === 'race' ? 'max-h-56 scale-y-100 opacity-100' : 'pointer-events-none max-h-0 scale-y-95 opacity-0'}`}
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
                      tabIndex={-1}
                      onClick={() => {
                        setRace(raceOption.name);
                        setOpenPicker(null);
                        setError('');
                        document.getElementById(racePickerId)?.focus();
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
          <p className="gm-choice-description">{selectedRace.description}</p>
        </div>

        <div>
          <label id={`${classPickerId}-label`} className="mb-1 block text-sm font-medium text-brand-text-primary">
            Class
          </label>
          <div ref={classPickerRef} className="relative" onKeyDown={event => navigatePicker(event, 'class')}>
            <button
              id={classPickerId}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={openPicker === 'class'}
              aria-controls={`${classPickerId}-listbox`}
              aria-labelledby={`${classPickerId}-label ${classPickerId}`}
              onClick={() => setOpenPicker((prev) => (prev === 'class' ? null : 'class'))}
              className="w-full rounded-xl border border-brand-surface-border/70 bg-brand-bg-secondary/70 px-3 py-2 text-left text-brand-text-primary shadow-[inset_0_1px_0_rgba(94,234,212,0.16)] transition-all duration-200 hover:border-brand-surface-border/90 hover:bg-brand-bg-tertiary/55 focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/45"
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
              aria-hidden={openPicker !== 'class'}
              aria-labelledby={`${classPickerId}-label`}
              className={`retro-dropdown absolute left-0 right-0 z-40 mt-2 origin-top overflow-hidden rounded-xl border border-brand-surface-border/80 shadow-glass-lg transition-all duration-200 ${openPicker === 'class' ? 'max-h-56 scale-y-100 opacity-100' : 'pointer-events-none max-h-0 scale-y-95 opacity-0'}`}
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
                      tabIndex={-1}
                      onClick={() => {
                        setCharacterClass(classOption.name);
                        setOpenPicker(null);
                        setError('');
                        document.getElementById(classPickerId)?.focus();
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
          <p className="gm-choice-description">{selectedClass.description}</p>
        </div>

        <dl className="gm-build-stats" aria-label="Starting attributes">
          {Object.entries(previewStats).map(([stat, value]) => <div key={stat}>
            <dt title={stat}>{stat.slice(0, 3).toUpperCase()}</dt><dd>{value}</dd>
          </div>)}
        </dl>

        <div>
          <p className="mb-1 block text-sm font-medium text-brand-text-primary">
            Portrait
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
                  className="gm-avatar-card"
                  aria-label={`Select ${avatarOption.label}`}
                  aria-pressed={avatarOption.id === avatarId}
                  disabled={isSubmitting}
                >
                  <img
                    src={avatarOption.srcThumbnail}
                    width="96" height="80"
                    alt={avatarOption.label}
                    loading="lazy"
                    decoding="async"
                    className="h-20 w-full rounded-md object-cover object-center"
                  />
                  {avatarOption.id === avatarId && <span className="gm-avatar-check" aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-brand-text-muted italic">No avatars available for this race yet.</p>
          )}
          {availableAvatarOptions.length > 0 && !avatarId && (
            <p className="mt-1 text-xs text-brand-text-muted">Select an avatar to continue.</p>
          )}
          {availableAvatarOptions.length > 1 && <button type="button" className="gm-shuffle-portrait" disabled={isSubmitting}
            onClick={() => {
              const options = availableAvatarOptions.filter(option => option.id !== avatarId);
              setAvatarId(options[Math.floor(Math.random() * options.length)].id);
              setError('');
            }}>
            Shuffle portrait
          </button>}
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2">
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
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="flex-1 rounded-xl border border-brand-accent-primary/45 bg-brand-accent-primary/18 px-3 py-1.5 text-sm font-semibold text-brand-text-primary backdrop-blur-md transition-all duration-200 hover:border-brand-accent-primary/65 hover:bg-brand-accent-primary/26 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting || !name.trim() || (availableAvatarOptions.length > 0 && !selectedAvatar)}
          >
            {isSubmitting ? 'Starting…' : 'Begin adventure'}
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
