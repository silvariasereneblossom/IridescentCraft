# Modpack KubeJS Implementation
## Progression-Focused Expert-Lite Modpack — Minecraft 1.20.1 (Forge)

### Folder Structure
```
kubejs/
├── startup_scripts/
│   └── custom_items.js          # Priority 1: Custom item registration (tokens, boss mats, alloys)
├── server_scripts/
│   ├── astages/
│   │   ├── tier_definitions.js  # Priority 2: AStages tier stage definitions + customization
│   │   ├── dimension_gates.js   # Priority 2: Dimension restrictions per tier
│   │   ├── ore_gates.js         # Priority 2: Ore replacement/hiding per tier
│   │   ├── item_gates.js        # Priority 2: Tier-inappropriate item restrictions
│   │   └── recipe_gates.js      # Priority 2: Tier-gated crafting restrictions
│   ├── recipes/
│   │   ├── tier_skip.js         # Priority 3: Transmutation recipes (tier-peek materials)
│   │   └── custom_recipes.js    # Priority 3: Intermediate alloys, progression token crafting
│   └── events/
│       └── stage_events.js      # Event listeners for stage add/remove (logging, effects)
├── client_scripts/
│   └── predicates.js            # Client-side predicate models (if needed for item restrictions)
└── README.md                    # This file
```

### Implementation Priorities (from design doc Section 29)
1. ✅ KubeJS custom item registration — progression tokens, boss materials, intermediate alloys
2. ✅ AStages tier definitions + KubeJS integration — backbone of all gating
3. ✅ Recipe modifications — material gates, tier-gated crafting, cross-mod audit (starter set)
4. 🔲 LootJS loot table overhaul — all dungeon/structure mods + boss loot
5. 🔲 Simply Swords → Boss mapping (LootJS) — unique weapon assignments
6. 🔲 Mod configs — ScalingMobs, Champions, Apotheosis, Progressive Bosses, Improved Mobs
7. 🔲 Villager trade rework (KubeJS)
8. 🔲 Tier-skip recipes (KubeJS) — transmutation + boss material drops (starter set included)
9. 🔲 FTB Quests — branching unlock structure
10. 🔲 Pufferfish's Skills trees
11. 🔲 Refined Storage dual-path recipes
12. 🔲 Waystone custom recipes
13. 🔲 Playtesting & iteration

### Stage Names
- `tier_1` — All players start with this (granted on first join)
- `tier_2` — Unlocked via FTB Quests gate or command
- `tier_3` — Unlocked via FTB Quests gate or command
- `tier_4` — Unlocked via FTB Quests gate or command

### Commands Reference
```
/astages add <player> tier_2
/astages add <player> tier_3
/astages add <player> tier_4
/astages remove <player> tier_2
/astages info <player>
```

### Notes
- All AStages restrictions go in server_scripts (server-side only)
- Custom item registration MUST go in startup_scripts (requires game restart)
- Recipe modifications via KubeJS RecipeEvents go in server_scripts (reloadable with /reload)
- AStages restrictions are reloadable with /reload (v0.6.0+)
- Recipe restrictions only cover vanilla recipe types; mod machine recipes need Recipe Machine Stages mod
