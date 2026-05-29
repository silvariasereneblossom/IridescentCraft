#!/usr/bin/env python3
# =============================================================================
# gen_onboarding_quests.py
#
# Generate Heracles chapter 0 (Onboarding) quest JSONs into
# .minecraft/config/heracles/quests/onboarding/.
#
# Design per .minecraft/wiki/design/heracles-quest-tree.md + JSON shape
# verified against .minecraft/wiki/design/heracles-json-shape.md (2026-05-28).
# Operator-confirmed mix: 12 vanilla survival milestones + 3 codex-read
# quests + 1 capstone (15 total). Rewards scale tier-wise:
#   xp_burst:  small (early) -> medium (mid) -> large (capstone)
#   materials: tier-appropriate vanilla / mod-flavored items
#
# Codex-read quests use heracles:dummy (KubeJS Patchouli listener fires
# `/heracles dummy <id>` on first page-open). The listener + bidirectional
# unlock infra (#45 Step 5-6) is separate KubeJS work tracked alongside.
#
# Capstone uses heracles:command for the "Survivor" title broadcast since
# Heracles has no built-in title-reward type. Custom Wanderer charm curio
# is deferred to a future authoring pass once visual assets exist.
#
# Idempotent: re-running overwrites previous output.
# =============================================================================
import json
from pathlib import Path

QUESTS_DIR = Path(__file__).resolve().parent.parent / "config" / "heracles" / "quests" / "onboarding"

GROUP = "Onboarding"

# Quest specs as ordered list. Each entry: (file_stem, display_name, subtitle,
# description_lines, icon_item, position [x,y], dependency_stems, tasks_dict,
# rewards_dict).
QUESTS = [
    # Row 0 -- Survival Foundation
    {
        "stem": "onboarding_first_log",
        "title": "Crack the Bark",
        "subtitle": "Mine your first log",
        "desc": [
            "Every adventure starts with a tree.",
            "",
            "Punch any log type to chop it down.",
        ],
        "icon": "minecraft:oak_log",
        "pos": [0, 0],
        "deps": [],
        "tasks": {
            "mine_log": {
                "type": "heracles:item",
                "item": {"id": "minecraft:oak_logs"},
            },
        },
        "rewards": {
            "starter_planks": {
                "type": "heracles:item",
                "item": {"id": "minecraft:oak_planks", "count": 4},
            },
            "xp_burst": {
                "type": "heracles:xp",
                "xptype": "POINTS",
                "amount": 50,
            },
        },
    },
    {
        "stem": "onboarding_first_tool",
        "title": "Hand-Held Tools",
        "subtitle": "Craft a wooden pickaxe",
        "desc": [
            "A pickaxe lets you break stone.",
            "",
            "Open your inventory (E), arrange 3 planks across the top and 2 sticks down the middle of the crafting grid.",
        ],
        "icon": "minecraft:wooden_pickaxe",
        "pos": [1, 0],
        "deps": ["onboarding_first_log"],
        "tasks": {
            "have_pick": {
                "type": "heracles:item",
                "item": {"id": "minecraft:wooden_pickaxe"},
            },
        },
        "rewards": {
            "starter_sticks": {
                "type": "heracles:item",
                "item": {"id": "minecraft:stick", "count": 8},
            },
            "xp_burst": {
                "type": "heracles:xp",
                "xptype": "POINTS",
                "amount": 75,
            },
        },
    },
    {
        "stem": "onboarding_first_stone",
        "title": "Stone Age",
        "subtitle": "Mine your first stone",
        "desc": [
            "Pickaxe in hand, break some stone.",
            "",
            "Cobblestone is your gateway to tougher tools, smelting, and shelter.",
        ],
        "icon": "minecraft:cobblestone",
        "pos": [2, 0],
        "deps": ["onboarding_first_tool"],
        "tasks": {
            "mine_stone": {
                "type": "heracles:advancement",
                "advancement": "minecraft:story/mine_stone",
            },
        },
        "rewards": {
            "starter_cobble": {
                "type": "heracles:item",
                "item": {"id": "minecraft:cobblestone", "count": 16},
            },
            "xp_burst": {
                "type": "heracles:xp",
                "xptype": "POINTS",
                "amount": 75,
            },
        },
    },
    {
        "stem": "onboarding_first_food",
        "title": "First Meal",
        "subtitle": "Eat something",
        "desc": [
            "Hunger will kill you faster than monsters.",
            "",
            "Eat any food item -- bread, an apple, raw chicken (carefully), anything.",
        ],
        "icon": "minecraft:cooked_beef",
        "pos": [3, 0],
        "deps": ["onboarding_first_log"],
        "tasks": {
            "eat_food": {
                "type": "heracles:advancement",
                "advancement": "minecraft:husbandry/balanced_diet",
            },
        },
        "rewards": {
            "starter_food": {
                "type": "heracles:item",
                "item": {"id": "minecraft:cooked_beef", "count": 4},
            },
            "xp_burst": {
                "type": "heracles:xp",
                "xptype": "POINTS",
                "amount": 100,
            },
        },
    },

    # Row 1 -- First Day
    {
        "stem": "onboarding_first_shelter",
        "title": "Safe Haven",
        "subtitle": "Sleep in a bed",
        "desc": [
            "Beds skip the night and set your respawn point.",
            "",
            "Craft a bed from 3 wool and 3 planks, place it, and use it after sundown.",
        ],
        "icon": "minecraft:red_bed",
        "pos": [0, 1],
        "deps": ["onboarding_first_food"],
        "tasks": {
            "sleep": {
                "type": "heracles:advancement",
                "advancement": "minecraft:adventure/sleep_in_bed",
            },
        },
        "rewards": {
            "starter_wool": {
                "type": "heracles:item",
                "item": {"id": "minecraft:white_wool", "count": 4},
            },
            "xp_burst": {
                "type": "heracles:xp",
                "xptype": "POINTS",
                "amount": 100,
            },
        },
    },
    {
        "stem": "onboarding_first_codex_open",
        "title": "The Iridescent Codex",
        "subtitle": "Acquire the codex book",
        "desc": [
            "The Iridescent Codex is your in-game reference for pack systems.",
            "",
            "Find or craft a Tome of Iridescence and hold it in your inventory.",
        ],
        "icon": "iridescent_codex:tome_of_iridescence",
        "pos": [1, 1],
        "deps": ["onboarding_first_shelter"],
        "tasks": {
            "have_codex": {
                "type": "heracles:item",
                "item": {"id": "iridescent_codex:tome_of_iridescence"},
            },
        },
        "rewards": {
            "starter_source": {
                "type": "heracles:item",
                "item": {"id": "ars_nouveau:source_gem", "count": 4},
            },
            "xp_burst": {
                "type": "heracles:xp",
                "xptype": "POINTS",
                "amount": 100,
            },
        },
    },
    {
        "stem": "onboarding_intro_read",
        "title": "Read: Welcome",
        "subtitle": "Open the codex's Intro page",
        "desc": [
            "The Codex's Intro section explains why this pack exists.",
            "",
            "Open it from your hotbar and read the Welcome > Intro entry.",
        ],
        "icon": "iridescent_codex:tome_of_iridescence",
        "pos": [2, 1],
        "deps": ["onboarding_first_codex_open"],
        "tasks": {
            "read_intro": {
                "type": "heracles:dummy",
                "value": "codex_welcome_intro_read",
                "description": "Open the Welcome > Intro codex page (fires when you read it).",
            },
        },
        "rewards": {
            "bonus_source": {
                "type": "heracles:item",
                "item": {"id": "ars_nouveau:source_gem", "count": 8},
            },
            "xp_burst": {
                "type": "heracles:xp",
                "xptype": "POINTS",
                "amount": 100,
            },
        },
    },
    {
        "stem": "onboarding_first_hour_read",
        "title": "Read: First Hour",
        "subtitle": "Codex's First Hour guide",
        "desc": [
            "The First Hour guide walks you through your first session.",
            "",
            "Open the Welcome > First Hour codex entry.",
        ],
        "icon": "iridescent_codex:tome_of_iridescence",
        "pos": [3, 1],
        "deps": ["onboarding_intro_read"],
        "tasks": {
            "read_first_hour": {
                "type": "heracles:dummy",
                "value": "codex_welcome_first_hour_read",
                "description": "Open the Welcome > First Hour codex page.",
            },
        },
        "rewards": {
            "bonus_source": {
                "type": "heracles:item",
                "item": {"id": "ars_nouveau:source_gem", "count": 16},
            },
            "bonus_planks": {
                "type": "heracles:item",
                "item": {"id": "minecraft:oak_planks", "count": 8},
            },
            "xp_burst": {
                "type": "heracles:xp",
                "xptype": "POINTS",
                "amount": 150,
            },
        },
    },

    # Row 2 -- Combat & Iron
    {
        "stem": "onboarding_first_kill",
        "title": "First Blood",
        "subtitle": "Defeat a hostile mob",
        "desc": [
            "Every adventurer starts somewhere.",
            "",
            "Find a hostile creature and put it down.",
        ],
        "icon": "minecraft:iron_sword",
        "pos": [0, 2],
        "deps": ["onboarding_first_tool"],
        "tasks": {
            "kill_hostile": {
                "type": "heracles:advancement",
                "advancement": "minecraft:adventure/kill_a_mob",
            },
        },
        "rewards": {
            "starter_sword": {
                "type": "heracles:item",
                "item": {"id": "minecraft:stone_sword", "count": 1},
            },
            "xp_burst": {
                "type": "heracles:xp",
                "xptype": "POINTS",
                "amount": 150,
            },
        },
    },
    {
        "stem": "onboarding_first_iron",
        "title": "Iron Heart",
        "subtitle": "Acquire your first iron ingot",
        "desc": [
            "Mine iron ore (needs a stone pickaxe or better) and smelt it in a furnace.",
            "",
            "Iron unlocks proper tools and armor.",
        ],
        "icon": "minecraft:iron_ingot",
        "pos": [1, 2],
        "deps": ["onboarding_first_stone"],
        "tasks": {
            "smelt_iron": {
                "type": "heracles:advancement",
                "advancement": "minecraft:story/smelt_iron",
            },
        },
        "rewards": {
            "starter_iron": {
                "type": "heracles:item",
                "item": {"id": "minecraft:iron_ingot", "count": 2},
            },
            "xp_burst": {
                "type": "heracles:xp",
                "xptype": "POINTS",
                "amount": 200,
            },
        },
    },
    {
        "stem": "onboarding_first_iron_pick",
        "title": "Iron Tools",
        "subtitle": "Craft an iron pickaxe",
        "desc": [
            "An iron pickaxe mines diamonds and durable enough for serious work.",
            "",
            "Craft one at a crafting table -- 3 iron ingots + 2 sticks.",
        ],
        "icon": "minecraft:iron_pickaxe",
        "pos": [2, 2],
        "deps": ["onboarding_first_iron"],
        "tasks": {
            "have_iron_pick": {
                "type": "heracles:advancement",
                "advancement": "minecraft:story/iron_tools",
            },
        },
        "rewards": {
            "starter_kit_iron": {
                "type": "heracles:item",
                "item": {"id": "tetra:repair_kit_iron", "count": 1},
            },
            "xp_burst": {
                "type": "heracles:xp",
                "xptype": "POINTS",
                "amount": 200,
            },
        },
    },
    {
        "stem": "onboarding_keybinds_read",
        "title": "Read: Keybinds",
        "subtitle": "Codex's Keybinds reference",
        "desc": [
            "Lots of mods, lots of new keys. The Codex's Keybinds page is the quick reference.",
            "",
            "Open the Welcome > Keybinds codex entry.",
        ],
        "icon": "iridescent_codex:tome_of_iridescence",
        "pos": [3, 2],
        "deps": ["onboarding_first_hour_read"],
        "tasks": {
            "read_keybinds": {
                "type": "heracles:dummy",
                "value": "codex_welcome_keybinds_read",
                "description": "Open the Welcome > Keybinds codex page.",
            },
        },
        "rewards": {
            "bonus_pearl": {
                "type": "heracles:item",
                "item": {"id": "minecraft:ender_pearl", "count": 1},
            },
            "xp_burst": {
                "type": "heracles:xp",
                "xptype": "POINTS",
                "amount": 200,
            },
        },
    },

    # Row 3 -- Beyond Vanilla
    {
        "stem": "onboarding_first_level",
        "title": "Level Up",
        "subtitle": "Reach JustLevelingFork level 5",
        "desc": [
            "JustLevelingFork (JLF) tracks per-character progression separate from skill points.",
            "",
            "Earn XP from any source until you hit JLF level 5.",
        ],
        "icon": "minecraft:experience_bottle",
        "pos": [1, 3],
        "deps": ["onboarding_first_iron_pick"],
        "tasks": {
            "jlf_level_5": {
                "type": "heracles:dummy",
                "value": "jlf_level_5_reached",
                "description": "Reach JLF level 5 (KubeJS fires this task on level-up).",
            },
        },
        "rewards": {
            "starter_iron_burst": {
                "type": "heracles:item",
                "item": {"id": "minecraft:iron_ingot", "count": 4},
            },
            "xp_burst": {
                "type": "heracles:xp",
                "xptype": "POINTS",
                "amount": 300,
            },
        },
    },
    {
        "stem": "onboarding_first_villager_trade",
        "title": "Local Economy",
        "subtitle": "Trade with a villager",
        "desc": [
            "Villagers are your in-world economy.",
            "",
            "Find a village, locate a villager with a profession, and complete one trade.",
        ],
        "icon": "minecraft:emerald",
        "pos": [2, 3],
        "deps": ["onboarding_first_kill"],
        "tasks": {
            "trade_villager": {
                "type": "heracles:advancement",
                "advancement": "minecraft:adventure/trade",
            },
        },
        "rewards": {
            "starter_emeralds": {
                "type": "heracles:item",
                "item": {"id": "minecraft:emerald", "count": 4},
            },
            "xp_burst": {
                "type": "heracles:xp",
                "xptype": "POINTS",
                "amount": 200,
            },
        },
    },

    # Row 4 -- Capstone
    {
        "stem": "onboarding_survivor_capstone",
        "title": "Survivor",
        "subtitle": "Onboarding complete",
        "desc": [
            "You've survived the first day, found iron, opened the Codex, and read the essentials.",
            "",
            "Welcome to IridescentCraft. You're ready for chapter 1.",
        ],
        "icon": "minecraft:totem_of_undying",
        "pos": [2, 4],
        "deps": [
            "onboarding_first_log",
            "onboarding_first_tool",
            "onboarding_first_stone",
            "onboarding_first_food",
            "onboarding_first_shelter",
            "onboarding_first_codex_open",
            "onboarding_intro_read",
            "onboarding_first_hour_read",
            "onboarding_first_kill",
            "onboarding_first_iron",
            "onboarding_first_iron_pick",
            "onboarding_keybinds_read",
            "onboarding_first_level",
            "onboarding_first_villager_trade",
        ],
        "tasks": {
            "complete_all": {
                "type": "heracles:dummy",
                "value": "onboarding_survivor_capstone_check",
                "description": "Heracles dep-chain check (auto-completes when all 14 prerequisites done).",
            },
        },
        "rewards": {
            "survivor_broadcast": {
                "type": "heracles:command",
                # tellraw broadcast to whole server when player claims.
                "command": "tellraw @a [{\"text\":\"[Iridescent] \",\"color\":\"light_purple\"},{\"selector\":\"@s\",\"color\":\"aqua\"},{\"text\":\" has survived onboarding and earned the \",\"color\":\"white\"},{\"text\":\"Survivor\",\"color\":\"gold\",\"bold\":true},{\"text\":\" title.\",\"color\":\"white\"}]",
            },
            "xp_burst": {
                "type": "heracles:xp",
                "xptype": "POINTS",
                "amount": 500,
            },
        },
    },
]


def gen():
    QUESTS_DIR.mkdir(parents=True, exist_ok=True)
    for q in QUESTS:
        path = QUESTS_DIR / f"{q['stem']}.json"
        data = {
            "display": {
                "icon": {
                    "type": "heracles:item",
                    "item": q["icon"],
                },
                "title": q["title"],
                "subtitle": q["subtitle"],
                "description": q["desc"],
                "groups": {
                    GROUP: {
                        "position": q["pos"],
                    },
                },
            },
            "settings": {
                "individual_progress": True,
            },
            "dependencies": q["deps"],
            "tasks": q["tasks"],
            "rewards": q["rewards"],
        }
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        print(f"[gen] {path.relative_to(QUESTS_DIR.parent.parent.parent.parent.parent)}")
    print(f"[gen] wrote {len(QUESTS)} quests to {QUESTS_DIR}")


if __name__ == "__main__":
    gen()
