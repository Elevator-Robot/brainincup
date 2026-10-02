import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import AccountMenu from '../AccountMenu';
import DeleteAccountModal from '../DeleteAccountModal';

// jsdom has the element but not the browser's top-layer dialog methods.
const dialogMethods = ['showModal', 'close'] as const;
const originalMethods = dialogMethods.map(name => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name));
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } });
});
afterAll(() => dialogMethods.forEach((name, index) => {
  const descriptor = originalMethods[index];
  if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
}));

describe('account menu', () => {
  it('keeps deletion inside settings and restores focus when going back', () => {
    const onDeleteAccount = vi.fn();
    render(<AccountMenu displayName="Test user" email="test@example.com" onSignOut={vi.fn()} onDeleteAccount={onDeleteAccount}><button>Clear chat</button></AccountMenu>);
    expect(screen.queryByRole('button', { name: /delete account/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Account settings' }));
    expect(screen.getByRole('heading', { name: 'Account settings' })).toHaveFocus();
    expect(onDeleteAccount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account…' }));
    expect(onDeleteAccount).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Back to menu' }));
    expect(screen.queryByRole('button', { name: /delete account/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Account settings' })).toHaveFocus();
  });
});

describe('account deletion confirmation', () => {
  it('requires exact confirmation and prevents a second request while deleting', () => {
    const onConfirm = vi.fn();
    const props = { isOpen: true, isDeleting: false, error: null, onClose: vi.fn(), onConfirm };
    const { rerender } = render(<DeleteAccountModal {...props} />);
    const confirm = screen.getByRole('button', { name: 'Delete account' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'delete' } });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    rerender(<DeleteAccountModal {...props} isDeleting />);
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('clears confirmation after cancellation and reopening', () => {
    const props = { isOpen: true, isDeleting: false, error: null, onClose: vi.fn(), onConfirm: vi.fn() };
    const { rerender } = render(<DeleteAccountModal {...props} />);
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
    rerender(<DeleteAccountModal {...props} isOpen={false} />);
    rerender(<DeleteAccountModal {...props} />);
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeDisabled();
  });
});
