import type { RpgEvent } from '../chat/rpgEvents';

const labels: Record<string, [string, string]> = {
  scene: ['⌖', 'Location'], stage: ['▸', 'Story stage'], character: ['◇', 'Character detail'],
  choice: ['⑂', 'Choice'], dialogue: ['“', 'Conversation'], discovery: ['✧', 'Discovery'],
  quest: ['⚑', 'Quest'], check: ['⚄', 'Check'], combat: ['⚔', 'Combat'],
  damage: ['−', 'Damage'], healing: ['+', 'Healing'], condition: ['◈', 'Condition'],
  inventory: ['▣', 'Inventory'], reward: ['+', 'Reward'], level: ['↑', 'Level up'],
  rest: ['☾', 'Rest'], consequence: ['↳', 'Consequence'],
};

export default function RpgEventList({ events }: { events: RpgEvent[] }) {
  if (!events.length) return null;
  return <ul className="rpg-events" aria-label="Adventure events">
    {events.map(event => {
      const [glyph, label] = labels[event.kind] ?? ['◇', 'Event'];
      return <li key={event.id} className="rpg-event" data-event-kind={event.kind}>
        <span className="rpg-event-glyph" aria-hidden="true">{glyph}</span>
        <div className="rpg-event-body">
          <span className="rpg-event-label">{label}</span>
          <strong>{event.title}</strong>
          <p>{event.detail}</p>
        </div>
      </li>;
    })}
  </ul>;
}
