import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ConversationSidebarIcons from './ConversationSidebarIcons';

vi.mock('../utils/testMode', () => ({ isTestModeEnabled: () => true }));
afterEach(cleanup);

it('keeps destinations named and selected, preserves navigation, and exposes keyboard hints', async () => {
  const brain = vi.fn();
  const select = vi.fn();
  const create = vi.fn();
  render(<ConversationSidebarIcons onSelectConversation={select} onSelectBrain={brain} onNewConversation={create}
    activeConversationId="brain" refreshKey={0} isDisabled={false} />);
  const brainButton = screen.getByRole('button', { name: 'Brain' });
  expect(brainButton).toHaveAttribute('aria-current', 'page');
  fireEvent.focus(brainButton);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Return to consciousness');
  expect(brainButton).toHaveAccessibleDescription('Brain Return to consciousness');
  fireEvent.keyDown(brainButton, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.click(brainButton);
  expect(brain).toHaveBeenCalledOnce();
  const adventure = await screen.findByRole('button', { name: 'Sera Vane' });
  expect(screen.getByLabelText('1 of 3 adventure slots used')).toBeInTheDocument();
  fireEvent.click(adventure);
  expect(select).toHaveBeenCalledWith('test-conversation-2');
  fireEvent.click(screen.getByRole('button', { name: 'Start new chat' }));
  expect(create).toHaveBeenCalledOnce();
});
