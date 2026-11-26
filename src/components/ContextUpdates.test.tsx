import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import ContextWindowPanel, { type Quest } from './ContextWindowPanel';
import InventoryManager, { type InventoryItem } from './InventoryManager';
import { useContextUpdates } from '../hooks/useContextUpdates';

function Context({ inventory, quests }: { inventory: InventoryItem[]; quests: Quest[] }) {
  const updates = useContextUpdates('adventure', inventory, quests);
  return <><p role="status">{updates.inventory.notice} {updates.quests.notice}</p>
    <ContextWindowPanel character={{ name: 'Sera' }} activeQuests={quests} updates={updates}>
      <InventoryManager inventory={inventory} updates={updates.inventory} onUpdateInventory={async () => {}} />
    </ContextWindowPanel></>;
}
afterEach(cleanup);

it('shows received updates when opening a previously hidden context tab without stealing selection', () => {
  const quest: Quest = { id: 'quest', title: 'Missing Stars', stepProgress: '1 / 4' };
  const { rerender } = render(<Context inventory={[]} quests={[quest]} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Location' }));
  rerender(<Context inventory={[{ id: 'shard', name: 'Starlight Shard', type: 'quest' }]}
    quests={[{ ...quest, stepProgress: '2 / 4' }]} />);
  expect(screen.getByRole('tab', { name: 'Location' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('Added Starlight Shard');
  expect(screen.getByRole('tab', { name: 'Character' })).toHaveAccessibleDescription('Added Starlight Shard');
  fireEvent.click(screen.getByRole('tab', { name: 'Character' }));
  expect(screen.getByText('Starlight Shard')).toBeInTheDocument();
  expect(screen.getByText('Added')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Quests' }));
  expect(screen.getByText('2 / 4')).toBeInTheDocument();
  expect(screen.getByText('Updated')).toBeInTheDocument();
});
