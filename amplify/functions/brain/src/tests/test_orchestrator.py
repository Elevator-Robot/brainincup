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

    def test_unarmed_aggression_is_combat(self):
        for text in ("I punch the first guy in the face",
                     "I kick the table over",
                     "Start a fight with the guard",
                     "I smash the mug on the floor"):
            self.assertEqual(intent.classify_intent(text), intent.COMBAT_MODE, text)

    def test_risky_actions_route_to_check_mode(self):
        for text in ("I sneak past the guard",
                     "I pick the lock on the chest",
                     "I bluff the merchant",
                     "I try to climb the wall",
                     "I force the door"):
            self.assertEqual(intent.classify_intent(text), intent.CHECK_MODE, text)

    def test_dice_result_payload_routes_to_dice_mode(self):
        import json
        payload = json.dumps({"type": "DICE_RESULT", "requestId": "abc", "diceValue": 17})
        self.assertEqual(intent.classify_intent(payload), intent.DICE_MODE)

    def test_parse_dice_result_handles_legacy_wrapper(self):
        from experiences.game_master.orchestrator.intent import parse_dice_result
        wrapped = '[DICE_RESULT]{"type":"DICE_RESULT","requestId":"abc","diceValue":3}[/DICE_RESULT]'
        self.assertEqual(parse_dice_result(wrapped)["diceValue"], 3)
        self.assertIsNone(parse_dice_result("I search the room"))
        self.assertIsNone(parse_dice_result(""))

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

    def test_request_stat_check_builds_pending_roll(self):
        pending = systems.request_stat_check("dexterity", 16, 15, description="pick lock")
        self.assertEqual(pending["statName"], "dexterity")
        self.assertEqual(pending["statValue"], 16)
        self.assertEqual(pending["difficultyClass"], 15)
        self.assertTrue(pending["requestId"])
        self.assertTrue(pending["expiresAt"])

    def test_request_stat_check_rejects_unknown_stat(self):
        with self.assertRaises(ValueError):
            systems.request_stat_check("luck", 10, 10)

    def test_resolve_stat_check_success(self):
        pending = systems.request_stat_check("dexterity", 16, 15, base_xp=10)  # mod +3
        result = systems.resolve_stat_check(pending, 15)  # 18 >= 15
        self.assertEqual(result["outcome"], "SUCCESS")
        self.assertEqual(result["xpAwarded"], 10)
        self.assertEqual(result["rollResult"], 18)

    def test_resolve_stat_check_failure(self):
        pending = systems.request_stat_check("dexterity", 10, 15)  # mod 0
        result = systems.resolve_stat_check(pending, 7)
        self.assertEqual(result["outcome"], "FAILURE")
        self.assertEqual(result["xpAwarded"], 0)
        # margin 8 -> critical_failure
        self.assertEqual(result["narrativeHint"], "critical_failure")

    def test_resolve_stat_check_critical_nat20(self):
        pending = systems.request_stat_check("strength", 10, 25, base_xp=10)
        result = systems.resolve_stat_check(pending, 20)
        self.assertEqual(result["outcome"], "CRITICAL_SUCCESS")
        self.assertEqual(result["xpAwarded"], 20)
        self.assertEqual(result["narrativeHint"], "critical")

    def test_resolve_stat_check_critical_nat1(self):
        pending = systems.request_stat_check("charisma", 10, 5, base_xp=10)
        result = systems.resolve_stat_check(pending, 1)
        self.assertEqual(result["outcome"], "CRITICAL_FAILURE")
        self.assertEqual(result["xpAwarded"], 0)


class PacingTest(unittest.TestCase):
    def test_builds_default(self):
        from experiences.game_master.orchestrator.pacing import default_pacing
        pacing = default_pacing()
        self.assertEqual(pacing["currentAct"], "EXPOSITION")
        self.assertEqual(pacing["tensionLevel"], 3)
        self.assertEqual(pacing["currentChapter"], 1)

    def test_combat_raises_tension(self):
        from experiences.game_master.orchestrator.pacing import apply_pacing
        campaign = {}
        pacing = apply_pacing(campaign, "combat")
        self.assertEqual(pacing["tensionLevel"], 4)
        self.assertGreater(pacing["turnsInChapter"], 0)

    def test_inventory_lowers_tension(self):
        from experiences.game_master.orchestrator.pacing import apply_pacing
        campaign = {"tensionLevel": 6}
        pacing = apply_pacing(campaign, "inventory")
        self.assertEqual(pacing["tensionLevel"], 5)

    def test_milestone_landmark_appends_timeline_and_bumps_tension(self):
        from experiences.game_master.orchestrator.pacing import apply_pacing
        campaign = {"tensionLevel": 5}
        pacing = apply_pacing(campaign, "quest", landmark="quest-progress-clear_cellar")
        self.assertEqual(pacing["timeline"], ["quest-progress-clear_cellar"])
        self.assertEqual(pacing["tensionLevel"], 6)  # +1 beat

    def test_act_progression_from_exposition(self):
        from experiences.game_master.orchestrator.pacing import apply_pacing
        campaign = {"tensionLevel": 5, "currentAct": "EXPOSITION", "turnsInChapter": 4}
        pacing = apply_pacing(campaign, "combat")
        act = pacing["currentAct"]
        self.assertIn(act, ("RISING_ACTION", "EXPOSITION"))

    def test_dialogue_after_combat_dial_gently(self):
        from experiences.game_master.orchestrator.pacing import apply_pacing
        campaign = {"tensionLevel": 8}
        pacing = apply_pacing(campaign, "dialogue")
        self.assertEqual(pacing["tensionLevel"], 7)

    def test_pacing_snapshot_shape(self):
        from experiences.game_master.orchestrator.pacing import apply_pacing, pacing_snapshot
        pacing = apply_pacing({"tensionLevel": 4}, "combat", landmark="hazard-market_tavern_cellar")
        snap = pacing_snapshot(pacing)
        self.assertEqual(snap["act"], pacing["currentAct"])
        self.assertEqual(snap["tension"], pacing["tensionLevel"])
        self.assertIn("hazard-market_tavern_cellar", snap["landmarks"])


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

class ContentResilienceTest(unittest.TestCase):
    def test_resolve_location_falls_back_on_unknown(self):
        self.assertEqual(content.resolve_location("The Shrouded Vale")["id"],
                         content.STARTING_LOCATION)
        self.assertEqual(content.resolve_location(None)["id"], content.STARTING_LOCATION)
        self.assertEqual(content.resolve_location("whispering_tankard")["id"],
                         "whispering_tankard")
