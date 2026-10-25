import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ChatTranscript from '../ChatTranscript';

afterEach(cleanup);
describe('conversation empty state', () => {
  it('leaves empty conversations silent with no heading, starter prompts, or fake messages', () => {
    const { container } = render(<ChatTranscript messages={[]} />);
    expect(screen.getByLabelText('Conversation').textContent).toBe('');
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('.retro-message-row, .cosmic-welcome, .cosmic-prompt-list')).toBeNull();
  });
  it('still provides honest feedback when a real response is pending', () => {
    render(<ChatTranscript messages={[]} waiting />);
    expect(screen.getByRole('status')).toHaveTextContent('Brain is thinking');
    expect(screen.queryByText('New conversation')).toBeNull();
  });
});
