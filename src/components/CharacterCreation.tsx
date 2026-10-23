import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { calculateDerivedStats, calculateFinalStats, getAllClasses, getAllRaces, type Stats } from '../game';
import { getAvatarOptionsForRace } from '../constants/gameMasterAvatars';
import CreationGlyph from './creation/CreationGlyph';

export interface CharacterCreationInput extends Stats {
  name: string;
  race: string;
  characterClass: string;
  avatarId: string;
}
interface CharacterCreationProps {
  onComplete: (character: CharacterCreationInput) => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
  inline?: boolean;
  embedded?: boolean;
}

const races = getAllRaces();
const classes = getAllClasses();
const STEPS = [
  { label: 'Race', title: 'Where does your story begin?', hint: 'Choose a race. Discover the faces within it.', next: 'Choose your calling', icon: 'person' },
  { label: 'Calling', title: 'How will you meet the world?', hint: 'Steel, shadows, or something beyond.', next: 'Bring them to life', icon: 'fighter' },
  { label: 'Identity', title: 'Every legend needs a name.', hint: 'Your choices are made. Your story is not.', next: 'Begin adventure', icon: 'pack' },
];
const CLASS_FLAVOR: Record<string, string> = {
  fighter: 'Steel & resolve', wizard: 'Arcane mastery', rogue: 'From the shadows', cleric: 'Faith & restoration',
  ranger: 'The wild calls', paladin: 'An oath unbroken', barbarian: 'Unleashed fury', bard: 'Words become magic',
  druid: 'Nature answers', monk: 'Body & spirit', sorcerer: 'Magic in the blood', warlock: 'A pact of power', wanderer: 'The road is yours',
};

export default function CharacterCreation({ onComplete, onCancel, inline = false, embedded = false }: CharacterCreationProps) {
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [raceId, setRaceId] = useState<string | null>('terran');
  const [classId, setClassId] = useState<string | null>(null);
  const [avatarId, setAvatarId] = useState('terran-01');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'creating' | 'cancelling' | null>(null);
  const locked = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const selectedRace = races.find(race => race.id === raceId);
  const selectedClass = classes.find(profession => profession.id === classId);
  const portraits = useMemo(() => getAvatarOptionsForRace(selectedRace?.name), [selectedRace?.name]);
  const selectedPortrait = portraits.find(portrait => portrait.id === avatarId);
  const stats = useMemo(() => classId && raceId ? calculateFinalStats(classId, raceId) : null, [classId, raceId]);
  const derived = useMemo(() => stats && classId ? calculateDerivedStats(stats, classId, 1) : null, [stats, classId]);
  const portraitReady = Boolean(selectedRace) && (portraits.length === 0 || Boolean(selectedPortrait));
  const current = STEPS[step];

  useEffect(() => {
    if (inline) return;
    const dialog = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    return () => {
      if (typeof dialog.close === 'function') dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [inline]);

  useEffect(() => {
    panelRef.current?.scrollTo?.({ top: 0 });
    bodyRef.current?.scrollTo?.({ top: 0 });
    const frame = requestAnimationFrame(() => {
      const finePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
      if (step === 2 && finePointer) nameRef.current?.focus({ preventScroll: true });
      else headingRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);

  const goTo = (next: number) => {
    if (locked.current || (next > 0 && !portraitReady) || (next > 1 && !selectedClass)) return;
    setError('');
    setFurthest(value => Math.max(value, next));
    setStep(next);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (locked.current) return;
    if (step < 2) { goTo(step + 1); return; }
    if (!name.trim()) { setError('Give your character a name.'); nameRef.current?.focus(); return; }
    if (name.trim().length > 50) { setError('Choose a name of 50 characters or fewer.'); return; }
    if (!portraitReady || !selectedRace) { setError('Choose a race and portrait before beginning.'); setStep(0); return; }
    if (!selectedClass || !stats) { setError('Choose your calling before beginning.'); setStep(1); return; }
    locked.current = true;
    setBusy('creating');
    setError('');
    try {
      await onComplete({ name: name.trim(), race: selectedRace.name, characterClass: selectedClass.name, avatarId: selectedPortrait?.id ?? '', ...stats });
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? `Your adventure could not begin: ${cause.message}` : 'Your adventure could not begin. Try again.');
    } finally {
      locked.current = false;
      setBusy(null);
    }
  };
  const cancel = async () => {
    if (!onCancel || locked.current) return;
    locked.current = true;
    setBusy('cancelling');
    setError('');
    try { await onCancel(); }
    catch { setError('Unable to leave character creation. Please try again.'); }
    finally { locked.current = false; setBusy(null); }
  };

  const content = <form className={`forge-shell ${embedded ? 'forge-shell--embedded' : ''}`} onSubmit={submit}
    aria-busy={Boolean(busy)} data-character-creation data-step={current.label.toLowerCase()}>
    <header className="forge-top">
      <div className="forge-brand"><span>A new adventure</span><h1 id={`${id}-title`}>Forge your legend</h1></div>
      <nav aria-label="Character creation steps"><ol className="forge-steps">
        {STEPS.map((item, index) => <li key={item.label} data-current={step === index} data-complete={index < step}>
          <button type="button" aria-label={`Step ${index + 1}: ${item.label}`} aria-current={step === index ? 'step' : undefined}
            disabled={Boolean(busy) || index > furthest || (index > 0 && !portraitReady) || (index > 1 && !selectedClass)} onClick={() => goTo(index)}>
            <span className="forge-step-symbol"><CreationGlyph kind={index < step ? 'check' : item.icon} /></span>
            <span>{item.label}</span>
          </button>
        </li>)}
      </ol></nav>
      {onCancel && <button type="button" className="forge-close" aria-label="Cancel character creation" disabled={Boolean(busy)}
        onClick={() => { void cancel(); }}><CreationGlyph kind="close" /></button>}
    </header>

    <div ref={bodyRef} className="forge-body">
      <section className="forge-hero" aria-label="Character preview">
        {selectedPortrait ? <img key={selectedPortrait.id} className="forge-hero-art" src={selectedPortrait.src}
          width="1024" height="1536" alt="Character portrait preview" decoding="async" />
          : <div className="forge-hero-silhouette"><CreationGlyph kind="person" /></div>}
        <div className="forge-hero-atmosphere" aria-hidden="true" />
        <div className="forge-hero-name">
          {selectedClass && <span className="forge-calling-sign" title={`${selectedClass.name} calling`}><CreationGlyph kind={selectedClass.id} /></span>}
          {(selectedRace || selectedClass) && <p>{selectedRace?.name}{selectedRace && selectedClass && <span>·</span>}{selectedClass?.name}</p>}
          <h2>{name.trim() || 'An unwritten legend'}</h2>
          {derived && selectedRace && <div className="forge-vitals">
            <span><CreationGlyph kind="heart" /><strong>{derived.maxHP}</strong><abbr title="Hit points">HP</abbr></span>
            <span><CreationGlyph kind="shield" /><strong>{derived.armorClass}</strong><abbr title="Armor class">AC</abbr></span>
            <span><CreationGlyph kind="speed" /><strong>{selectedRace.speed}</strong><abbr title="Movement in feet">FT</abbr></span>
          </div>}
        </div>
      </section>

      <div ref={panelRef} className="forge-panel">
        <div className="forge-panel-heading"><span className="forge-eyebrow">Chapter 0{step + 1} <span>/</span> {current.label}</span>
          <h2 ref={headingRef} tabIndex={-1}>{current.title}</h2><p>{current.hint}</p></div>
        <fieldset disabled={Boolean(busy)} className="forge-choices" key={step}>
          <legend className="sr-only">{current.label}</legend>
          {step === 0 && <>
            <div className="forge-race-picker">
              {races.map(race => {
                const art = getAvatarOptionsForRace(race.name)[0] ?? getAvatarOptionsForRace('Orc')[0];
                return <button key={race.id} type="button" className="forge-race-choice" aria-label={`Select ${race.name} race`}
                  aria-pressed={race.id === raceId} onClick={() => { if (raceId !== race.id) { setRaceId(race.id); setAvatarId(''); } setError(''); }}>
                  <img src={art.srcMedium} width="133" height="200" alt="" loading="lazy" />
                  <span className="forge-choice-check"><CreationGlyph kind="check" /></span>
                  <span>{race.name}</span>
                </button>;
              })}
            </div>
            {selectedRace ? <section className="forge-race-options" aria-label={`${selectedRace.name} portraits`}>
              <div className="forge-race-options-heading"><h3>{selectedRace.name} portraits</h3><span>{portraits.length || 'Coming soon'}</span></div>
              {portraits.length ? <div className="forge-portraits">{portraits.map(portrait => <button key={portrait.id} type="button"
                className="forge-portrait-option" aria-label={`Select ${portrait.label}`} aria-pressed={portrait.id === avatarId}
                onClick={() => { setAvatarId(portrait.id); setError(''); }}>
                <img src={portrait.srcMedium} width="133" height="200" alt={portrait.label} loading="lazy" />
                <span className="forge-choice-check"><CreationGlyph kind="check" /></span>
              </button>)}</div> : <div className="forge-no-portraits"><CreationGlyph kind="person" /><p>A face not yet painted.</p>
                <span>No portraits for this race yet. Your adventure can still begin.</span></div>}
              <p className="forge-selection-hint">{portraitReady ? (selectedPortrait ? 'Your portrait is chosen.' : 'Your legend is yours to imagine.') : 'Choose one portrait to continue.'}</p>
              <div className="forge-selection-detail"><p>{selectedRace.description}</p>
                <ul className="forge-traits">{selectedRace.traits.map(trait => <li key={trait}><CreationGlyph kind="spark" />{trait}</li>)}</ul>
              </div>
            </section> : <div className="forge-race-empty"><CreationGlyph kind="person" /><p>Choose a race to reveal their portraits.</p></div>}
          </>}
          {step === 1 && <>
            <div className="forge-callings">{classes.map(profession => <button key={profession.id} type="button"
              className="forge-calling" aria-label={`Select ${profession.name} calling`} aria-pressed={classId === profession.id}
              onClick={() => { setClassId(profession.id); setError(''); }}>
              <CreationGlyph kind={profession.id} /><strong>{profession.name}</strong><span>{CLASS_FLAVOR[profession.id]}</span>
            </button>)}</div>
            {selectedClass && <div className="forge-selection-detail"><h3>{selectedClass.name}</h3><p>{selectedClass.description}</p>
              <ul className="forge-traits"><li><CreationGlyph kind={selectedClass.primaryStat} />{selectedClass.primaryStat}</li>
                <li><CreationGlyph kind="heart" />d{selectedClass.hitDieSize} hit die</li></ul>
            </div>}
          </>}
          {step === 2 && selectedClass && stats && <div className="forge-identity">
            <label htmlFor={`${id}-name`}>What will they call you?</label>
            <input ref={nameRef} id={`${id}-name`} value={name} maxLength={50} autoComplete="off" aria-label="Character name"
              placeholder="Your name…" onChange={event => { setName(event.target.value); setError(''); }} />
            <div className="forge-build-heading"><h3>Your starting attributes</h3></div>
            <dl className="forge-stats" aria-label="Starting attributes">{Object.entries(stats).map(([stat, value]) => <div key={stat} data-primary={stat === selectedClass.primaryStat}>
              <dt><CreationGlyph kind={stat} /><abbr title={stat}>{stat.slice(0, 3)}</abbr></dt><dd>{value}</dd>
              <span className="forge-stat-track" aria-hidden="true"><i style={{ '--stat-fill': `${value / 20 * 100}%` } as CSSProperties} /></span>
            </div>)}</dl>
            <h3 className="forge-kit-heading">Your starting kit</h3><ul className="forge-kit">{selectedClass.startingEquipment.map(item => <li key={item}>
              <CreationGlyph kind={/sword|dagger|axe|bow|rapier/i.test(item) ? 'fighter' : /armor|mail|shield/i.test(item) ? 'shield' : 'pack'} />{item}
            </li>)}</ul>
            <p className="forge-identity-note"><CreationGlyph kind="spark" />The rest is waiting to be written.</p>
          </div>}
        </fieldset>
        {error && <p className="forge-error" role="alert">{error}</p>}
      </div>
    </div>

    <footer className="forge-footer">
      <button type="button" className="forge-back" disabled={step === 0 || Boolean(busy)} onClick={() => goTo(step - 1)}><CreationGlyph kind="back" />Back</button>
      <span className="forge-step-count" aria-hidden="true">0{step + 1} <span>/ 0{STEPS.length}</span></span>
      {step < 2 ? <button type="button" className="forge-next" disabled={Boolean(busy) || !portraitReady || (step === 1 && !selectedClass)} onClick={() => goTo(step + 1)}>
        {current.next}<CreationGlyph kind="arrow" /></button>
        : <button type="submit" className="forge-next forge-begin" disabled={Boolean(busy) || !name.trim() || !portraitReady || !selectedClass}>
          <CreationGlyph kind={busy === 'creating' ? 'spark' : 'check'} />{busy === 'creating' ? 'Creating your legend…' : current.next}<CreationGlyph kind="arrow" />
        </button>}
    </footer>
  </form>;

  return inline ? <section className="forge-inline" aria-labelledby={`${id}-title`}>{content}</section>
    : <dialog ref={dialogRef} className="forge-dialog" aria-labelledby={`${id}-title`} aria-modal="true"
      onCancel={event => event.preventDefault()} onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]')]
          .filter(control => control.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); headingRef.current?.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>{content}</dialog>;
}
