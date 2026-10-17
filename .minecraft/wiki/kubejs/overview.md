# KubeJS & Scripting Overview

IridescentCraft uses **KubeJS 6.x** (for Minecraft 1.20.1 Forge) as its primary scripting layer. A large share of the pack's bespoke gameplay — the parts that aren't a single off-the-shelf mod — is implemented here, on top of datapacks and a handful of custom Java mods.

## What the scripting layer does

The KubeJS scripts and virtual datapack drive most of the custom RPG systems:

- **Progression & gating** — tier (AStages) gating of items, recipes, and dimensions; the Codex token bank and the boss rush that buy each tier.
- **Bosses & dimensions** — one boss list and one dimension list that every script reads: each boss's tier, kill tokens, boss-rush roster and Boss Compass row, and each dimension's tier, gate and death penalty.
- **Loot** — tier-appropriate loot across chests and structures (via LootJS): artifact/relic tiering, spell-scroll and glyph injection, junk cleanup, and per-dimension scaling.
- **Combat & mobs** — per-dimension mob stat scaling, mob equipment rules, knockback/velocity caps, and anomaly defenses.
- **Skills & enchantments** — custom skill-tree effects, custom enchantment effects, and Apotheosis affix handlers.
- **Classes & origins** — class passives, the Class Altar respec, glass-cannon HP mechanics, and origin progression effects.
- **Death penalty** — durability loss on death, paired with the inert-on-break system so gear is never destroyed.
- **Codex delivery** — first-join delivery of the Iridescent Codex guidebook and suppression of other mods' starter books.

For the design intent behind these systems, see the [Master Design Document](../design/master.md) and [Systems Overview](../systems/overview.md).

## Script locations

| Directory | Purpose | Load time |
|-----------|---------|-----------|
| `kubejs/server_scripts/` | Server-side logic (events, recipes, loot) | World load |
| `kubejs/startup_scripts/` | Item/block/enchantment registration | Game startup |
| `kubejs/client_scripts/` | Tooltips, UI tweaks | Client connect |
| `kubejs/data/` | Virtual datapack (recipes, tags, loot tables) | Resource reload |

## Datapacks (Paxi)

Custom data ships two ways: through the KubeJS virtual datapack (`kubejs/data/`) and as **zipped datapacks loaded by Paxi 4.0** (Paxi loads zip files, not folders). Active Paxi datapacks include the Pufferfish's Skills trees, custom Apotheosis affixes, the pack's Tetra materials, worldgen and loot overrides, and overrides for Botania, Iron's Spellbooks, Terramity, Origins and other mods (as of 2026-10-16). The races and classes ship in the pack's own Origins mod, and the Iridescent Codex in its own content mod.

> **Note:** Patchouli guidebooks (like the Codex) must live in a real datapack — Patchouli can't read book content from the KubeJS virtual datapack — which is why the Codex ships as its own content mod rather than from `kubejs/data/`.

## Related pages

- [Master Design Document](../design/master.md) — design intent and implementation details
- [Systems Overview](../systems/overview.md) — what the scripts implement
- [Known Issues](../known-issues/tracker.md) — current bugs and recent fixes
