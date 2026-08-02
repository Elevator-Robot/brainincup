"""Unit tests for the Game Master orchestrator's deterministic pieces.

Run from the lambda src root:
    cd amplify/functions/brain/src && python3 -m unittest tests.test_orchestrator -v
"""

from __future__ import annotations

import random
import unittest

from experiences.game_master.orchestrator import content, intent, systems


class IntentRoutingTest(unittest.TestCase):
    def test_maps_to_gameplay_modes(self):
        cases = {
            "I attack the rats": intent.COMBAT_MODE,
            "Talk to Bram": intent.DIALOGUE_MODE,
            "Explore the tavern": intent.EXPLORATION_MODE,
            "Open my inventory": intent.INVENTORY_MODE,
            "Accept the missing lantern quest": intent.QUEST_MODE,
            "Show my character": intent.CHARACTER_MODE,
            "a gentle breeze": intent.NARRATION_MODE,
        }
        for text, expected in cases.items():
            self.assertEqual(intent.classify_intent(text), expected, text)

    def test_never_none(self):
        for _ in range(200):
            self.assertIn(intent.classify_intent("the fire crackles oddly"), intent.ALL_MODES)


class SystemsTest(unittest.TestCase):
    def test_xp_levelup_recomputes_hp(self):
        player = {
            "class": "Rogue", "level": 1, "xp": 90, "max_hp": 14, "current_hp": 14, "ac": 11,
            "stats": {"strength": 10, "dexterity": 16, "constitution": 14,
                      "intelligence": 13, "wisdom": 12, "charisma": 10},
        }
        updated = systems.apply_xp(player, 20)
        self.assertGreater(updated["level"], 1)
        self.assertGreater(updated["max_hp"], 14)

    def test_combat_miss_does_not_damage(self):
        enemy = dict(content.ENEMIES["cellar_rat"])
        enemy["armor_class"] = 99  # force miss
        player = {"stats": {"strength": 10}}
        result = systems.player_attack(player, enemy, rng=random.Random(1))
        self.assertFalse(result["hit"])

    def test_combat_damage_math(self):
        enemy = dict(content.ENEMIES["cellar_rat"])  # ac 10, hp 7
        player = {"stats": {"strength": 18}}  # +4 mod, guaranteed hit on non-1
        result = systems.player_attack(player, enemy, rng=random.Random(7))
        self.assertTrue(result["hit"])
        self.assertTrue(result["enemy_hp"] <= 7)

    def test_purchase_reduces_gold(self):
        player = {"gold": 30, "inventory": []}
        player, err = systems.purchase(player, "healing_potion", 15)
        self.assertIsNone(err)
        self.assertEqual(player["gold"], 15)
        self.assertEqual(systems.has_item(player, "healing_potion"), 1)


class ContentCompletenessTest(unittest.TestCase):
    def test_vertical_slice_content_present(self):
        self.assertIn("alderheart_square", content.LOCATIONS)
        self.assertIn("whispering_tankard", content.LOCATIONS)
        self.assertIn("market_tavern_cellar", content.LOCATIONS)
        self.assertIn(content.QUEST_ID, content.QUESTS)
        self.assertTrue(content.QUESTS[content.QUEST_ID]["steps"])
        self.assertTrue(content.ENEMIES)
        self.assertEqual(content.get_location(content.STARTING_LOCATION)["kind"], "town")

    def test_quest_chain_terminates(self):
        quest = content.QUESTS[content.QUEST_ID]
        self.assertEqual(quest["steps"][-1]["id"], "return_lantern")


if __name__ == "__main__":
    unittest.main()