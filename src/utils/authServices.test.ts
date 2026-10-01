import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmSignUp, resendSignUpCode, signIn, signUp } from 'aws-amplify/auth';
import { authServices } from './authServices';

vi.mock('aws-amplify/auth', () => ({ signIn: vi.fn(), signUp: vi.fn(), confirmSignUp: vi.fn(), resendSignUpCode: vi.fn() }));
const failure = (name: string) => Object.assign(new Error(name), { name });
const credentials = { username: ' TEST@example.com ', password: 'Example-password1!' };

describe('login service integration', () => {
  beforeEach(() => vi.resetAllMocks());

  it('normalizes email and passes through incomplete sign-in steps', async () => {
    const result = { isSignedIn: false, nextStep: { signInStep: 'CONFIRM_SIGN_UP' as const } };
    vi.mocked(signIn).mockResolvedValue(result);
    expect(await authServices.handleSignIn(credentials)).toEqual(result);
    expect(signIn).toHaveBeenCalledWith({ username: 'test@example.com', password: credentials.password });
    expect(signUp).not.toHaveBeenCalled();
  });

  it('deduplicates account creation and enables auto sign-in after verification', async () => {
    vi.mocked(signIn).mockRejectedValue(failure('UserNotFoundException'));
    vi.mocked(signUp).mockResolvedValue({ isSignUpComplete: false, nextStep: { signUpStep: 'CONFIRM_SIGN_UP', codeDeliveryDetails: {} } });
    const first = authServices.handleSignIn(credentials);
    expect(authServices.handleSignIn(credentials)).toBe(first);
    expect(await first).toEqual({ isSignedIn: false, nextStep: { signInStep: 'CONFIRM_SIGN_UP' } });
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(signUp).toHaveBeenCalledWith({ username: 'test@example.com', password: credentials.password,
      options: { autoSignIn: true, userAttributes: { email: 'test@example.com', nickname: 'test' } } });
    await authServices.handleResendSignUpCode({ username: credentials.username });
    expect(resendSignUpCode).not.toHaveBeenCalled();
    vi.mocked(resendSignUpCode).mockResolvedValue({});
    await authServices.handleResendSignUpCode({ username: credentials.username });
    expect(resendSignUpCode).toHaveBeenCalledWith({ username: 'test@example.com' });
  });

  it('keeps wrong-password errors actionable for existing accounts', async () => {
    vi.mocked(signIn).mockRejectedValue(failure('NotAuthorizedException'));
    vi.mocked(signUp).mockRejectedValue(failure('UsernameExistsException'));
    await expect(authServices.handleSignIn(credentials)).rejects.toThrow('Incorrect email or password');
    vi.mocked(signIn).mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } });
    await expect(authServices.handleSignIn(credentials)).resolves.toMatchObject({ isSignedIn: true });
  });

  it('does not attempt account creation for network errors', async () => {
    vi.mocked(signIn).mockRejectedValue(failure('NetworkError'));
    await expect(authServices.handleSignIn(credentials)).rejects.toThrow('Check your connection');
    expect(signUp).not.toHaveBeenCalled();
  });

  it('returns the confirmation result so Amplify can complete auto sign-in', async () => {
    const result = { isSignUpComplete: true, nextStep: { signUpStep: 'COMPLETE_AUTO_SIGN_IN' as const } };
    vi.mocked(confirmSignUp).mockResolvedValue(result);
    const first = authServices.handleConfirmSignUp({ username: credentials.username, confirmationCode: '123456' });
    expect(authServices.handleConfirmSignUp({ username: credentials.username, confirmationCode: '123456' })).toBe(first);
    expect(await first).toEqual(result);
    expect(confirmSignUp).toHaveBeenCalledWith({ username: 'test@example.com', confirmationCode: '123456' });
    expect(confirmSignUp).toHaveBeenCalledTimes(1);
  });
});
