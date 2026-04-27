# IridescentCraft Master Design Document

**A progression-focused expert-lite Minecraft 1.20.1 (Forge) modpack.**

> This document is the canonical source of truth for IridescentCraft's design intent. It describes *what the systems are and why* — not the per-mod numerical configuration. **Numbers, tables, recipe lists, drop rates, mod rosters, and other implementation specifics live in [`master-appendix.md`](master-appendix.md).** When implementation changes, log it in [`changelog.md`](changelog.md) and update both docs as needed.
>
> **Migration status (2026-04-27):** the previous monolithic 8,370-line master is preserved at [`master-LEGACY.md`](master-LEGACY.md) during the rewrite. Sections marked _migrated_ in the table of contents below have been moved to this doc and/or the appendix; sections marked _pending_ still live in the legacy file. Migration is happening over multiple sessions.

---

## Table of Contents

| # | Section | Status |
|---|---------|--------|
| I | [Vision & Pillars](#part-i-vision--pillars) | migrated |
| II | [The Tier System](#part-ii-the-tier-system) | migrated |
| III | [Progression Paths](#part-iii-progression-paths) | migrated |
| IV | Worlds & Dimensions | pending — see legacy Part IV |
| V | Combat & Difficulty | pending — see legacy Part X |
| VI | Player Character | pending — see legacy Part XII |
| VII | Magic System | pending — see legacy Part VI |
| VIII | Tech System | pending — see legacy Part V |
| IX | Equipment Systems | pending — see legacy Parts VII–IX |
| X | Endgame Loops | pending — see legacy Parts II-B + XXIX (rifts/mythic forge in design doc + ascension) |
| XI | Death & Penalty | pending — see legacy Part XXVII |
| XII | Quest System & Codex | pending — see legacy Part XXIV |
| XIII | Loot Economy | pending — see legacy Parts XIX + XXVI |
| XIV | Storage, XP, Travel, Food | pending — see legacy Parts XIII–XVI |
| XV | Building & QoL | pending — see legacy Part XXII |
| XVI | Implementation Status Matrix | pending — see [`Home.md`](../home.md) status table |

The appendix has its own table of contents — see [`master-appendix.md`](master-appendix.md).

---

## Part I: Vision & Pillars

### The pitch in one paragraph

IridescentCraft is a power-fantasy modpack where players become absurdly powerful — but the world scales harder. Early-game is intentionally open and exploratory; gating tightens over four tiers, each unlocking new dimensions, new mod systems, and new equipment ceilings. The pack is **expert-lite**: you'll automate, you'll specialize, you'll fight bosses for unique drops — but you won't grind 80 hours of pre-progression bookkeeping to unlock the next tier. The goal is the moment a Mage destabilizes a planet with stacked spell power; the goal is the moment a Tech player walks through Glacio in a MekaSuit Mk2; the goal is the moment a Hybrid annihilates the Ender Dragon with Voidheart Blade in one hand and a Phoenix artifact equipped. The systems exist to make those moments *earned*.

### Design pillars

1. **Open early, gated late.** Tier 1 is permissive — the player explores the Overworld, learns Create, plays with a few starter spells. Tier transitions tighten progressively: T2 unlocks dimensions, T3 unlocks late-game mod content, T4 unlocks the cosmic-tier mods. The squeeze is intentional and pulls the player toward decision-making, not toward grind.

2. **Dual- (and triple-) path progression.** Every tier transition is solvable through tech, magic, hybrid, or boss-hunting paths. The player who built a Create farm reaches T2 the same way as the player who completed the Twilight Lich, and they both reach T2 at the same time as the player who collected Botania runes — but each arrives with different gear. The pack supports specialization without punishing it.

3. **Abundance of tools, not scarcity.** Gates are *when* you unlock things, not *whether*. Mid-tier curios don't have lifetime caps; rare drops aren't lottery-locked; tier-skip mechanics exist (recipe transmutation, boss tier-peek drops) so you can sneak a taste of next-tier power. The pack rewards engagement, not patience.

4. **No-drop death, durability cost.** Inventory survives death — the penalty is durability damage to all equipped gear, plus XP loss. Soulbound enchantment exists as a high-cost end-game protection. The point: dying isn't catastrophic, but isn't free.

5. **Power requires power.** Mob and boss scaling exceeds player scaling at every tier — you NEED god-tier gear by T4, because the world is built to match it. This is the "why" behind absurd MekaSuit Mk2 stats and uncapped mage spell-power stacking: they exist because the Ender Guardian, Ancient Remnant, Ender Dragon (post-buff), and Glacio mobs are built for them.

6. **Boss fights are the pinnacle.** The best weapons (Simply Swords uniques), the next-tier materials (Mahou reagents, ISS upgrade orbs, MekaSuit Mk2 components), and the rarest curios all come from bosses. A non-combat-focused player can reach T4 through tech or magic alone, but the *highlight* gear comes from facing the bosses head-on.

7. **Play your way.** Tech, magic, ranged, melee, summoner, hybrid — all valid paths to the endgame. Class systems (10 classes, 11 races, 13 origins) push the player toward specialization, but no class is closed off from any tier. The Witch of Ink can build a Mekanism factory; the MekaSuit-clad Tech player can equip Tetra-modular spell books. Build identity is encouraged; build silos are not.

### What "expert-lite" means here

Expert packs assume long pre-progression — hours of pre-mod minigames before the first mod unlocks. IridescentCraft is the opposite: every mod is *available* from T1 entry, but each is gated to a tier where its power level is appropriate. You start with Create + a starter spell book + Botania saplings on day one. You don't unlock Mekanism until T3, but Mekanism's *role* in the pack is clear from the codex on day one. The point is to keep the systems readable while the unlock cadence stays dramatic.

---

## Part II: The Tier System

The pack moves through four tiers. Each tier is a step-change in power, available content, and threat level. Tier transitions are explicit (the player unlocks AStages stage `tier_2` / `tier_3` / `tier_4`) and visible — items, recipes, dimensions, and ores all gate-check against current tier.

### Tier identity

| Tier | Identity | Player feel |
|------|----------|-------------|
| **1** — Bronze Age Explorer | Overworld only. Iron / copper / brass. Create kinetics. Starter spells. First village trades. | "I'm exploring and learning. Magic feels possible. Tech feels achievable." |
| **2** — Enchanted Adventurer | Twilight Forest, Blue Skies, the Aether. First dimensional bosses. Steel and Manasteel. Ars source infrastructure. Themed Simply Swords uniques. | "I'm specializing. My class identity is forming. I have a clear next-target boss." |
| **3** — Empowered Slayer | Undergarden, Deeper Darker, Nether. Diamond access. Terrasteel / Elementium / Enderium. Mekanism basic + Refined Storage entry. F&A Hephaestus Forge. Occultism spirit bindings. Cataclysm boss line. | "I'm powerful. I'm scaling. I have a factory or a mage-lab or a death-set." |
| **4** — God-Killer | Deep Aether, the End. Netherite / Gaia / Aethersteel. Mahou Tsukai. MekaSuit + Mekanism advanced. RFTools Dimensions. Ascension and Rifts. | "I'm absurd. The world responds in kind. The Ender Dragon and Ancient Remnant exist to be killed by *me*." |

For exhaustive per-tier material lists, dimension allocations, mob HP scaling factors, and mod placement — see [`master-appendix.md` Section A: Tier Material Reference](master-appendix.md#a-tier-material-reference) and [Section F: Mod Roster by Tier](master-appendix.md#f-mod-roster-by-tier).

### What gating actually does

Tier gating is enforced through **AStages** (per-player tier flags) integrated with **KubeJS** (event hooks) and a handful of **datapack overrides** (`icraft_*_overrides`). Concretely:

- **Items** — tier-inappropriate items can't be used (held, equipped, or consumed) until the stage is unlocked. A T2 player who finds an Awakening artifact via creative gift sees it inert until they reach T4.
- **Dimensions** — locked until the stage is unlocked. T2 dimensions (Twilight, Blue Skies, Aether) are accessible at T2; T3 dimensions (Undergarden, Deeper Darker, Nether) at T3; T4 dimensions (Deep Aether, End, Ad Astra planets) at T4.
- **Recipes** — tier-gated crafting. Workbenches, advanced materials, boss-tier crafting stations all check the player's tier.
- **Ores** — replaced (with a vanilla equivalent) until the appropriate tier. The player sees stone instead of diamond ore until T3; holystone instead of aether_debris until T4.

Tier transitions can happen via **any one** of several unlock paths (see Part III). The pack does not require players to grind every option; one is enough.

### The escalation curve

Across all four tiers, three things scale together: **player power** (gear, spells, perks), **mob threat** (HP, damage, behavior), and **content surface** (mods, structures, recipes). Player power scales fastest in the early mid-game (T1→T2 feels enormous because that's when specialization kicks in); mob threat scales fastest in late-game (T3→T4 is where Champions, Difficulty Mods, and progressive boss buffs compound). The intentional result: players feel powerful at every tier, but never trivialize the next one.

For the actual scaling factors (HP multipliers, damage multipliers, equipment chances, Champion rates per dimension) see [`master-appendix.md` Section D: Apotheosis Tables](master-appendix.md#d-apotheosis-tables) and the implementation script `kubejs/server_scripts/scaling/mob_scaling_unified.js`.

---

## Part III: Progression Paths

A "progression path" is the route a player takes through a tier transition. The pack offers **branching paths** at each transition: complete *any one* of several options to unlock the next tier. This is the pack's most distinctive structural decision — every other system follows from it.

### The branching unlock model

At each tier boundary, the player has 4-5 unlock options. Completing any one grants the next AStages tier flag. The options span four categories:

| Category | What it asks | Who it's for |
|----------|--------------|--------------|
| **Tech** | Build / automate / process at scale | Engineers, factory builders |
| **Magic** | Craft / acquire / channel magical resources | Mages, ritualists, casters |
| **Combat** | Defeat tier-appropriate bosses | Warriors, hunters, hybrid melee builds |
| **Exploration** | Visit / loot multiple dimensions or structures | Explorers, dimensional travelers |
| **Hybrid** (T3+) | Mix two of the above | Generalists, codex completionists |

At T2, the player has 5 options — any one unlocks T2. At T3, 5 options. At T4, 5 options. The categories overlap (a Combat path may consume Magic materials; a Hybrid path is by definition a mix), and the player can pursue more than one in parallel — but only one is needed.

For the exact unlock options at each tier and the recipes/quest IDs that grant the tier flags, see [`master-appendix.md` Section A.3: Tier Unlock Options](master-appendix.md#a3-tier-unlock-options) and the AStages config in `kubejs/server_scripts/gates/astages_restrictions.js`.

### Why branching, not linear

A linear progression (kill X, then Y, then Z) breaks specialization. If every player has to kill the Twilight Lich for T2, then every player needs Twilight gear at T2 — Mages, Tech players, and Hunters are all funneled into the same combat encounter. The branching model preserves specialization: the Mage unlocks T2 by crafting Mana Diamonds; the Tech player by building a Create automation chain; the Hunter by killing the Lich. All three reach T2 with their preferred gear and a path that matched their playstyle.

### The "abundance" guarantee

Each unlock path within a tier is fully sufficient. The pack does not require completing multiple paths to unlock a tier — one is enough. This is the **abundance of tools** pillar in concrete form: the player isn't forced through content they don't want.

This contrasts with most expert packs, which gate tier transitions behind multi-step quest chains that touch many mods. IridescentCraft's tier transitions are single-step: complete *one* qualifying objective, get the tier flag, get access to the next dimension/recipes/ores.

### Cross-tier material access (the bend, not the break)

Two mechanisms let a current-tier player access *small amounts* of next-tier material — tasting next-tier power without skipping the unlock:

1. **Transmutation (Grinding Path).** Expensive recipes convert current-tier materials into a small amount of next-tier material. T2 → T3 means 32-64 steel ingots for 1 diamond, etc. Inefficient by design — provides a taste, not a full unlock. Implemented via Create mixing, Thermal smelter recipes, or KubeJS `tier_skip.js` overrides.

2. **Boss Tier-Peek Drops.** Current-tier bosses occasionally drop next-tier reagents (5-15% rates). Twilight bosses can drop osmium or steel; Cataclysm T3 bosses can drop ancient_debris fragments. This rewards combat-focused players for engaging bosses harder than the tier requires.

Both mechanisms preserve the gate (you can't fully outfit yourself in next-tier gear without the unlock) but reward investment (you can sample next-tier capability if you put the work in).

For exact recipe costs, transmutation rates, and tier-peek drop percentages — see [`master-appendix.md` Section B: Tier-Skip Recipe State](master-appendix.md#b-tier-skip-recipe-state) and [Section C: Boss → Loot Mapping](master-appendix.md#c-boss--loot-mapping).

### Validation against implementation reality

The progression paths described here match what's currently shipped in `kubejs/server_scripts/gates/astages_restrictions.js`. Tier transitions are enforced via stage flags; dimension portals check against the appropriate flag; ores are replaced at lower tiers. Five tier-skip blocks exist (Mekanism Enriching/Combining/Purifying/Injecting/Mixing for diamond/emerald/netherite_scrap) plus a sixth via Botania Orechid datapack — all documented in [`master-appendix.md` Section B](master-appendix.md#b-tier-skip-recipe-state).

The 2026-04-27 audit pass closed an additional tier-skip vector: Occultism's dimensional miners now strip diamond/emerald/arcane_crystal from the `ores` ingredient tag (any miner) and require the `deeps` tag (Afrit + Marid only). See [Section H: Datapack Override Index](master-appendix.md#h-datapack-override-index) for the full set of tier-skip-prevention datapacks.

---

## Parts IV-XVI

These sections live in [`master-LEGACY.md`](master-LEGACY.md) until migrated. Migration cadence:

- **Session 2** (next): Parts IV (Worlds), V (Combat), VI (Player Character), VII (Magic), VIII (Tech), IX (Equipment).
- **Session 3**: Parts X (Endgame), XI (Death), XII (Quest), XIII (Loot Economy), XIV-XV (Storage/XP/Travel/Food/Building/QoL), XVI (Status Matrix).

Each migration session updates this file's Table of Contents to mark the migrated section as `migrated` with an in-doc anchor.

For implementation status of every system, see the [Implementation Status table on Home](../home.md).
