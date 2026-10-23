import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CharacterCreation from '../CharacterCreation';
import { calculateFinalStats, getAllRaces } from '../../game';
import { getAvatarOptionsForRace } from '../../constants/gameMasterAvatars';

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
    expect(preview.querySelector('h2')).toBeNull();
    expect(screen.queryByText('An unwritten legend')).toBeNull();
    expect(preview.querySelector('.forge-vitals, .forge-level, .forge-calling-sign')).toBeNull();
    expect(screen.queryByText(/level 1/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose your calling' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Step 3: Identity' })).toBeDisabled();
    expect(screen.queryByText(/Discover the faces within it/)).toBeNull();
    expect(screen.queryByText('Your portrait is chosen.')).toBeNull();
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
    expect(screen.getByText('Steel, shadows, or magic.')).toBeInTheDocument();
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

  it('autoselects a portrait but still requires an explicit calling before identity', () => {
    const onComplete = vi.fn();
    const { container } = render(<CharacterCreation inline embedded onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select Elvin race' }));
    expect(screen.getByRole('button', { name: 'Select Elvin 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Choose your calling' })).not.toBeDisabled();
    fireEvent.submit(container.querySelector('form')!);
    expect(screen.getByRole('button', { name: 'Bring them to life' })).toBeDisabled();
    fireEvent.submit(container.querySelector('form')!);
    expect(screen.getByRole('heading', { name: 'How will you meet the world?' })).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('preserves a draft and switches to the first portrait of a newly selected race', () => {
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
    expect(screen.getByRole('button', { name: 'Step 3: Identity' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Select Goblin 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByAltText('Character portrait preview')).toHaveAttribute('src', '/images/avatars/goblin-01.webp');
    expect(screen.getByRole('button', { name: 'Choose your calling' })).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Select Terran 1' })).toBeNull();
  });

  it.each(getAllRaces().filter(race => getAvatarOptionsForRace(race.name).length > 0))('selects the first available $name portrait on a race change', race => {
    render(<CharacterCreation inline embedded onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select Half-Orc race' }));
    fireEvent.click(screen.getByRole('button', { name: `Select ${race.name} race` }));
    const first = getAvatarOptionsForRace(race.name)[0];
    expect(screen.getByRole('button', { name: `Select ${first.label}` })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByAltText('Character portrait preview')).toHaveAttribute('src', first.src);
  });

  it('does not reset a chosen portrait when the current race is clicked again', () => {
    render(<CharacterCreation inline embedded onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select Terran 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Terran race' }));
    expect(screen.getByRole('button', { name: 'Select Terran 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByAltText('Character portrait preview')).toHaveAttribute('src', '/images/avatars/terran-03.webp');
  });

  it('reveals the real name once without remounting it on every keystroke', () => {
    render(<CharacterCreation inline embedded onComplete={vi.fn()} />);
    const preview = screen.getByRole('region', { name: 'Character preview' });
    expect(preview.querySelector('h2')).toBeNull();
    toIdentity();
    const input = screen.getByRole('textbox', { name: 'Character name' });
    fireEvent.change(input, { target: { value: 'L' } });
    const heading = within(preview).getByRole('heading', { name: 'L' });
    expect(heading).toHaveClass('forge-portrait-reveal');
    expect(preview.querySelector('.forge-name-reveal')).toHaveAttribute('data-visible', 'true');
    fireEvent.change(input, { target: { value: 'Lyra' } });
    expect(within(preview).getByRole('heading', { name: 'Lyra' })).toBe(heading);
    fireEvent.change(input, { target: { value: '   ' } });
    expect(preview.querySelector('h2')).toBeNull();
    expect(preview.querySelector('.forge-name-reveal')).toHaveAttribute('data-visible', 'false');
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
