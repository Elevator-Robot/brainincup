import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import MessageList from '../MessageList';

afterEach(cleanup);

it.each([
  ['Brain', 'desktop'], ['Brain', 'mobile'],
  ['GM', 'desktop'], ['GM', 'mobile'], ['Future', 'mobile'],
] as const)('labels both senders in %s mode on %s', (mode, viewport) => {
  render(<div data-mode={mode} data-viewport={viewport}><MessageList messages={[
    { role: 'user', content: 'Hello there.' },
    { role: 'assistant', content: 'Good to see you.' },
  ]} /></div>);
  const user = screen.getByText('Hello there.').closest('.message-bubble') as HTMLElement;
  const assistant = screen.getByText('Good to see you.').closest('.message-bubble') as HTMLElement;
  expect(within(user).getByText('You')).toHaveClass('uppercase');
  expect(within(assistant).getByText('Brain')).toHaveClass('uppercase');
});

it('labels a Brain message before its streamed text arrives', () => {
  render(<MessageList messages={[{ role: 'assistant', content: '', isTyping: true }]} />);
  expect(screen.getByText('Brain')).toBeInTheDocument();
});
