import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CharacterCreation from '../CharacterCreation';
import { calculateFinalStats } from '../../game';

afterEach(cleanup);

describe('character setup', () => {
  it('previews the selected character and submits matching game stats', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(<CharacterCreation inline embedded onComplete={onComplete} />);
    const start = screen.getByRole('button', { name: 'Begin adventure' });
    expect(start).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Character name' }), { target: { value: 'Lyra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Select Terran 1' }));
    expect(screen.getByRole('button', { name: 'Select Terran 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByAltText('Selected portrait')).toHaveAttribute('src', '/images/avatars/thumbnails/terran-01.webp');
    expect(start).not.toBeDisabled();
    fireEvent.click(start);
    await waitFor(() => expect(onComplete).toHaveBeenCalledExactlyOnceWith({
      name: 'Lyra', race: 'Terran', characterClass: 'Wanderer', avatarId: 'terran-01', ...calculateFinalStats('wanderer', 'terran'),
    }));
  });

  it('supports keyboard selection and clears a portrait from a different race', async () => {
    render(<CharacterCreation inline embedded onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select Terran 1' }));
    const trigger = screen.getByRole('button', { name: /Race Terran/ });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Terran' })).toHaveFocus());
    const goblin = screen.getByRole('option', { name: 'Goblin' });
    fireEvent.click(goblin);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Selected portrait')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select Goblin 1' })).toHaveAttribute('aria-pressed', 'false');
    expect(trigger).toHaveFocus();
  });
});
