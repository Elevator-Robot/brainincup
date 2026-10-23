const LOGIN_PENDING_KEY = 'brain-in-cup:login-pending';
const MAX_LOGIN_AGE_MS = 30 * 60_000;
function hasOAuthCallback() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('code') && params.has('state');
}
// Retain only the fact of a callback, never its authorization code or state.
let oauthReturnPending = hasOAuthCallback();

/** Survive an OAuth navigation without remembering an old adventure or user ID. */
export function rememberBrainLogin() {
  try { sessionStorage.setItem(LOGIN_PENDING_KEY, String(Date.now())); } catch { /* The auth gate also keeps an in-memory flag. */ }
}

export function consumeBrainLogin(): boolean {
  const fromOAuth = oauthReturnPending;
  oauthReturnPending = false;
  try {
    const value = sessionStorage.getItem(LOGIN_PENDING_KEY);
    sessionStorage.removeItem(LOGIN_PENDING_KEY);
    if (!value) return fromOAuth;
    const age = Date.now() - Number(value);
    return fromOAuth || (Number.isFinite(age) && age >= 0 && age <= MAX_LOGIN_AGE_MS);
  } catch { return fromOAuth; }
}
