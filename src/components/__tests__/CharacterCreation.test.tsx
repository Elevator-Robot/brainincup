import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CharacterCreation from '../CharacterCreation';
import { calculateFinalStats } from '../../game';

afterEach(cleanup);

function toIdentity() {
  fireEvent.click(screen.getByRole('button', { name: 'Select Terran race' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select Terran 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Choose your calling' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select Wanderer calling' }));
  fireEvent.click(screen.getByRole('button', { name: 'Bring them to life' }));
}

describe('gamified character creation', () => {
  it('preselects Terran 1 without inventing a calling or showing a level', () => {
    const { container } = render(<CharacterCreation inline embedded onComplete={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Where does your story begin?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select Terran race' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Select Terran 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { name: / race$/ })).toHaveLength(7);
    expect(container.querySelector('select, aside, .retro-shell-right')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByAltText('Character portrait preview')).toHaveAttribute('src', '/images/avatars/terran-01.webp');
    const preview = screen.getByRole('region', { name: 'Character preview' });
    expect(preview).toHaveTextContent('Terran');
    expect(preview).not.toHaveTextContent('Wanderer');
    expect(preview.querySelector('.forge-vitals, .forge-level, .forge-calling-sign')).toBeNull();
    expect(screen.queryByText(/level 1/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose your calling' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Step 3: Identity' })).toBeDisabled();
  });

  it('builds and submits a character with the canonical game stats', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(<CharacterCreation inline embedded onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select Elvin race' }));
    expect(screen.getByRole('region', { name: 'Elvin portraits' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select Terran 1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Select Elvin 2' }));
    expect(screen.getByAltText('Character portrait preview')).toHaveAttribute('src', '/images/avatars/elvin-02.webp');
    fireEvent.click(screen.getByRole('button', { name: 'Choose your calling' }));
    expect(screen.getByRole('button', { name: 'Bring them to life' })).toBeDisabled();
    expect(within(screen.getByRole('region', { name: 'Character preview' })).queryByText(/Wizard|Wanderer/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Select Wizard calling' }));
    expect(screen.getByTitle('Wizard calling')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select Wizard calling' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Bring them to life' }));
    expect(screen.getByRole('button', { name: 'Begin adventure' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Character name' }), { target: { value: '  Lyra  ' } });
    expect(screen.getByText('Spellbook')).toBeInTheDocument();
    expect(screen.getByTitle('intelligence').parentElement?.parentElement?.querySelector('dd')).toHaveTextContent('14');
    fireEvent.click(screen.getByRole('button', { name: 'Begin adventure' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledExactlyOnceWith({
      name: 'Lyra', race: 'Elvin', characterClass: 'Wizard', avatarId: 'elvin-02', ...calculateFinalStats('wizard', 'elvin'),
    }));
  });

  it('requires a race and portrait before moving forward and never submits early', () => {
    const onComplete = vi.fn();
    const { container } = render(<CharacterCreation inline embedded onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select Elvin race' }));
    expect(screen.getByRole('button', { name: 'Choose your calling' })).toBeDisabled();
    fireEvent.submit(container.querySelector('form')!);
    expect(screen.getByRole('heading', { name: 'Where does your story begin?' })).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('preserves a draft when moving back, but clears a portrait when ancestry changes', () => {
    render(<CharacterCreation inline embedded onComplete={vi.fn()} />);
    toIdentity();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Lyra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Select Wanderer calling' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Bring them to life' }));
    expect(screen.getByRole('textbox')).toHaveValue('Lyra');
    fireEvent.click(screen.getByRole('button', { name: 'Step 1: Race' }));
    expect(screen.getByRole('button', { name: 'Select Terran 1' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Select Goblin race' }));
    expect(screen.getByRole('button', { name: 'Step 3: Identity' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Select Goblin 1' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Choose your calling' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Select Terran 1' })).toBeNull();
  });

  it('does not block an ancestry whose portraits are not yet available', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(<CharacterCreation inline embedded onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select Half-Orc race' }));
    expect(screen.getByText('A face not yet painted.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose your calling' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Choose your calling' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Wanderer calling' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bring them to life' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Kael' } });
    fireEvent.click(screen.getByRole('button', { name: 'Begin adventure' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledExactlyOnceWith({
      name: 'Kael', race: 'Half-Orc', characterClass: 'Wanderer', avatarId: '', ...calculateFinalStats('wanderer', 'halfOrc'),
    }));
  });

  it('locks the whole journey during save and prevents duplicate submission', async () => {
    let resolve!: () => void;
    const onComplete = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    const onCancel = vi.fn();
    const { container } = render(<CharacterCreation inline embedded onComplete={onComplete} onCancel={onCancel} />);
    toIdentity();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Lyra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Begin adventure' }));
    fireEvent.submit(container.querySelector('form')!);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Creating your legend…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel character creation' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Step 1: Race' })).toBeDisabled();
    expect(onCancel).not.toHaveBeenCalled();
    resolve();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Begin adventure' })).not.toBeDisabled());
  });

  it('keeps choices after a failed save and permits retry', async () => {
    const onComplete = vi.fn().mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValue(undefined);
    render(<CharacterCreation inline embedded onComplete={onComplete} />);
    toIdentity();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Lyra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Begin adventure' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
    expect(screen.getByRole('textbox')).toHaveValue('Lyra');
    expect(screen.getByAltText('Character portrait preview')).toHaveAttribute('src', '/images/avatars/terran-01.webp');
    fireEvent.click(screen.getByRole('button', { name: 'Begin adventure' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(2));
  });

  it('cancels without submitting or inventing a character', async () => {
    const onCancel = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn();
    render(<CharacterCreation inline embedded onComplete={onComplete} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel character creation' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    expect(onComplete).not.toHaveBeenCalled();
  });
});
