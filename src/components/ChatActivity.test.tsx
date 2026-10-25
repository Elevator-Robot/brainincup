import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import ChatActivity from './ChatActivity';

afterEach(cleanup);
it('announces waiting only while a response is actually pending', () => {
  const { rerender } = render(<ChatActivity active={false} />);
  expect(screen.queryByRole('status')).toBeNull();
  rerender(<ChatActivity active />);
  expect(screen.getByRole('status')).toHaveTextContent('Brain is thinking');
  rerender(<ChatActivity active={false} />);
  expect(screen.queryByRole('status')).toBeNull();
});
