# IridescentCraft Master Design Document

**A progression-focused expert-lite Minecraft 1.20.1 (Forge) modpack.**

> This document is the canonical source of truth for IridescentCraft's design intent. It describes *what the systems are and why* — not the per-mod numerical configuration. **Numbers, tables, recipe lists, drop rates, mod rosters, and other implementation specifics live in [`master-appendix.md`](master-appendix.md).** When implementation changes, log it in [`changelog.md`](changelog.md) and update both docs as needed.
>
> **Migration status (2026-04-27):** rewrite complete. All 16 parts migrated to this doc; the appendix is fully populated. The previous monolithic 8,370-line master has been removed; its content is now distributed between this doc, the appendix, and `wiki/design/changelog.md`. Earlier git history of the legacy doc remains in the public IridescentCraft repo.

---

## Table of Contents

| # | Section | Status |
|---|---------|--------|
| I | [Vision & Pillars](#part-i-vision--pillars) | migrated |
| II | [The Tier System](#part-ii-the-tier-system) | migrated |
| III | [Progression Paths](#part-iii-progression-paths) | migrated |
| IV | [Worlds & Dimensions](#part-iv-worlds--dimensions) | migrated |
| V | [Combat & Difficulty](#part-v-combat--difficulty) | migrated |
| VI | [Player Character](#part-vi-player-character) | migrated |
| VII | [Magic System](#part-vii-magic-system) | migrated |
| VIII | [Tech System](#part-viii-tech-system) | migrated |
| IX | [Equipment Systems](#part-ix-equipment-systems) | migrated |
| X | [Endgame Loops](#part-x-endgame-loops) | migrated |
| XI | [Death & Penalty](#part-xi-death--penalty) | migrated |
| XII | [Quest System & Codex](#part-xii-quest-system--codex) | migrated |
| XIII | [Loot Economy](#part-xiii-loot-economy) | migrated |
| XIV | [Storage, XP, Travel, Food](#part-xiv-storage-xp-travel-food) | migrated |
| XV | [Building & QoL](#part-xv-building--qol) | migrated |
| XVI | [Implementation Status Matrix](#part-xvi-implementation-status-matrix) | migrated |

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

## Part IV: Worlds & Dimensions

The pack's dimensional layout is **the spine of the tier system**. Each tier opens a band of dimensions; each dimension carries its own difficulty, themes, and content surface. Two design choices distinguish IridescentCraft from base Minecraft: the **Nether is T3** (not T1/T2), and the **End is T4** (not the late-game finale of any tier). Twilight Forest, Blue Skies, and the Aether sit in the T2 band as "first dimensional" content. Deep Aether and the Ad Astra planets are T4-and-beyond.

### Dimension philosophy

A dimension is not a place to grind — it's a content arc. Each dimension has a thematic identity, a primary boss line, and a unique mechanic that distinguishes its play feel:

- **Twilight Forest (T2)** — first dimension, boss-heavy. The progression-gate boss (Naga → Lich → Hydra → Ur-Ghast → Knight Phantom → Snow Queen → Minoshroom → Alpha Yeti) is an 8-step encounter ladder. This is the pack's gentlest first-dimension experience.
- **Blue Skies (T2)** — Everbright/Everdawn duality. Elemental themes (Summoner / Alchemist / Starlit Crusher / Arachnarch). Hardcoded materials (Diopside, Charoite, Horizonite) replaced with Tetra integration for tier-appropriate stats.
- **The Aether (T2)** — vertigo + thin-air dimensional mechanic; scarce holystone; flight rewarded. Slider, Valkyrie Queen, Sun Spirit boss line.
- **Deeper Darker (T3)** — Sculk-themed underworld, "oppressive darkness" mechanic.
- **Undergarden (T3)** — hostile underground biome, Forgotten Guardian + Forgotten + Rotbeast as primary mobs.
- **The Nether (T3)** — repositioned from vanilla early-game to mid-game. 50% Champion spawn rate; Wither Skeletons function as mini-bosses; Cataclysm boss line (Netherite Monstrosity, Ignis, the Harbinger, Maledictus, Ancient Remnant) lives here.
- **The Abyss (T3)** — third dimension at T3. Heavy custom-content mod with 30 ring-removal recipes + 7 elemental armor sets + Nosaj boss line. Most-wired mod in the pack.
- **Deep Aether (T4)** — endgame extension of the Aether. Aethersteel chain (15+ items + 2 ore replacements) is the cleanest T4 metal in the pack.
- **The End (T4)** — multi-zone scaling, boss gauntlet, Ender Dragon scaled to T4 power level. Drag the Voidheart Blade out of the Mythic Forge here.
- **Ad Astra Planets (T4 — post-Glacio cap)** — Moon, Mars, Mercury, Venus, Glacio. Each is gated behind a 4-tier rocket progression (T1 rocket → Moon, T2 rocket → Mars, T3 rocket → Venus/Mercury, T4 rocket → Glacio). Glacio is the post-T4 endgame: required reagent for MekaSuit Mk2.
- **Witch of Ink dimension** (Origin-tied) — accessible via the Witch of Ink Origin progression at T3+. Origin-specific content surface.

### Dimensional mechanics (per-dimension play-feel modifiers)

Beyond difficulty multipliers, each dimension can have **scripted mechanics** that change how the player interacts with that space:

- **Aether: thin-air + vertigo + updrafts** — limited oxygen mechanic, gentle gravity/glide tuning, scripted updraft columns near floating islands.
- **Abyss: oppressive darkness + corruption + fear aura** — visibility tuning, slow corruption stat-debuff buildup, scripted fear-aura near specific mob types.
- **End: dragon exploration gate + multi-zone scaling** — End is divided into "outer islands" (T4 baseline) and "deep islands" (T4-amplified); scaling factor doubles past a certain distance. 9 advancement overrides shape the End-progression flow.
- **Ad Astra: oxygen + atmospheric pressure + cryogenic damage** — each planet has its own atmosphere; players need oxygen tanks (T4 entry equipment) and the appropriate suit. Glacio adds cryogenic damage on top.

Each mechanic is one or two KubeJS server-tick handlers with persistent player-data flags. The implementation lives in `kubejs/server_scripts/scaling/dimension_mechanics.js`. The numerical specifics (oxygen drain rate, fear buildup per second, etc.) live in [`master-appendix.md` Section D](master-appendix.md#d-apotheosis-tables) (alongside the difficulty tables).

### Access mechanism

Dimensions are gated through AStages dimension flags. A T2 player who tries to enter the Nether sees the portal fail to ignite, with a chat message indicating they need T3 access. Dimension entry items (TF portal activator, Aether portal blocks, BS arc, Nether ignition) all check stage flags before triggering.

The TF portal activator was changed from vanilla diamond to a T1 boss token (per implementation history) — the pack's first dimension shouldn't gate on diamond access since diamonds are T3.

For exact dimension-difficulty multipliers, Champion spawn rates, and the boss HP scaling table, see [`master-appendix.md` Section D](master-appendix.md#d-apotheosis-tables).

---

## Part V: Combat & Difficulty

The pack's combat model is **player escalates, world escalates harder**. Through T1-T4, both player power and mob threat scale, but mob threat scales more aggressively. By T4, an unbuffed player meets an unbuffed mob and loses; the player's job is to *be* buffed.

### What mob threat actually does

Threat scales along five axes: HP, damage, behavior, equipment, and frequency. Each axis is controlled by a different mod and tunable independently:

- **HP + damage** — `ScalingMobs` (dimension-keyed multipliers)
- **Behavior + AI** — `Cataclysmic Combat` enhanced AI; `Improved Mobs` adds tool-use, block-breaking, bridge-building, gear-equipping; `Difficult Caves` adds cave-specific aggression
- **Equipment** — `Improved Mobs` lets mobs spawn equipped (with iron-tier gear capped to prevent low-tier players being one-shot by armor-stacked zombies); `Champions` adds elite-mob affixes via `mob_equipment.js`
- **Champion frequency** — dimension-keyed Champion spawn rate (15% Overworld → 60% End)
- **Boss persistence** — `Progressive Bosses` increases each boss's stats per kill (encourages varied boss hunting); custom `boss_progressive.js` supplements with our own scaling

For exact values across all 9 dimensions, see [`master-appendix.md` Section D](master-appendix.md#d-apotheosis-tables).

### What player power actually does

Player power scales along four axes: equipment tier, attribute baseline, skill investment, and consumable stack:

- **Equipment** — Tetra-modular weapons, modular spell books, tiered armor sets (vanilla → mod-tier → boss-drop). The Equipment Systems part (IX) covers this in depth.
- **Attribute baseline** — Origins/Races/Classes provide innate stat modifiers; JustLevelingFork's leveling adds passive HP/damage scaling.
- **Skill investment** — Pufferfish's Skills (+ AStages bridge) provides 6 skill trees with command-reward investment.
- **Consumable stack** — food diversity (Spice of Life HP bonuses), Iron's Spellbooks elixirs, Apotheosis gem socketing, Relics charm leveling.

Player power is **uncapped** in several axes. Mage spell power stacks multiplicatively with no ceiling (per design memo `feedback_mage_power_curve.md`). MekaSuit Mk2 stacks armor + utility modules without a hard cap. The pack's stance: players should be able to specialize hard; the world matches that stat ceiling, so "broken" builds aren't broken — they're appropriate.

### Bosses are the pinnacle

Each tier has a roster of bosses serving as the difficulty climax + loot peak of that tier. T2 bosses (Twilight 8 + Blue Skies 4 + Aether 3) are the entry-tier challenge. T3 bosses (Cataclysm 8 + Ignited Revenant + Wither + Cocked-up Stalker) are the mid-game peak. T4 bosses (Ender Dragon + Ender Guardian + Ancient Remnant + Gaia Guardian + Warden + Coralssus + Void Blossom) are the endgame.

Boss kills are tracked in `gates/milestone_detection.js` — the per-player T2/T3/T4 boss-kill counter auto-grants the next AStages tier when the threshold is reached. This is the boss-path unlock from Part III. No physical progression-token items needed; the internal counter handles it.

### The "broken but not breakable" balance

The pack's design accepts that *some* builds will be broken — that's the power-fantasy point. What it doesn't accept is broken-via-exploit. Every audit-driven gate (the 5 Mekanism processing-recipe blocks, the Botania Orechid datapack, the Occultism miner override, the 6 cataclysm boss-themed weapon allocations) closes a path that would let a low-tier player skip into broken-tier gear without earning it. See [Section B in the appendix](master-appendix.md#b-tier-skip-recipe-state) for the running ledger.

---

## Part VI: Player Character

The character creation flow is **three sequential prompts on first join**: Origin → Race → Class. This three-layer model creates more build identity than any two-layer system, while keeping each layer's choice readable.

### The three layers

| Layer | Source | What it provides | Count |
|-------|--------|------------------|------:|
| **Origin** | Origins (Forge) + Iridescent Origins | Species fantasy with unique abilities + tradeoffs (Avian flies but takes more damage, Blazeborn fire-immune but water-vulnerable) | **13 origins** (9 vanilla rebalanced + 4 custom; **no Human, no Mundane**) |
| **Race** | Iridescent Origins (Race layer) | Stat baseline + thematic flavor (Elf agility, Dwarf endurance, Demi-God uncapped potential, etc.) | **11 races** |
| **Class** | Iridescent Classes | Combat role + HP tier + glass-cannon status; defines playstyle | **10 classes** |

### Why three layers

A two-layer system (Origin + Class) collapses too many dimensions into one choice. By splitting Origin (species fantasy) from Race (stat baseline) and Class (combat role), the pack gets:

- **Build diversity**: a Faefolk Battlemage plays differently from a Demi-God Battlemage; a Berserker Witherborn plays differently from a Berserker Avian.
- **Identity readability**: each layer answers one question. "What am I?" (Origin), "What am I made of?" (Race), "What do I do?" (Class).
- **Respec flexibility**: respec only affects Class (combat role). Origin/Race are permanent. The cost of switching combat identity is bounded.

### Custom origins (4)

Beyond the 9 rebalanced vanilla origins, IridescentCraft ships 4 custom: **Witch of Ink** (ritual-magic specialist), **Artificial Construct** (machine-themed tech bias), **Witherborn** (undead aesthetic + Wither immunity), **Slimebodied** (slime physics + bouncing combat). Each has its own progression hook + dimension tie-in.

### Glass-cannon class layer

Several classes are explicitly **glass cannons** — high damage ceiling at the cost of survivability. The Mage classes (Archmage, Battlemage, Void Summoner) sit in this category: low base HP, high spell-power scaling, weak melee penalty. By T4, a Mage with full Tetra-modular Voidheart Blade + 3 spell-power curios is doing more damage per second than any tank class — but a single hit kills them.

This is intentional. The mage-power-curve pillar (no cap on stat stacking, weak early, peaks late) creates the back-loaded power fantasy.

For the full Origin / Race / Class roster + ability/stat tables, see [`master-appendix.md` Section A.6: Character Layer Reference](master-appendix.md#a-tier-material-reference) (to be populated in session 3) and the implementation in `kubejs/data/icraft/`.

### Skill investment + leveling

Layered on top of Origin/Race/Class:

- **Pufferfish's Skills**: 6 skill trees with command-reward effects. Investment via XP. Active progression — the player chooses what to invest in.
- **JustLevelingFork**: passive HP/damage/speed scaling per character level. Flat XP curve (~1000-2000 XP/level) tuned so leveling never feels like an XP sink. Passive — happens naturally as you play.

Both run alongside vanilla XP and the Apotheosis enchanting economy. See `kubejs/server_scripts/skills/skill_effects.js` for the active skill effect handlers.

---

## Part VII: Magic System

Magic in IridescentCraft is **not one mod** — it's an interlocking economy across **6 magic mods**, gated tier-by-tier, with cross-mod loot economy linking them. The progression: Botania (T1 entry) → Ars Nouveau (T1 entry through T2 infrastructure) → Iron's Spellbooks (T1 starter through T4 endgame, modular) → Forbidden Arcanus (T3 chokepoint) → Occultism (T3 spirit-binding) → Mahou Tsukai (T4 endgame). Each tier surfaces new mods without retiring older ones — a T4 mage uses Botania mana flowers, Ars source jars, ISS modular books, F&A Hephaestus Forge, Occultism Marid miners, AND Mahou rituals simultaneously.

### Tier 1 — Magic entry (Botania + Iron's Spellbooks + Ars Nouveau starter)

**Botania**: starter mana chain (Apothecary → Pure Daisy → Mana Pool entry tier → Manaweave Cloth). Orechid is T1 entry (datapack restricts it to non-tier-skipping ores).

**Iron's Spellbooks (ISS)**: starter scrolls (random pre-rolled spells) + copper spell book + 6 starter spell types (magic_missile, firebolt, magic_arrow, fang_strike, summon_vex, healing_word). Class-kit Mages start with 2 pre-NBT-baked scrolls. Village chest scrolls and overworld T1 loot drop usable scrolls.

**Ars Nouveau (entry)**: the **novice spell book is T1-craftable** (book + iron tool — no Imbuement Chamber needed) and T1 form glyphs seed into chest loot. A new player can inscribe at a Scribes Table on day one. (This was a 2026-04-24 design correction — the legacy doc had Ars at T2 entry, but tester feedback showed glyph + spell-book entry was needed earlier to make the Mage class playable from day 1.)

The cross-mod ink economy starts here: ISS common_ink and uncommon_ink drop from T1-T2 mobs, allowing early players to scribe simple spells.

### Tier 2 — Source infrastructure + mid-tier magic

**Ars Nouveau (deep)**: Imbuement Chamber, Arcane Core, ritual brazier, full source-network expansion. Apprentice spell book unlocks here. Spell-crafting bench gates behind T2 stage. T2 form glyphs (aoe, underfoot) and mobility/utility effect glyphs seed into Twilight/Aether/BS chest loot at ~14% combined.

**Botania (T2)**: Manasteel chain, Mana Spreader fundamentals, Runic Altar, mana diamond + mana pearl transmutation outputs.

**ISS (T2)**: rare_ink starts dropping, T2 boss runes (fire/ice/nature/protection) appear in T2 boss-drop loot files.

### Tier 3 — Chokepoints + spirit binding

**Forbidden Arcanus**: Hephaestus Forge (T3-gated recipe). Arcane Crystal (T3-gated worldgen + ore replacement). The mod is **not blanket-mod-gated** — passive items (Aureal bottles, edelwood) leak into early game intentionally; per-item gating handles the progression-critical chain (audit Phase 4 documented this clearly).

**Occultism**: Foliot/Djinni/Afrit summon books, Books of Calling, Iesnium chain. Dimensional miner exploit closed via the `icraft_occultism_overrides` datapack (audit Phase 1). Like F&A, occultism is per-item gated — mod-blanket would block its passive items.

**ISS (T3)**: epic_ink, T3 runes (blood/ender/cooldown), upgrade orbs (fire/ender/lightning) drop from Cataclysm + Stalwart Dungeons + custom-boss loot tables. T3 Diamond Spell Book (3-modular variant).

### Tier 4 — Endgame magic

**Mahou Tsukai**: T4 player-spell mod with no native mob drops. The pack injects Mahou reagents (attuned_emerald, fae_essence, attuned_diamond, kodoku) into T4 boss drops via `mahou_synergy_drops.js` — **Cataclysm Ender Guardian, Vanilla Warden, Ender Dragon** all contribute Mahou reagents. This is the cross-mod synergy peak: a Mage farming bosses is simultaneously progressing 5 magic mods.

**ISS (T4)**: Netherite Spell Book + 7 themed modular variants (Dragonskin, Druidic, Blaze, Evoker, Necronomicon, Villager, Rotten). Legendary ink drops from T4 bosses.

**Botania (T4)**: Gaia Ingot, Gaia Block. Voidheart Blade is forged from `awakened_lichblade` (Ancient Remnant T4 drop) at the Mythic Forge using `gaia_ingot` + `kubejs:icraft_rift_shard` + `void_fragment` + `primordial_essence`. The Gaia Guardian boss is the Botania T4 capstone.

### Iridescent Modular Spells (Phase 6 native Tetra integration)

The pack's signature magic system is the **Iridescent Modular Spells mod** — a custom Forge content mod that bridges Tetra's modular-item workbench to ISS and Ars Nouveau spell books. Each modular book has 4 module slots (front_cover / back_cover / spine / pages for ISS; front_cover / back_cover / spine / dye for Ars), each accepting tetra:metal/skin/bone/gem/fibre/fabric materials, each contributing stat bonuses (max_mana, mana_regen, spell_power, cast_time_reduction, cooldown_reduction). Lining improvements (fabric/fibre/skin) layer on top.

**The intrinsic stat overlay**: each book has a `BookKind` (COPPER, IRON, GOLD, DIAMOND, NETHERITE, DRAGONSKIN, DRUIDIC, BLAZE, EVOKER, NECRONOMICON, VILLAGER, ROTTEN; plus 3 Ars tiers NOVICE / APPRENTICE / ARCHMAGE) which contributes a baseline stat profile. Diamond Spell Book is +50 mana / +0.10 spell_power baseline; Necronomicon is +100 mana / +0.30 spell_power / +50% Necro school. Stack with module/lining bonuses — uncapped per the mage-power-curve pillar.

**The Tetra replacement system**: vanilla ISS/Ars spell books auto-convert to modular variants on next inventory tick. No need to recipe-strip vanilla books or rewrite their loot tables — the conversion is transparent.

**12 ISS variants + 3 Ars variants = 15 modular spell books total**. Each tier-staged. Each available via Tetra workbench crafting.

**Phase 7 (deferred design)**: 6 elemental subclasses (Pyromancer / Cryomancer / Necromancer / Priest / Druid / Stormcaller) layered on top of the existing Mage classes. Each +50% to one school, -10% melee malus (vs Archmage's -25%), no starter armor, add-alongside not replace.

For detailed stat profiles, slot definitions, and lining attribute mappings, see [`master-appendix.md` Section E: Custom Items Registry](master-appendix.md#e-custom-items-registry) and the `iridescent-modular-spells-mod` source repo.

---

## Part VIII: Tech System

Tech in IridescentCraft is a **clean four-tier ladder**: Create (T1) → Thermal + Industrial Foregoing basic (T2) → Mekanism basic + Refined Storage + IF advanced (T3) → Mekanism advanced + RFTools + Ad Astra (T4). Each tier opens a new automation paradigm without retiring the previous; a T4 player runs Create kinetics for cosmetic processing, Thermal phytogenic insolators in greenhouses, Mekanism Digital Miners for resource generation, and Ad Astra rockets for planetary travel — all simultaneously.

### Tier 1 — Create (kinetic automation)

Available immediately. Stress units, crushing wheels, mechanical mixers, deployers, encased fans. Pretty Pipes for early item logistics. Not gated by anything — the player's first power source.

Crushing wheels run at ~1.5× ore processing rate (vanilla). Create's whole feel is "engineering puzzles + visible mechanical motion" rather than "resource numbers go up." The pack uses Create as the T1 baseline because it doesn't trivialize anything — it shapes how the player thinks about automation before higher-tier mods add raw throughput.

### Tier 2 — Thermal Series + Industrial Foregoing (basic)

T2 stage unlocks Thermal Series (Phytogenic Insolator, Smelter, Pulverizer, basic Resonant cells) and IF basic (Block Placer, Block Breaker, basic mob interaction).

Thermal Pulverizer is **the first 2× ore processing**, gating the player into RF power generation. Phytogenic Insolator handles automated farming including Botania flowers (cross-system synergy). IF basic provides the first non-Create item logistics that doesn't require kinetic stress.

### Tier 3 — Mekanism (basic) + Refined Storage + Industrial Foregoing (advanced)

T3 stage opens the major tech jump. Mekanism basic provides up to 5× ore processing (Enrichment Chamber → Combiner chain), energy cubes, basic factories. Refined Storage opens digital storage (controller, grid, drives, crafters). IF advanced opens the Laser Drill, Mob Crusher, and the auto-mining stack.

**Five cross-mod tier-skip blocks ship at T3 to prevent shortcut paths**: Mekanism Enriching/Combining/Purifying/Injecting are blocked from converting low-tier inputs to diamond/emerald/netherite_scrap; Create:mixing is blocked from converting copper to osmium ingot. Plus the Botania Orechid datapack (T1 mod) restricts diamond/ancient_debris Orechid weights to zero. The Occultism dimensional miner override (Phase 1 of the audit fix plan, 2026-04-27) restricts Foliot/Djinni miners from producing diamond/emerald/arcane_crystal — the original `ores` ingredient tag was leaking T3 ores to T1-T2 miners.

### Tier 4 — Mekanism (advanced) + RFTools Dimensions + Ad Astra

T4 stage opens **Mekanism advanced** (Digital Miner, Fusion Reactor Controller, MekaTool, MekaSuit + 4 pieces, Antiprotonic Nucleosynthesizer, atomic_alloy, SPS — 11 specific items individually staged at T4) and **RFTools Dimensions** (Dimension Builder, Dimension Editor, dimensional_shard_ore at T4 master only).

**Ad Astra** opens here too. The NASA Workbench requires `kubejs:reality_progression_token_t4` + Mekanism Steel Casing + netherite ingots. The 4-tier rocket progression (each rocket requires increasingly rare reagents — the T4 Glacio rocket needs `kubejs:primordial_essence`) gates each planet behind a tier-progression. Jet Suit recipes are stripped — MekaSuit fills that niche.

### MekaSuit Mk2 — the endgame chain

The pack's tech-endgame chain is **base MekaSuit (T4 entry-armor) → MekaSuit Mk2 (post-T4 ascension target)** via the Mythic Forge. Mk2 consumes all 4 base MekaSuit pieces + Aethersteel Ingot + Glacio Stone + Primordial Essence. This converts the natural Ad Astra "you've reached the last planet" moment into a tangible reward.

### Planetary economy

Each Ad Astra planet has a unique extracted-element economy. Moon Stone → Helium-3 + Titanium Dust. Mars Stone → Ferric Oxide + Cryogenic Crystal. Venus / Mercury / Glacio each contribute their own. Recipes routed through Create Crushing Wheels — the planetary loop reuses T1 infrastructure for T4-tier rewards.

### What about Refined Storage at T3?

RS gets a special-case dual-path recipe: Tech path (Mekanism + Thermal materials) and Magic path (Botania + Ars Nouveau materials). Hybrid builds — using both — get efficiency bonuses. This is the pack's most-explicit cross-system synergy and proves the dual-path pillar at the storage layer.

For the exact stage list at each tier, the cross-mod tier-skip block recipe IDs, and the Ad Astra rocket recipe matrix, see [`master-appendix.md` Section B](master-appendix.md#b-tier-skip-recipe-state) and [Section G](master-appendix.md#g-stage-restrictions).

---

## Part IX: Equipment Systems

Equipment in IridescentCraft is **5 sub-systems**: weapons (crafted + boss-drop split), armor (mod-tier + boss-drop split), curios (chest-pool + boss-drop), modular spell books (Tetra-integrated, see Magic System), and the modular-tools workbench (Tetra). Each follows the same design instinct: **clean role separation between crafted and dropped**.

### Weapons — Truly Modular (crafted) vs Simply Swords (boss-drop)

Truly Modular is the primary crafted-weapon system: parts-based, customizable, scales with material tier. A T2 Truly Modular sword is a 4-part build (blade + handle + guard + accessory) with each part using T2 materials. T4 Truly Modular is the netherite-tier ceiling for crafted weapons.

Simply Swords is the unique trophy-weapon system: **42 named uniques, all boss-drop only**. Recipes for the unique weapons are stripped (audit Phase 3.1: 43-entry Section E refresh, 2026-04-27). Each unique is allocated to a specific boss in `loot_overhaul.js` Section 8 — Tempest from Naga, Soulrender from Lich, Emberblade from Hydra, etc. 28 of the 42 are allocated; 14 are reserved for future boss mods (NovaBosses, Ultimate Bosses, Brutal Bosses) and currently creative-only.

The split is **clean**: crafted weapons are deterministic (build it from materials, get it), trophy weapons are aspirational (kill the boss, get the unique). A Mage can ignore Simply Swords entirely; a Hunter can ignore Truly Modular entirely. Both reach T4.

Other weapon sub-systems: **Iron's Spellbooks** (staves + spell scrolls — T1 to T4 progression), **Cataclysm** (signature boss weapons from Cataclysm boss drops), **Mahou Tsukai** (T4 ritual-cast weapons), **Mekanism MekaTool** (T4 tech multitool), **Too Many Bows** (14 named EPIC bows allocated T2-T4 in chest pools per audit Phase 2.2), **Better Combat** (passive animation/feel overhaul, always active), **Apotheosis affixes** (modifier layer on top of any weapon).

### Armor — vanilla + mod-tier + boss-drop layers

Armor follows the same crafted-vs-dropped split. Crafted armor uses Truly Modular's Armory companion. Boss-drop armor is mod-specific (Cataclysm Ignitium/Cursium/Witherite armor sets are recipe-stripped → boss-drop only; Theabyss Knight/Unorithe/Ragnarok/Dragon/Death armor sets are recipe-stripped → boss-drop only; ISS Pyromancer 4-piece is mob-drop). Iron Jetpacks ungated from T1 — early flight is intentional. Mahou Tsukai defensive spells, MekaSuit Mk2, and Mythic Forge endgame uniques (Voidheart Blade, Oblivion Aegis, Riftwalker Boots, Oblivion Crown) are T4 specific.

The pack's armor philosophy: **layer types should not stack power**. A T3 player should pick *one* of: Refined Obsidian (Mekanism, recipe-stripped per audit), Terrasteel (Botania), Diamond (vanilla), or boss-drop (Theabyss). The combinatorial space is wide enough that the choice itself is the build identity.

### Curio system — equipping is never gated

**Curios drop from tier-appropriate chest loot tables**, distributed across 4 chest pools by dimension band: T1 (Overworld), T2 (Twilight/Aether/Blue Skies), T3 (Nether/Undergarden), T4 (End/Deeper Darker/Abyss). Per-tier combined drop rates are 10/12/14/16% — a T1 chest has a 10% chance of dropping *some* curio from the T1 pool; T4 chests have 16% across the T4 pool.

**Players can always equip anything they find** — no AStages restriction on curios. If a T1 player finds an Awakening artifact via creative gift or boss tier-peek, they can equip it. The pack's stance: curio early access is rare enough not to break the gating, and rewards engagement.

The curio mod stack: Artifacts, More Artifacts, Relics, Celestial Artifacts, Elytra Slot. Each contributes a tier of items in the chest pools. Audit Phase 4.3 (2026-04-27) added 42 celestial_artifacts entries to chest pools, including the entire chat-color "tier" from gold (T4) to dark_purple (T3-T4) to green (T2) — all explicit, all tier-themed.

**Fight-breaking curios** (fire/wither/poison immunities, flight-granting items) are restricted to T2+ chest pools — a T1 player can't roll a fire-immunity ring from an Overworld dungeon. This is the only "soft gate" on curios, enforced by chest pool composition rather than item bans.

**Relics has a leveling system**: each Relic earns XP from use and unlocks tiered abilities. The XP investment cost acts as a natural soft-gate — early players don't have the XP to max their best Relics; endgame players do.

### Tetra modular workbench (cross-cutting)

Tetra is the connective tissue. **9 mod-integrated material categories** (vanilla metals + 27 modded metals + 5 gems + skin/bone/fibre/wool natively from Tetra). The pack ships `icraft_tetra_materials` datapack adding these. Players craft Tetra modular weapons, modular spell books (Phase 6), and modular tools all using the same workbench.

This is what makes the cross-mod material economy feel coherent. A diamond pickaxe head can hold a steel handle with a knightmetal accessory and a fiery cap; the player hones the result at the workbench, then improves it further with linings.

For the full curio chest-pool composition + Simply Swords boss allocation + custom-item registry, see [`master-appendix.md` Sections C, E](master-appendix.md#c-boss--loot-mapping).

---

## Part X: Endgame Loops

T4 is not the finish line — it's the starting line for the **endgame meta-loops**. The pack ships three: **Oblivion's Rift** (procedural dungeons), the **Mythic Forge** (uniques crafting), and **Ascension** (prestige cycle). These overlap and feed each other.

### Oblivion's Rift

Rifts are the pack's procedural-dungeon endgame. Each Rift run:

1. Player crafts a `kubejs:rift_keystone` (T4 reagent: Dragon Heart + Void Essence + `botania:gaia_ingot` + `minecraft:nether_star` + `kubejs:icraft_rift_shard`).
2. Keystone is consumed at a Rift Anchor block to enter a procedurally-generated dungeon (RFTools Dimensions backbone, structure datapacks fill the content).
3. Dungeon depth scales loot quality. The deeper floors drop `kubejs:icraft_rift_shard` (renamed 2026-04-27 from the original `kubejs:rift_shard` to resolve a `too_many_bows:rift_shard` namespace collision), `kubejs:void_fragment`, and rare `kubejs:rift_core`.
4. Death inside the Rift returns the player to base; keystone is consumed regardless of completion.

Compendium tracking captures every Rift-shard pickup (advancement at 10/50/250 shards), Rift Keystone craft, Rift Core acquisition, and Primordial Essence acquisition. See `kubejs/server_scripts/endgame/rift_mechanics.js`.

### Mythic Forge

The Mythic Forge is the **uniques-crafting endgame**. Crafted from `kubejs:icraft_rift_shard` + Mekanism Teleportation Core + Crying Obsidian + Steel Casing + Netherite (recipe in `endgame/mythic_forge.js`), it serves as the workbench for 5 endgame products:

1. **Mythic Catalyst I-V** — escalating power tokens used as "apply this Mythic effect to gear" reagents.
2. **Mythic Reforge Token** — apotheosis-style gear-modifier reset, costs 3 Primordial Essences.
3. **Voidheart Blade** (sword) — base: `simplyswords:awakened_lichblade` (Ancient Remnant T4 drop). On-kill damage stacking.
4. **Oblivion Aegis** (chestplate) — base: netherite chestplate. Death-delay protection.
5. **Riftwalker Boots** — base: netherite boots. Teleport + speed.
6. **Oblivion Crown** (helmet) — base: netherite helmet. Wallhack + first-strike.

All 4 unique items use `kubejs:rift_blueprint` as a slot ingredient — Blueprints drop from Rift completions (procedural dungeon endgame integration).

### Ascension

The Ascension system is the **prestige cycle**. After T4 + Glacio + Mythic Forge endgame, the player can ascend — losing some progression but gaining permanent stat multipliers + access to ascension-only content. Ascension consumes `kubejs:icraft_rift_shard` + `kubejs:void_fragment` + `botania:gaia_ingot` + `cataclysm:void_core` + `cataclysm:monstrous_horn`. 5 ascension levels available; mob scaling intensifies per level (per-character flag in persistentData).

Ascension creates an explicit reset cycle for veteran players: tier flags reset, ascension-flag persists, mob HP/damage scales 1.2× per level. The pack's late-game endgame is "how high can you ascend before the world breaks you?"

For Mythic Forge recipe matrices, ascension scaling formulas, and Rift floor loot tables, see [`master-appendix.md` Section E](master-appendix.md#e-custom-items-registry) (custom items registry includes the full endgame chain).

---

## Part XI: Death & Penalty

The pack's death model is **inventory-kept, durability-cost**. Players never lose items on death; the cost is durability damage to equipped armor + held weapon, scaled by the dimension where they died.

### Why this model

Vanilla "drop everything" punishes dimensional exploration too harshly for a pack designed around 9 dimensions. "Keep everything for free" undervalues death entirely. The middle path is **scaled durability damage** — the player keeps their gear (no item loss), but their gear takes a percentage hit that scales with dimension difficulty. A T1 Overworld death is a slap on the wrist (10% durability on iron = cheap repair). A T4 End death is significant (25% durability on netherite = expensive but capped repair).

### What happens at 0 durability

**Items don't break.** This is the Hytale-inspired twist: at 0 durability, items become **inert** (cannot deal damage, provide armor, or mine) but stay in the inventory with a "(Broken)" tooltip indicator. Repair restores them to functioning gear. This eliminates "I'm afraid to use my best gear" syndrome — the worst case is "you have to repair before using" not "you destroyed your gear."

Implementation: `kubejs/server_scripts/death_penalty.js` cancels the break event at 0 durability, sets a `broken=true` NBT tag, and items check that tag before applying their effects. Repair removes the tag.

### Soulbound enchantment

Repurposed from Ensorcellation as the pack's **most valuable enchant**:

- **Soulbound I**: 50% of death durability loss prevented.
- **Soulbound II**: 75% of death durability loss prevented.
- **Soulbound III**: 100% durability loss prevented + items cannot go inert from death.

Treasure enchant (high Arcana required). Soulbound III completely negates the death penalty for that item — the endgame insurance policy.

For the dimension-by-dimension durability-loss scale (10% Overworld → 25% End) and repair-cost cap formula, see [`master-appendix.md` Section D](master-appendix.md#d-apotheosis-tables).

---

## Part XII: Quest System & Codex

The pack ships two complementary documentation/quest systems: **Heracles** (active quest tracker) and **Patchouli Codex** (lore/reference book).

### Heracles quests

Heracles is the pack's quest engine (replacing the deprecated FTB Quests for our purposes). Quests serve three roles:

1. **Tier-unlock alternative paths** — every tier transition has a "complete this quest" option as one of the 4-5 unlock options (per Part III). The Twilight Lich quest, the Botania Mana Diamond quest, the Create Automation Demonstration quest — all are valid T2 unlock paths.
2. **Boss-hunting tracking** — kill X T3 bosses to unlock a Mythic Catalyst recipe. Kill the Ender Guardian to unlock the Riftwalker Boots schematic.
3. **Optional-side rewards** — food diversity tracking (Spice of Life integration), automation milestones, exploration completionism, dimension-specific challenges.

Quests are not the *only* path through any system; they're a parallel rail that rewards engagement.

### Patchouli Codex

Codex is the **lore + reference** layer. The pack ships `iridescent_codex_data.jar` as a custom-bundled JAR (modId `icraft`, see CLAUDE.md "Custom Bundled JARs"). 11 categories, 80+ entries:

- **Choosing Your Build** — origin/race/class guide for new players.
- **Origins Guide** — full 13-origin breakdown with abilities + tradeoffs.
- **Classes** — 10-class combat-role guide.
- **Champions / Enchantments / Affixes** — combat system reference.
- **Tier System** — what each tier unlocks (kept in sync with this design doc).
- **Mods Overview** — per-mod role + tier placement.
- **Compendium milestones** — achievements + tracking notes.

Codex entries are **advancement-gated** — entries about T4 content show only after the player has unlocked T4. This keeps the codex spoiler-light for early players while still serving as the canonical in-game reference.

Implementation: `kubejs/server_scripts/codex_delivery.js` gives the codex book on first join. The book uses Patchouli's bytecode-patched jar (resource-pack enforcement disabled — see [Section J of the appendix](master-appendix.md#j-bytecode-patches)).

---

## Part XIII: Loot Economy

The pack's loot economy is **the most-distributed system in the pack** — 322 references to ISS alone, 88 entities with explicit LootJS rules, 4 dimension-banded chest pools, 8 boss-drop allocation files. This part summarizes the design intent; the exact tables live in [`master-appendix.md` Section C](master-appendix.md#c-boss--loot-mapping).

### The cross-mod ink/rune economy

The pack's most distinctive loot mechanic is the **Iron's Spellbooks ink/rune/upgrade-orb economy distributed across every boss tier**. Every dimension's bosses contribute reagents to the shared ISS ecosystem:

- **Tier 1-2 mobs**: common_ink + uncommon_ink. Mostly Alex's Mobs + Twilight Forest mobs.
- **Tier 2 bosses**: rare_ink + T2 runes (fire/ice/nature/protection) + tier-themed simplyswords uniques.
- **Tier 3 bosses**: epic_ink + T3 runes (blood/ender/cooldown/lightning) + upgrade orbs (fire/ender/lightning).
- **Tier 4 bosses**: legendary_ink + Mahou reagents (attuned_emerald/attuned_diamond/fae_essence/kodoku, per `mahou_synergy_drops.js`).

Mahou Tsukai is **the connective-tissue beneficiary** — the mod has no native mob drops, so the pack injects Mahou reagents into other mods' bosses (Cataclysm Ender Guardian, Vanilla Warden, Ender Dragon all drop Mahou reagents). This is a 2026-04-27 design correction making Mahou a viable T4 magic mod for combat-focused players.

### The 4 chest pools

Curio + artifact + relic + spell-book chest loot is distributed across 4 tier-banded pools in `loot/lootjs_overhaul.js` Section 1:

| Pool | Dimensions | Combined drop rate | Pool size (post-audit) |
|------|------------|-------------------:|-----------------------:|
| T1 | Overworld | ~10% | 19 items |
| T2 | Twilight, Aether, Blue Skies, Deep Aether | ~12% | 31 items |
| T3 | Nether, Undergarden | ~14% | 38 items |
| T4 | End, Deeper Darker, Abyss | ~16% | 33 items |

Per-tier rates increase modestly as the player progresses (signal of "you're getting better stuff"). Per-item rate is the combined rate divided by pool size — so each individual item is a 0.3-0.5% chance per chest. Roll independently per item.

The audit pass (Phases 2.1, 2.2, 4.3, 2026-04-27) added 100+ items across all 4 pools — moreartifacts (32), too_many_bows (30), celestial_artifacts (42 chat-color triage). Pre-audit pool sizes were ~16 per tier; post-audit pools span the listed sizes above.

### The 8 boss-drop loot files

Boss-specific drops live in 8 dedicated files under `kubejs/server_scripts/loot/`:

1. `iss_boss_drops.js` — 5 ISS bosses + ISS mob types (cryomancer, pyromancer)
2. `iss_boss_first_kill.js` — guaranteed first-kill drops (necronomicon from Dead King, evoker_spell_book from Archevoker, etc.)
3. `cataclysm_boss_drops.js` — 8 Cataclysm bosses with ISS reagent + simplyswords weapon drops
4. `twilight_boss_drops.js` — 8 Twilight bosses with ISS reagents + simplyswords uniques (Tempest from Naga, Soulrender from Lich, etc.)
5. `blue_skies_drops.js` — 4 Blue Skies bosses + Runic Arc allocation
6. `alexsmobs_drops.js` — 21 Alex's Mobs entities (with mimicream nerf to 1%)
7. `stalwart_dungeons_drops.js` — 7 nether mini-bosses
8. `mahou_synergy_drops.js` — 14 cross-mod boss → Mahou reagent drops
9. `dimensional_boss_drops.js` — 11 cross-dimensional bosses (Aether, Deep Aether, Undergarden, Mutant Monsters, Warden)
10. `terramity_boss_drops.js` — 7 terramity non-gun melee weapons (audit Phase 4.1, 2026-04-27)

(That's 10, not 8 — the 8 was the count *before* the 2026-04-27 audit added the Mahou synergy + Terramity allocations. Documenting the post-audit reality.)

### What's intentionally NOT in chest loot

- **Simply Swords uniques** — recipe-stripped + not in any chest pool. Boss-drop only.
- **Cataclysm boss-set armor** (Knight, Ignitium, Cursium, Witherite) — recipe-stripped + boss-only.
- **Theabyss boss-set armor** (Knight, Unorithe, Ragnarok, Dragon, Death) — recipe-stripped + boss-only.
- **MekaSuit Mk2 components** — recipe-stripped + Mythic Forge endgame only.
- **Custom mythic uniques** (Voidheart Blade, etc.) — Mythic Forge crafting only.
- **Awakening artifacts** (rpgseteffects) — direct T4 boss drops only (pouch table strips them at T2).

This lockdown ensures the boss-drop tier holds: getting the boss-only items requires actually fighting the bosses.

For the full 88-entity boss → loot mapping with drop chances, see [`master-appendix.md` Section C](master-appendix.md#c-boss--loot-mapping).

---

## Part XIV: Storage, XP, Travel, Food

Four smaller systems clustered together. Each has its own progression curve, but the curves are mostly orthogonal to the main tier system.

### Storage progression

| Tier | Storage | Transport |
|------|---------|-----------|
| T1 | Sophisticated Backpacks (iron), Storage Drawers (basic) | Pretty Pipes, Create belts |
| T2 | Sophisticated upgrades (steel), Drawers upgrades | Thermal Ducts, IF basic transport |
| T3 | Refined Storage (digital — see Part VIII), Sophisticated (diamond) | XNet, IF advanced |
| T4 | RS advanced (Infinity Booster, Extra Disks), Sophisticated (netherite) | Mekanism QIO, RFTools |

**EnderChests/EnderStorage** are gated to T4 — cross-dimensional item transfer is endgame, not a starter convenience.

**Flux Networks** is ungated (cross-dimensional RF is fine — server bootstrapping is acceptable).

### XP economy

XP is **plentiful with many things to spend it on**. Sources: mob kills (dimension-multiplied), XP from Crops, boss kills, quest rewards, villager emerald-to-XP trades, cooking/crafting XP. Sinks: JustLevelingFork leveling, Pufferfish Skills investment, Apotheosis enchanting (flat-cost not exponential), Relic leveling, anvil operations (Easy Anvils reduces but doesn't eliminate cost), Reforging.

Mods that make XP more accessible (Tax Free Levels, Easy Anvils, Easy Magic, Table of Experience) are intentional — the sinks are what matter, and players should always have something valuable to invest XP in.

### Travel

**Free teleportation philosophy**: exploration should feel liberating, not punishing.

- **Waystones**: finding/activating is free in all dimensions. Crafting a waystone is expensive (rare custom boss drops) at all tiers. Waystone Towers generate naturally as a fast-travel network. Cross-dimensional teleport works freely between activated waystones.
- **Iron Jetpacks**: T1 (low-tier), better with mat tier. Early flight intentional.
- **Icarus**: T3-gated per implementation status (audit Phase 4.4 confirmed clean).
- **Origins flight**: ungated, intentional.
- **Elytra Slot**: available when elytra is obtained (T4 from End naturally).

### Food + hunger

**Major progression system** — food diversity = HP bonuses = survival in harder dimensions.

Mod stack: Hunger Overhaul (faster drain), Spice of Life: Carrot Edition (diverse-eating HP bonuses), Farmer's Delight + addons (complex cooking), Pam's HarvestCraft 2 (hundreds of crops), Cooking for Blockheads (kitchen multiblock), Brewin' and Chewin' (fermentation), Simple Farming, Sleep Hunger.

Design: all food and farming is **ungated from T1** — no crop/recipe staging. Players who diversify gain Spice of Life HP bonuses; players who eat only steak struggle in T3+ dimensions due to missing HP bonuses. **Natural soft-gate**: best food diversity requires dimensional ingredients (Nether's Delight = T3, Alex's Delight = mid-tier, etc.).

This makes cooking a parallel progression that rewards engagement without hard-blocking.

---

## Part XV: Building & QoL

Both **completely ungated from T1**. The pack's stance: building and QoL features should never feel restricted; they make the world more livable, not more powerful.

### Building mods

Chipped, Macaw's suite (Bridges, Fences, Furniture, Roofs, Trapdoors), Decorative Blocks, Decorative LGBT Wall Flags, Valhelsia Furniture, Domum Ornamentum, ConnectedTexturesMod, Connected Glass, Rechiseled (status: removed due to a SuperMartijn642 Core Lib load order issue per implementation history), chisels-and-bits, Structurize.

### QoL mods

JourneyMap, Jade, AppleSkin, Mouse Tweaks, Controlling, Inventory HUD+, Overflowing Bars, Fast Leaf Decay, TrashSlot, Trash Cans, FTB Ultimine, FTB Chunks, FTB Essentials, No Chat Reports, Simple Voice Chat, all performance mods (Embeddium, ModernFix, etc.).

These mods support the pack's "expert-lite" identity: powerful tooling, low overhead, no busywork.

---

## Part XVI: Implementation Status Matrix

For the live implementation status of every system in the pack, see the **Implementation Status table on [Home](../home.md)**. The table lists every major system + sub-system + mod-integration with a "Implemented / In Progress / Planned" status flag.

The status table is the source of truth for "what's shipped." This design doc is the source of truth for "what's intended." The two stay loosely synchronized — when intent changes, this doc updates; when implementation changes, the status table updates and the changelog logs the change. Cross-checks happen via the design changelog at [`changelog.md`](changelog.md).

For per-mod balance audit verdicts (which mods are GREENLIT, LIGHT POLISH, MEDIUM REWORK, etc.), see the private internal repo's `audits/` directory. That repo is the contributor-only living-document for ongoing balance work.

---

## Appendix

For all numerical data, recipe state, drop tables, mod rosters, custom item registries, KubeJS script index, and bytecode-patch references, see [`master-appendix.md`](master-appendix.md).
