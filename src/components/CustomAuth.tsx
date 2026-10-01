import { createContext, useContext, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import { I18n } from 'aws-amplify/utils';
import { authServices } from '../utils/authServices';
import '@aws-amplify/ui-react/styles.css';
import './auth.css';

I18n.putVocabularies({ en: {
  'Sign In with Google': 'Continue with Google',
  'Sign in': 'Sign in / Create account',
} });

const EmailOptions = createContext<{ expanded: boolean; setExpanded: (value: boolean) => void } | null>(null);

function AuthIntro() {
  const { route } = useAuthenticator(context => [context.route]);
  if (route !== 'signIn' && route !== 'confirmSignUp') return null;
  return <header className="bic-auth-intro">
    {route === 'signIn'
      ? <h2 className="bic-auth-wordmark"><span>Brain</span> in Cup</h2>
      : <h2>Check your inbox.</h2>}
  </header>;
}

function EmailSignInFooter() {
  const options = useContext(EmailOptions);
  if (!options) throw new Error('Email options provider is required.');
  const { expanded, setExpanded } = options;
  const { error, isPending, toForgotPassword } = useAuthenticator(context => [context.error, context.isPending]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusRequested = useRef(false);
  const fieldsId = useId();
  useEffect(() => { if (error) setExpanded(true); }, [error, setExpanded]);
  useEffect(() => {
    const form = buttonRef.current?.closest('form');
    const fields = form?.querySelector('fieldset');
    if (fields) fields.id = fieldsId;
    if (expanded && focusRequested.current) {
      form?.querySelector<HTMLInputElement>('input[name="username"]')?.focus();
      focusRequested.current = false;
    }
  }, [expanded, fieldsId]);
  return <div className="bic-auth-email-footer">
    {expanded && <button type="button" disabled={isPending} onClick={toForgotPassword}
      className="amplify-button amplify-button--link bic-auth-glass-secondary">
      <span className="bic-auth-label-long">Forgot your password?</span>
      <span className="bic-auth-label-short">Forgot password?</span>
    </button>}
    <button ref={buttonRef} type="button" disabled={isPending} aria-expanded={expanded} aria-controls={fieldsId}
      aria-label={expanded ? 'Back to sign-in options' : 'Continue with email'}
      className={`bic-auth-email-toggle ${expanded ? 'bic-auth-glass-secondary' : ''}`}
      onClick={() => { focusRequested.current = !expanded; setExpanded(!expanded); }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {expanded ? <path d="m12 19-7-7 7-7M5 12h14" /> : <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>}
      </svg>
      {expanded ? <><span className="bic-auth-label-long">Back to sign-in options</span><span className="bic-auth-label-short">Other options</span></> : 'Continue with email'}
    </button>
  </div>;
}

function ConfirmationCodeHeader() {
  const [code, setCode] = useState(Array<string>(6).fill(''));
  const { updateForm, isPending } = useAuthenticator(context => [context.isPending]);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const update = (next: string[]) => {
    setCode(next);
    updateForm({ name: 'confirmation_code', value: next.join('') });
    // Amplify's native input is uncontrolled and still participates in native
    // required-field validation even though the six-digit UI replaces it.
    const nativeInput = inputs.current[0]?.closest('form')?.querySelector<HTMLInputElement>('input[name="confirmation_code"]');
    if (nativeInput) nativeInput.value = next.join('');
  };
  return <div className="bic-confirmation-panel">
    <p>Enter the 6-digit code we sent to your email.</p>
    <div className="bic-confirmation-grid">
      {code.map((digit, index) => <input key={index} ref={node => { inputs.current[index] = node; }}
        aria-label={`Confirmation code digit ${index + 1}`} className="bic-confirmation-input"
        inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'} disabled={isPending}
        value={digit} onChange={event => {
          const digits = event.target.value.replace(/\D/g, '');
          if (digits.length > 1) {
            update(Array.from({ length: 6 }, (_, i) => digits[i] || ''));
            inputs.current[Math.min(digits.length, 6) - 1]?.focus();
          } else {
            update(code.map((value, i) => i === index ? digits : value));
            if (digits && index < 5) inputs.current[index + 1]?.focus();
          }
        }} onKeyDown={event => {
          if (event.key === 'Backspace' && !digit && index > 0) inputs.current[index - 1]?.focus();
        }} onPaste={event => {
          event.preventDefault();
          const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
          if (!digits) return;
          update(Array.from({ length: 6 }, (_, i) => digits[i] || ''));
          inputs.current[digits.length - 1]?.focus();
        }} />)}
    </div>
  </div>;
}

function AuthSuccess({ onComplete }: { onComplete: () => void }) {
  const completed = useRef(false);
  useEffect(() => {
    if (!completed.current) { completed.current = true; onComplete(); }
  }, [onComplete]);
  return <p role="status">Signing you in…</p>;
}

function AuthArtwork() {
  const brainRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const brain = brainRef.current;
    const video = videoRef.current;
    const card = brain?.closest<HTMLElement>('.bic-auth-card');
    if (!brain || !video || !card) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const bounds = card.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        brain.style.transform = `perspective(1000px) translate3d(${x * 48}px, ${y * 32}px, 0) rotateX(${-y * 8}deg) rotateY(${x * 12}deg) rotateZ(${x * 2}deg) scale(1.04)`;
        video.style.transform = `translate3d(${-x * 1.5}%, ${-y * 1.5}%, 0) scale(1.06)`;
      });
    };
    const reset = () => {
      cancelAnimationFrame(frame);
      brain.style.transform = '';
      video.style.transform = '';
    };
    card.addEventListener('pointermove', move);
    card.addEventListener('pointerleave', reset);
    card.addEventListener('pointercancel', reset);
    window.addEventListener('blur', reset);
    return () => {
      cancelAnimationFrame(frame);
      card.removeEventListener('pointermove', move);
      card.removeEventListener('pointerleave', reset);
      card.removeEventListener('pointercancel', reset);
      window.removeEventListener('blur', reset);
    };
  }, []);
  return <div className="bic-auth-art" aria-hidden="true">
    <video ref={videoRef} className="bic-auth-video" src="/images/login-background.mp4" autoPlay muted loop playsInline preload="auto" />
    <img ref={brainRef} className="bic-auth-brain" src="/images/login-brain.png" width="1672" height="941" alt="" />
  </div>;
}

function AuthModal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const [viewport, setViewport] = useState(() => ({
    height: window.visualViewport?.height ?? window.innerHeight,
    top: window.visualViewport?.offsetTop ?? 0,
    width: window.innerWidth,
  }));
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const visualViewport = window.visualViewport;
    const update = () => setViewport({ height: visualViewport?.height ?? window.innerHeight, top: visualViewport?.offsetTop ?? 0, width: window.innerWidth });
    window.addEventListener('resize', update);
    visualViewport?.addEventListener('resize', update);
    visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      visualViewport?.removeEventListener('resize', update);
      visualViewport?.removeEventListener('scroll', update);
    };
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
    (controls()[0] || dialog).focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const items = controls();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener('keydown', handleKey);
    return () => { dialog.removeEventListener('keydown', handleKey); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Sign in to Brain in Cup" tabIndex={-1}
    className="bic-auth-overlay" style={{ '--auth-viewport-height': `${viewport.height}px`, '--auth-viewport-top': `${viewport.top}px` } as CSSProperties}>
    <div className="bic-auth-card" data-compact={viewport.width <= 1024 || viewport.height <= 560 || undefined}>
      <button type="button" className="bic-auth-close" aria-label="Close sign-in" onClick={onClose}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
      </button>
      <AuthArtwork />
      <section className="bic-auth-sheet" aria-label="Account access"><div className="bic-auth-content"><div className="bic-auth-form-rail"><div className="bic-auth-panel">{children}</div></div></div></section>
    </div>
  </div>;
}

function AuthFlow({ onAuthSuccess }: { onAuthSuccess: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return <EmailOptions.Provider value={{ expanded, setExpanded }}>
    <div className="bic-auth-methods" data-email-expanded={expanded}>
      <Authenticator hideSignUp loginMechanisms={['email']} socialProviders={['google']} services={authServices}
        components={{ Header: AuthIntro, SignIn: { Footer: EmailSignInFooter }, ConfirmSignUp: { Header: ConfirmationCodeHeader } }}
        formFields={{ signIn: { username: { label: 'Email', placeholder: 'you@example.com' } }, confirmSignUp: { confirmation_code: { labelHidden: true } } }}>
        {() => <AuthSuccess onComplete={onAuthSuccess} />}
      </Authenticator>
    </div>
  </EmailOptions.Provider>;
}

export default function CustomAuth({ onAuthSuccess }: { onAuthSuccess: () => void }) {
  const [open, setOpen] = useState(true);
  return <main className="bic-auth-landing">
    {!open && <div className="bic-auth-welcome"><h1 className="bic-auth-wordmark"><span>Brain</span> in Cup</h1><button className="bic-auth-email-toggle" onClick={() => setOpen(true)}>Sign in / Create account</button></div>}
    {open && <AuthModal onClose={() => setOpen(false)}><AuthFlow onAuthSuccess={onAuthSuccess} /></AuthModal>}
  </main>;
}
