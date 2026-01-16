# Game Mechanics Framework

A flexible, data-driven system for managing character stats, races, classes, and items.

## Architecture

```
src/game/
├── types.ts           # Core TypeScript interfaces
├── races.ts           # Race definitions with stat modifiers
├── classes.ts         # Class definitions with base stats
├── items.ts           # Item database with effects
├── statCalculator.ts  # Stat calculation engine
└── index.ts           # Main exports
```

## Usage Examples

### Calculate Character Stats

```typescript
import { calculateFinalStats, calculateDerivedStats } from '@/game';

// Calculate final stats (class + race + effects)
const finalStats = calculateFinalStats('wizard', 'elf', []);

// Calculate derived stats (HP, AC, etc.)
const derivedStats = calculateDerivedStats(finalStats, 'wizard', 5);

console.log(finalStats);
// { strength: 9, dexterity: 14, constitution: 12, intelligence: 17, wisdom: 13, charisma: 10 }

console.log(derivedStats);
// { maxHP: 35, armorClass: 12, initiative: 2, spellPower: 3 }
```

### Get Race/Class Information

```typescript
import { getRace, getClass, getAllRaces } from '@/game';

const elf = getRace('elf');
console.log(elf.statModifiers); // { dexterity: 2, intelligence: 1 }

const wizard = getClass('wizard');
console.log(wizard.baseStats); // { strength: 8, dexterity: 12, ... }

const allRaces = getAllRaces(); // Array of all race definitions
```

### Work with Items

```typescript
import { getItem, getItemsByType } from '@/game';

const sword = getItem('flamingSword');
console.log(sword.statModifiers); // { strength: 3, charisma: 1 }
console.log(sword.effects); // Array of item effects

const weapons = getItemsByType('weapon'); // All weapons
const rare = getItemsByRarity('rare'); // All rare items
```

### Apply Item Effects

```typescript
import { applyModifiers } from '@/game';

const baseStats = { strength: 10, dexterity: 12, ... };
const item1Mods = { strength: 2 };
const item2Mods = { dexterity: 1, strength: 1 };

const finalStats = applyModifiers(baseStats, item1Mods, item2Mods);
// { strength: 13, dexterity: 13, ... }
```

### Format Stats for AI

```typescript
import { formatStatsForAI } from '@/game';

const aiContext = formatStatsForAI(
  finalStats,
  derivedStats,
  'wizard',
  'elf',
  5
);

console.log(aiContext);
// Character Stats:
// - Class: Wizard (Level 5)
// - Race: Elf
// Core Attributes:
// - Strength: 9 (-1)
// - Dexterity: 14 (+2)
// ...
```

## Adding New Content

### Add a New Race

Edit `races.ts`:

```typescript
myCustomRace: {
  id: 'myCustomRace',
  name: 'My Custom Race',
  description: 'A unique race with special abilities.',
  statModifiers: {
    strength: 1,
    intelligence: 2,
  },
  traits: ['Night Vision', 'Quick Reflexes'],
  size: 'Medium',
  speed: 30,
}
```

### Add a New Class

Edit `classes.ts`:

```typescript
artificer: {
  id: 'artificer',
  name: 'Artificer',
  description: 'Master of magical inventions.',
  baseStats: {
    strength: 10,
    dexterity: 12,
    constitution: 13,
    intelligence: 16,
    wisdom: 11,
    charisma: 10,
  },
  hitDieSize: 8,
  primaryStat: 'intelligence',
  skills: ['Arcana', 'Investigation', 'Tool Proficiency'],
  startingEquipment: ['Hammer', 'Tinker Tools', 'Leather Armor'],
}
```

### Add a New Item

Edit `items.ts`:

```typescript
magicWand: {
  id: 'magicWand',
  name: 'Wand of Fireballs',
  description: 'Casts powerful fire magic.',
  type: 'weapon',
  rarity: 'rare',
  statModifiers: { intelligence: 2 },
  effects: [{
    type: 'buff',
    duration: 'permanent',
    statModifiers: { charisma: 1 },
    description: 'The wand enhances your magical presence.',
  }],
  stackable: false,
}
```

## Stat Calculation Flow

1. Start with **Class Base Stats** (from `classes.ts`)
2. Add **Race Modifiers** (from `races.ts`)
3. Add **Equipped Item Modifiers**
4. Add **Active Effect Modifiers** (temporary buffs/debuffs)
5. Calculate **Derived Stats** (HP, AC, Initiative, Spell Power)

## Extending the System

### Add New Stat Types

Edit `types.ts` to add new stats:

```typescript
export interface Stats {
  strength: number;
  dexterity: number;
  // ... existing stats
  luck: number; // new stat
}
```

### Add Item Types

Edit `types.ts`:

```typescript
type: 'weapon' | 'armor' | 'consumable' | 'magical' | 'misc' | 'quest'; // added 'quest'
```

### Add Effect Types

Edit `types.ts`:

```typescript
type: 'buff' | 'debuff' | 'heal' | 'damage' | 'stun'; // added 'stun'
```

## Integration with Database

When creating a character in the database, store:

```typescript
{
  name: "Gandalf",
  race: "elf",           // ID from races.ts
  characterClass: "wizard", // ID from classes.ts
  level: 5,
  
  // Calculated and stored
  strength: 9,
  dexterity: 14,
  // ... other final stats
  
  maxHP: 35,
  currentHP: 35,
  armorClass: 12,
  
  // Inventory (item IDs)
  inventory: JSON.stringify(['flamingSword', 'healthPotion']),
}
```

## Best Practices

1. **Never hardcode stats** - Always use the framework
2. **Calculate on demand** - Don't store calculated values unless necessary
3. **Use type safety** - TypeScript interfaces catch errors early
4. **Keep data files simple** - Easy to read and modify
5. **Document new additions** - Update this README when adding content

## Future Enhancements

- [ ] Skill system with proficiencies
- [ ] Spell system with spell slots
- [ ] Status effects (poisoned, stunned, etc.)
- [ ] Experience and leveling formulas
- [ ] Equipment slots and restrictions
- [ ] Item durability system
- [ ] Crafting system
- [ ] Character alignment system
