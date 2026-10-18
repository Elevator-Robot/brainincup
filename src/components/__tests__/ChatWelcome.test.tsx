import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatWelcome from '../ChatWelcome';

describe('conversation empty state', () => {
  it('uses a plain heading and actionable conversation starters', () => {
    const onPrompt = vi.fn();
    render(<ChatWelcome isGameMasterMode={false} onPrompt={onPrompt} />);
    expect(screen.getByRole('heading', { name: 'New conversation' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Work through a problem' }));
    expect(onPrompt).toHaveBeenCalledExactlyOnceWith('Work through a problem');
  });

  it('shows only character setup guidance until an adventure is ready', () => {
    render(<ChatWelcome isGameMasterMode isSettingUp onPrompt={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'New adventure' })).toBeInTheDocument();
    expect(screen.getByText('Create a character to begin.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
