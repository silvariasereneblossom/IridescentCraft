# IridescentCraft — Master Design Document

> **A progression-focused, expert-lite Minecraft 1.20.1 (Forge) modpack.**
> Power-fantasy gameplay across four tiers, branching unlock paths, dual-path tech/magic progression, no-drop death with durability cost, and an endgame loop that rewards deep specialization.

---

## About this document

| | |
|---|---|
| **Purpose** | Canonical record of what the pack's systems are and *why*. Implementation-agnostic; no recipe lists, no drop rates. |
| **Audience** | Design contributors, advanced testers, mod authors building integrations. |
| **Companion docs** | [`master-appendix.md`](master-appendix.md) — all numbers, tables, and registries. [`changelog.md`](changelog.md) — dated record of design changes. |
| **Editing rule** | When intent changes, update this doc and log the rationale in the changelog. Numerical changes go in the appendix. |

The implementation status of every system lives in the [Home page status table](../home.md). Per-mod balance audit verdicts and private postmortems live in the contributor-only `IridescentCraft-internal` repo.

---

## Quick reference: terminology

Recurring terms used throughout this document.

| Term | Meaning |
|------|---------|
| **Tier (T1–T4)** | Player progression band. T1 = Overworld only; T2 = first dimensional; T3 = late-game mod content + Nether; T4 = endgame, End, Ad Astra. |
| **AStages** | The progression mod that holds per-player tier flags. Items, dimensions, recipes, and ores all gate-check against the player's current stage. |
| **Tetra** | Modular-item workbench framework. Used for the pack's Truly Modular weapons, modular tools, Iridescent Modular Spells, and **Iridescent Reforging** (modular armor — armor extension that bridges Tetra's gap). |
| **Apotheosis** | Affix + reforging + gem socketing system. Adds Common→Mythic affix tiers, sigil-tier workstations, and elite "Apotheosis bosses." |
| **Champions** | Elite mob spawn tier with combat affixes (separate from Apotheosis gear affixes). Spawn rate scales with dimension. |
| **ISS** | Iron's Spellbooks. The pack's primary spell-system mod; provides ink/rune/upgrade-orb reagents that are distributed across every dimension's bosses. |
| **F&A** | Forbidden & Arcanus. T3 magic mod centered on the Hephaestus Forge. |
| **Mythic Forge** | Custom T4 crafting station for unique endgame items (Voidheart Blade, Oblivion Aegis, Riftwalker Boots, Oblivion Crown, MekaSuit Mk2). |
| **Iridescent Modular Spells** | Custom Forge content mod that bridges Tetra's modular-item workbench to ISS and Ars Nouveau spell books. 15 modular variants. |
| **Branching unlock** | Tier-transition model where any one of 4–5 unlock options grants the next tier. Tech / Magic / Combat / Exploration / Hybrid. |

---

## Table of contents

| Part | Topic |
|---|---|
| [I](#part-i--vision--pillars) | Vision & Pillars |
| [II](#part-ii--the-tier-system) | The Tier System |
| [III](#part-iii--progression-paths) | Progression Paths |
| [IV](#part-iv--worlds--dimensions) | Worlds & Dimensions |
| [V](#part-v--combat--difficulty) | Combat & Difficulty |
| [VI](#part-vi--player-character) | Player Character |
| [VII](#part-vii--magic-system) | Magic System |
| [VIII](#part-viii--tech-system) | Tech System |
| [IX](#part-ix--equipment-systems) | Equipment Systems |
| [X](#part-x--endgame-loops) | Endgame Loops |
| [XI](#part-xi--death--penalty) | Death & Penalty |
| [XII](#part-xii--quest-system--codex) | Quest System & Codex |
| [XIII](#part-xiii--loot-economy) | Loot Economy |
| [XIV](#part-xiv--storage-xp-travel-food) | Storage, XP, Travel, Food |
| [XV](#part-xv--building--qol) | Building & QoL |
| [XVI](#part-xvi--implementation-status) | Implementation Status |

---

## Part I — Vision & Pillars

### The pitch

IridescentCraft is a power-fantasy modpack where players become absurdly powerful — but the world scales harder. Early-game is intentionally open and exploratory; gating tightens over four tiers, each unlocking new dimensions, new mod systems, and new equipment ceilings.

The pack is **expert-lite**: players automate, specialize, and hunt bosses for unique drops, but they are not asked to grind 80 hours of pre-progression bookkeeping to unlock the next tier. The goals are concrete: *the moment a Mage destabilizes a planet with stacked spell power; the moment a Tech player walks through Glacio in a MekaSuit Mk2; the moment a Hybrid annihilates the Ender Dragon with Voidheart Blade in one hand and a Phoenix artifact equipped.* The systems exist to make those moments **earned**.

### Design pillars

1. **Open early, gated late.** T1 is permissive — explore the Overworld, learn Create, play with starter spells. Each subsequent tier transition tightens. T2 unlocks dimensions, T3 unlocks late-game mod content, T4 unlocks cosmic-tier mods. The squeeze pulls the player toward decisions, not toward grind.

2. **Dual- (and triple-) path progression.** Every tier transition is solvable through tech, magic, hybrid, or boss-hunting paths. Build a Create farm; complete the Twilight Lich; collect Botania runes — all valid T2 unlock paths. Specialization is supported, never punished.

3. **Abundance of tools, not scarcity.** Gates are *when* you unlock things, not *whether*. Mid-tier curios have no lifetime caps; rare drops are not lottery-locked; tier-skip mechanics exist (transmutation, boss tier-peek) so players can sample next-tier power before unlocking it. The pack rewards engagement, not patience.

4. **No-drop death, durability cost.** Inventory survives death — the penalty is durability damage to equipped gear and XP loss. The Soulbound enchantment is the high-cost end-game protection. Dying isn't catastrophic, but it isn't free.

5. **Power requires power.** Mob and boss scaling exceeds player scaling at every tier. By T4, the player *needs* god-tier gear — because the world is built to match it. This is the rationale behind absurd MekaSuit Mk2 stats and uncapped mage spell-power stacking: they exist because the Ender Guardian, Ancient Remnant, post-buff Ender Dragon, and Glacio mobs are built for them.

6. **Boss fights are the pinnacle.** The best weapons (Simply Swords uniques), the next-tier materials (Mahou reagents, ISS upgrade orbs, MekaSuit Mk2 components), and the rarest curios all come from bosses. Non-combat players can reach T4 through tech or magic alone, but the *highlight* gear comes from facing the bosses head-on.

7. **Play your way.** Tech, magic, ranged, melee, summoner, hybrid — all valid paths to the endgame. The character system (10 classes × 11 races × 13 origins) encourages specialization, but no class is closed off from any tier. The Witch of Ink can build a Mekanism factory; the MekaSuit-clad Tech player can equip Tetra-modular spell books. Build identity is encouraged; build silos are not.

### What "expert-lite" means here

Expert packs assume long pre-progression — hours of pre-mod minigames before the first real mod unlocks. IridescentCraft inverts that. Every mod is *available* from T1, but each is gated to a tier where its power level is appropriate. Players begin with Create, a starter spell book, and Botania saplings on day one. They will not unlock Mekanism until T3, but Mekanism's *role* is clear from the codex from day one.

The pack keeps the systems readable while the unlock cadence stays dramatic.

---

## Part II — The Tier System

The pack moves through four tiers. Each tier is a step-change in power, available content, and threat level.

> **Implementation note.** Tier transitions are explicit: the player unlocks AStages stages `tier_2`, `tier_3`, `tier_4`. Items, recipes, dimensions, and ores all gate-check against the active stage.

> **Design pillar — each tier feels complete.** A player who never moves
> past T1 should still feel like they're playing a full, satisfying modpack.
> Each tier ships with: a dedicated dimension or alt-loop, enough biome/mob/
> structure variety to fill 20+ hours of exploration, a workable progression
> ladder for both combat and magic builds, a complete cooking/farming layer,
> and at least one major endgame-style hook (a chase item, a worthy boss,
> a satisfying mid-tier capstone). Gates limit *content access between tiers*;
> they don't reduce *quality within a tier*. The pack isn't a tutorial that
> opens up at T4 — it's four overlapping modpacks stitched into a progression.

### Tier identity

| Tier | Identity | "Complete experience" composition | Player feel |
|------|----------|-----------------------------------|-------------|
| **T1** — Bronze Age Explorer | Overworld + Botania starter chain + Create kinetics + early ISS/Ars magic. Iron / copper / brass. (Post-alpha: Blue Skies as alt T1 dimension; see [Roadmap](../roadmap/planned.md).) | Overworld worldgen depth, Botania mana entry, Create early automation, starter spell scrolls, first village trades, Tetra modular weapons / wands / books, Apotheosis affix loop (common-rare). | *"I'm exploring and learning. Magic feels possible. Tech feels achievable."* |
| **T2** — Enchanted Adventurer | Twilight Forest + Aether + Blue Skies (until T1 move) — three dimensional alt-paths. First mechanized tech via Thermal Series. New combat addons: Simply Swords uniques, Apotheosis-tier elite mobs, themed boss drops. | Three dimensions with distinct progression curves, first dimensional bosses (Naga / Hydra / Lich / Sun Spirit / etc.), Thermal Series mechanized intro (steam dynamos / pulverizers / induction smelters), Ars Nouveau source infrastructure, Manasteel + Steel + dimension-themed metals. | *"I'm specializing. My class identity is forming. I have a clear next-target boss."* |
| **T3** — Empowered Slayer | Undergarden + Deeper Darker + Nether + Abyss. **The Mekanism tier** — most of the Mekanism progression chain (basic-to-intermediate factories, gas pipelines, fission/fusion prep). Diamond access. F&A Hephaestus Forge. Occultism spirit bindings. | Four mid-tier dimensions, Mekanism factories + Refined Storage networks, Terrasteel / Elementium / Enderium, Cataclysm boss line, Diamond/Netherite material chain unlocks, the affix Mythic ceiling. | *"I'm powerful. I'm scaling. I have a factory or a mage-lab or a death-set."* |
| **T4** — God-Killer | Deep Aether + the End + Ad Astra planets. **Full package** — Mekanism advanced (MekaSuit, fission, antimatter), Mahou Tsukai, RFTools Dimensions, Ascension cycles, Rifts. | Endgame dimensions (each with its own boss + chase items), MekaSuit Mk2 + Mahou Tsukai + Ascension loops, Gaia / Aethersteel / Primordial Essence, Mythic Forge, Ancient affix ceiling. | *"I'm absurd. The world responds in kind. The Ender Dragon and Ancient Remnant exist to be killed by me."* |

→ Per-tier material lists and mod placements: [Appendix §A](master-appendix.md#a-tier-material-reference) and [§F](master-appendix.md#f-mod-roster-by-tier).

### What gating actually does

Tier gating is enforced through **AStages** (per-player tier flags), **KubeJS** event hooks, and a small set of datapack overrides (`icraft_*_overrides`). In concrete terms:

- **Items** — tier-inappropriate items cannot be used (held, equipped, or consumed) until the stage is unlocked. A T2 player who finds an Awakening artifact via creative gift sees it inert until they reach T4.
- **Dimensions** — locked until the stage is unlocked. T2 dimensions (Twilight, Blue Skies, Aether) at T2; T3 dimensions (Undergarden, Deeper Darker, Nether, Abyss) at T3; T4 dimensions (Deep Aether, End, Ad Astra planets) at T4.
- **Recipes** — tier-gated crafting. Workbenches, advanced materials, and boss-tier crafting stations check the player's stage.
- **Ores** — visually replaced (with a vanilla equivalent) until the appropriate tier. The player sees stone instead of diamond ore until T3; holystone instead of aether_debris until T4.

Tier transitions can happen via *any one* of several unlock paths (see Part III). Players are not required to grind every option; one is enough.

### The escalation curve

Three things scale together across all four tiers:

- **Player power** — gear, spells, perks
- **Mob threat** — HP, damage, behavior, equipment
- **Content surface** — mods, structures, recipes

Player power scales fastest in the early mid-game (T1 → T2 feels enormous because that's when specialization kicks in). Mob threat scales fastest in late-game (T3 → T4, where Champions, difficulty mods, and progressive boss buffs compound).

> **Design intent.** Players feel powerful at every tier, but never trivialize the next one.

→ Scaling factors and Champion rates: [Appendix §D](master-appendix.md#d-apotheosis-tables--scaling).

---

## Part III — Progression Paths

A *progression path* is the route a player takes through a tier transition. The pack offers **branching paths** at each transition: complete any one of several options to unlock the next tier. This is the pack's most distinctive structural decision — every other system follows from it.

### The branching unlock model

At each tier boundary, the player has 4–5 unlock options. Completing any one grants the next AStages tier flag. The options span four categories (with a fifth at T3+):

| Category | What it asks | Who it's for |
|----------|--------------|--------------|
| **Tech** | Build / automate / process at scale | Engineers, factory builders |
| **Magic** | Craft / acquire / channel magical resources | Mages, ritualists, casters |
| **Combat** | Defeat tier-appropriate bosses | Warriors, hunters, hybrid melee builds |
| **Exploration** | Visit / loot multiple dimensions or structures | Explorers, dimensional travelers |
| **Hybrid** (T3+) | Mix two of the above | Generalists, codex completionists |

Categories overlap (a Combat path may consume Magic materials; a Hybrid path is by definition a mix), and the player may pursue more than one in parallel — but only one is needed.

→ Exact unlock options per tier: [Appendix §A.3](master-appendix.md#a3-tier-unlock-options).

### Why branching, not linear

Linear progression breaks specialization. If every player must kill the Twilight Lich for T2, every player needs Twilight gear at T2 — Mages, Tech players, and Hunters all funneled into the same combat encounter.

The branching model preserves specialization. The Mage unlocks T2 by crafting Mana Diamonds; the Tech player by building a Create automation chain; the Hunter by killing the Lich. All three reach T2 with their preferred gear and a path that matched their playstyle.

### The "abundance" guarantee

Each unlock path is fully sufficient on its own. The pack does not require completing multiple paths to unlock a tier — one is enough.

This contrasts with most expert packs, which gate tier transitions behind multi-step quest chains touching many mods. IridescentCraft's tier transitions are single-step: complete *one* qualifying objective, get the tier flag.

### Cross-tier material access — bend, not break

Two mechanisms let a current-tier player access *small amounts* of next-tier material — sampling next-tier power without skipping the unlock:

1. **Transmutation.** Expensive recipes convert current-tier materials into a small quantity of next-tier material. T2 → T3 means roughly 32–64 steel ingots for 1 diamond. Inefficient by design — provides a taste, not a full unlock.
2. **Boss tier-peek drops.** Current-tier bosses occasionally drop next-tier reagents at 5–15% rates. Twilight bosses can drop osmium or steel; Cataclysm T3 bosses can drop ancient_debris fragments. This rewards combat-focused players for engaging bosses harder than the tier requires.

Both mechanisms preserve the gate (a player cannot fully outfit themselves in next-tier gear without unlocking) while rewarding investment.

→ Recipe costs and tier-peek drop percentages: [Appendix §B](master-appendix.md#b-tier-skip-recipe-state) and [§C](master-appendix.md#c-boss--loot-mapping).

### Validation

The progression paths described here match what's currently shipped. Tier transitions are enforced via stage flags; dimension portals check against the appropriate flag; ores are visually replaced at lower tiers. Six tier-skip blocks exist (five Mekanism processing recipes plus a Botania Orechid datapack), with an additional Occultism dimensional-miner override closing what was the largest historical exploit vector.

→ Full audit-driven gating ledger: [Appendix §B](master-appendix.md#b-tier-skip-recipe-state) and [§H](master-appendix.md#h-datapack-override-index).

---

## Part IV — Worlds & Dimensions

The pack's dimensional layout is **the spine of the tier system**. Each tier opens a band of dimensions; each dimension carries its own difficulty, themes, and content surface.

Two design choices distinguish IridescentCraft from base Minecraft:

- The **Nether is T3**, not T1/T2.
- The **End is T4**, not the late-game finale of any tier.

Twilight Forest, Blue Skies, and the Aether occupy the T2 band as "first dimensional" content. Deep Aether and the Ad Astra planets are T4 endgame.

### Dimension philosophy

A dimension is not a place to grind — it is a content arc. Each dimension has a thematic identity, a primary boss line, and a unique mechanic that distinguishes its play feel.

| Dimension | Tier | Boss line | Distinguishing mechanic |
|-----------|:---:|-----------|-------------------------|
| Twilight Forest | T2 | 8-step encounter ladder (Naga → Lich → Hydra → Ur-Ghast → Knight Phantom → Snow Queen → Minoshroom → Alpha Yeti) | Canopy ambushes, dense fog, gentlest first-dimension experience |
| Blue Skies | T2 | Summoner / Alchemist / Starlit Crusher / Arachnarch | Everbright/Everdawn duality, elemental damage that bypasses armor |
| The Aether | T2 | Slider / Valkyrie Queen / Sun Spirit | Vertigo, thin-air, scarce holystone, flight rewarded |
| Undergarden | T3 | Forgotten Guardian / Forgotten / Rotbeast | Hostile underground biome, attrition focus |
| Deeper Darker | T3 | Sculk-themed | Oppressive darkness, stealth-required |
| The Nether | T3 | Cataclysm line (Netherite Monstrosity, Ignis, the Harbinger, Maledictus, Ancient Remnant) | 50% Champion rate; Wither Skeletons function as mini-bosses |
| The Abyss | T3 | Nosaj boss line | 30 ring-removal mechanic + 7 elemental armor sets; most-wired mod in the pack |
| Deep Aether | T4 | EotS Controller, custom T4 sky-end | Aethersteel chain (15+ items + 2 ore replacements) |
| The End | T4 | Ender Dragon (T4 power-buffed) | Multi-zone scaling; Voidheart Blade Mythic Forge venue |
| Ad Astra (Moon, Mars, Mercury, Venus, Glacio) | T4 | Per-planet | 4-tier rocket gate; Glacio is post-T4 endgame (MekaSuit Mk2 reagent) |
| Witch of Ink dimension | T3+ (Origin-tied) | — | Origin-specific content surface |

### Dimensional mechanics — per-dimension play-feel modifiers

Beyond stat multipliers, each dimension has *scripted mechanics* that change how the player interacts with that space:

- **Aether** — thin-air, vertigo, updrafts. Limited oxygen; gentle gravity/glide tuning; updraft columns near floating islands.
- **Abyss** — oppressive darkness, corruption, fear aura. Visibility tuning, slow corruption stat-debuff buildup, scripted fear aura near specific mob types.
- **End** — multi-zone scaling. The dimension is divided into Outer Islands (T4 baseline), Deep End (T4-amplified), and Dragon's Domain (peak). Scaling factor doubles past a certain distance from spawn. Nine advancement overrides shape the End-progression flow.
- **Ad Astra** — atmospheric pressure + cryogenic damage. Each planet has its own atmosphere; players need oxygen tanks (T4 entry equipment). Glacio adds cryogenic damage on top.

Each mechanic is implemented as a KubeJS server-tick handler with persistent player-data flags.

→ Numerical specifics (oxygen drain rate, fear buildup, corruption per second): [Appendix §D](master-appendix.md#d-apotheosis-tables--scaling).

### Access mechanism

Dimensions are gated through AStages dimension flags. A T2 player who attempts to enter the Nether sees the portal fail to ignite, with a chat message indicating insufficient access. Dimension entry items — the Twilight Forest portal activator, Aether portal blocks, Blue Skies arc, Nether ignition — all check stage flags before triggering.

> **Design note.** The Twilight Forest portal activator was changed from vanilla diamond to a T1 boss token. The pack's first dimension should not gate on diamond access, since diamonds are T3.

---

## Part V — Combat & Difficulty

The pack's combat model is **player escalates, world escalates harder**. Both player power and mob threat scale across T1–T4, but mob threat scales more aggressively. By T4, an unbuffed player meets an unbuffed mob and loses; the player's job is to *be* buffed.

### What mob threat actually does

Threat scales along five axes, each controlled by a different mod and tunable independently.

| Axis | Mod | What it does |
|------|-----|--------------|
| HP + damage | ScalingMobs | Dimension-keyed multipliers |
| Behavior + AI | Cataclysmic Combat / Improved Mobs / Difficult Caves | Enhanced AI; tool-use, block-breaking, bridge-building, gear-equipping; cave-specific aggression |
| Equipment | Improved Mobs + Champions | Mobs spawn equipped (capped to prevent low-tier players being one-shot); Champions add elite-mob affixes |
| Champion frequency | Champions Unofficial | Dimension-keyed Champion spawn rate (15% Overworld → 60% End) |
| Boss persistence | Progressive Bosses + custom scaling | Each boss kill increases that boss's stats for the next encounter |

→ Per-dimension multiplier tables: [Appendix §D.4](master-appendix.md#d4-dimension-stat-multipliers-full).

### What player power actually does

Player power scales along four axes:

- **Equipment** — Tetra-modular weapons, modular spell books, tiered armor sets (vanilla → mod-tier → boss-drop). See Part IX.
- **Attribute baseline** — Origins, Races, and Classes provide innate stat modifiers. JustLevelingFork adds passive HP/damage scaling per character level.
- **Skill investment** — Pufferfish's Skills offers six skill trees with command-reward effects, fed by XP investment.
- **Consumable stack** — Spice of Life HP bonuses, Iron's Spellbooks elixirs, Apotheosis gem socketing, Relics charm leveling.

> **Design intent.** Player power is *uncapped* in several axes. Mage spell power stacks multiplicatively without ceiling. MekaSuit Mk2 stacks armor + utility modules without a hard cap. The world is built to match the stat ceiling, so "broken" builds are not broken — they are appropriate.

### Bosses are the pinnacle

Each tier has a roster of bosses that serve as the difficulty climax and loot peak of that tier:

- **T2 bosses** — Twilight (8) + Blue Skies (4) + Aether (3). Entry-tier challenge.
- **T3 bosses** — Cataclysm (8) + Ignited Revenant + Wither + Stalker. Mid-game peak.
- **T4 bosses** — Ender Dragon + Ender Guardian + Ancient Remnant + Gaia Guardian + Warden + Coralssus + Void Blossom. Endgame.

Boss kills are tracked by a per-player T2/T3/T4 boss-kill counter that auto-grants the next AStages tier when the threshold is reached. This is the boss-path unlock from Part III. No physical progression-token items are needed; the internal counter handles it.

### The "broken but not breakable" balance

The pack accepts that some builds will be broken — that's the power-fantasy point. What it does not accept is broken-via-exploit. Every audit-driven gate (the five Mekanism processing-recipe blocks, the Botania Orechid datapack, the Occultism miner override, the Cataclysm boss-themed weapon allocations) closes a path that would let a low-tier player skip into broken-tier gear without earning it.

→ Running ledger: [Appendix §B](master-appendix.md#b-tier-skip-recipe-state).

### Dimensional combat mechanics

Beyond stat scaling, each dimension has its own **combat identity** — unique mob behaviors, environmental hazards, and play-feel modifiers that demand different strategies. Damage scales fastest, HP scales moderately. Combat in harder dimensions is *dangerous*; players must respect enemies, not just out-stat them.

Three principles guide the per-dimension design:

1. **Enemies are lethal but killable.** A well-geared player tears through trash but respects elites and fears bosses.
2. **Every dimension feels mechanically unique.** Not stat inflation alone — each dimension has combat behaviors and enemy mechanics that demand different strategies.
3. **Build diversity matters in combat.** A Berserker and a Vanguard fighting the same mob should have fundamentally different experiences, not just "faster" or "slower" versions of the same fight.

#### Combat identity by dimension

**T1 — Overworld: Learning Ground.** Vanilla mob behavior, no surprises. The baseline. Nighttime mob density rises. Full-moon nights spike spawn rate and Champion rate. Basic AI only — mobs do not use gear, do not break blocks, do not coordinate.

**T2 — Twilight Forest: The Dark Forest.** Dense canopy, ambushes from limited visibility. 15% of mobs spawn briefly invisible (Canopy Ambush). Boss arenas have a damage and regen aura on nearby mobs (Twilight Corruption — clear trash before pulling). Twilight-native mobs share aggro within 16 blocks (Pack Tactics). 20% of mobs equip dropped weapons. Environmental: thorn hedges damage on contact; permanent fog reduces visibility.

**T2 — Blue Skies: Elemental Gauntlet.** Two dimensions (Everbright / Everdawn) with elemental themes. 30% of mob damage is converted to elemental (fire / ice) — bypasses standard armor but is mitigated by elemental resistance enchants. Periodic elemental storms buff matching-element mobs for 2 minutes. Mobs at high altitude gain a small speed bonus. Ranged mobs prioritize high ground; melee mobs try to knock players off platform edges.

**T2 — The Aether: Aerial Warfare.** Vertical combat, narrow platforms, lethal falls. 40% of mobs fly or hover. Updraft zones launch entities upward. Cloud cover above Y>192 hides 10% of mobs until close range (soft ambush). Rare gravity wells halve fall damage but double knockback. Valkyrie-type mobs have parry mechanics — block frontal attacks periodically.

**T3 — The Undergarden: Toxic Attrition.** The environment drains the player. 25% of mob hits apply 5-second poison (scaled with dimension multiplier). Mobs have natural damage reduction that regenerates if not hit for 5 seconds (Fungal Armor — sustained aggression rewarded). Detection range extends to 24 blocks in darkness; light sources reduce it. Standing still 10+ seconds applies Weakness I (Decay Aura — keep moving).

**T3 — Deeper Darker: Horror Survival.** Stealth matters. Sprinting, breaking blocks, and fighting generate "noise" extending mob aggro radius from 24 to 8 blocks when sneaking. Mobs near sculk gain damage and vibration detection through walls. Mobs in light-level-0 gain +20% all stats; light-level-7+ lose 10%. Below Y=-32, all entities take 1 damage / 30s (Rift Pressure). Mobs do not make warning sounds — no aggro growls before attacks.

**T3 — The Nether: Relentless Aggression.** Permanent aggro from 20 blocks. 30% of melee damage is fire (bypasses armor; Heatward enchant mitigates). Killing Blazes has a 20% chance to spawn 2 smaller "Ember" adds. Mobs inside Nether Fortresses gain stat bonuses and resist knockback (set-piece encounters). Lava-adjacent mobs regenerate. Improved Mobs runs at maximum aggression: all mobs use found gear, piglins flank in 4–6 hunting parties, hoglins charge toward lava (intentional environmental kills).

**T3 — The Abyss.** Oppressive darkness mechanic — visibility tuning, slow corruption stat-debuff buildup, scripted fear aura near specific mob types. Sculk-adjacent and abyss-adjacent mob synergies. Companion to Deeper Darker thematically.

**T4 — Deep Aether: Ascension Trial.** Aerial combat, escalated difficulty, multi-phase mob attack patterns. Celestial Events every 20 minutes give mobs a stat bonus and 50% more loot. Random wind shears push players and projectiles off-course. 20% of mobs spawn with one-hit absorption shields (rewards sustained combat over alpha-strike). Procedural Ascension Towers — each floor adds stats, top floor has a mini-boss. Combo attacks (2–3 hit sequences with increasing damage), telegraphed special attacks (1-second windup), allies heal each other if not interrupted.

**T4 — The End: The Crucible.** Three zones with escalating mechanics, each adding to the previous:

- *Outer Islands.* Mobs gain damage as the player approaches the void. 15% of attacks apply a 2–4 block teleport in a random direction (Ender Displacement). Shulkers fire in coordinated volleys.
- *Deep End / End Cities.* Adds Void Corruption stacks (-2% HP / +3% damage per stack, max 10; leaving the End clears them). Killing Endermen has a 10% chance to teleport in 3–5 already-aggro'd Endermen. 10% of mobs phase through walls briefly.
- *Dragon's Domain.* Adds a global stat bonus to all mobs while the Dragon is alive. Void Storms every 10 minutes deal sustained damage to all entities not under shelter. Reality Fracture reverses player controls for 2 seconds (purple-particle warning 1s before). Champions in Dragon's Domain always roll the maximum number of affixes.

Full Improved Mobs config in the End: all mobs use found gear and enchanted weapons; mobs break any block (including obsidian, slowly); ranged mobs suppress while melee flanks; multiplayer targets the weakest player; Endermen teleport behind for backstabs; elite mobs adapt to player behavior (kiters → mobs speed up; face-tankers → mobs spread out).

**T4 — Ad Astra Planets.** Each planet has its own atmosphere and mechanics. Oxygen drain without a tank, atmospheric pressure damage, Glacio-specific cryogenic damage. Champion rate 50–60% per planet. Glacio is the post-T4 endgame.

#### Combat feel summary

| Tier | Trash kill speed (avg build) | Player threat level | Combat feel |
|------|-----------------------------:|---------------------|-------------|
| 1 | 1–2 hits | Low (10+ hits to die) | Tutorial. Learn mechanics, get comfortable. |
| 2 | 2–3 hits | Moderate (6–8 hits) | Engaging. Pay attention. Ambushes and elements start. |
| 3 | 3–5 hits | High (4–6 hits) | Intense. Mechanics demand specific strategies. Poison, stealth, fire pressure. |
| 4 | 4–8 hits (build-dependent) | Lethal (3–4 hits glass cannon) | Endgame. Every fight matters. Environmental + mob synergy. One mistake = death. |

→ Per-class HP/DPS estimates, kill-speed targets, full multiplier table, Champion affix pool, Progressive Bosses scaling, regular mob equipment percentages: [Appendix §D](master-appendix.md#d-apotheosis-tables--scaling).

---

## Part VI — Player Character

The character creation flow is **three sequential prompts on first join**: Origin → Race → Class. This three-layer model creates more build identity than any two-layer system, while keeping each layer's choice readable.

### The three layers

| Layer | Source | What it provides | Count |
|-------|--------|------------------|------:|
| **Origin** | Origins (Forge) + Iridescent Origins | Species fantasy with unique abilities and tradeoffs | **13** (9 vanilla rebalanced + 4 custom; **no Human, no Mundane**) |
| **Race** | Iridescent Origins (Race layer) | Stat baseline and thematic flavor | **11** |
| **Class** | Iridescent Classes | Combat role, HP tier, glass-cannon status; defines playstyle | **10** |

### Why three layers

A two-layer system (Origin + Class) collapses too many dimensions into one choice. Splitting Origin (species fantasy) from Race (stat baseline) and Class (combat role) gives:

- **Build diversity.** A Faefolk Battlemage plays differently from a Demi-God Battlemage; a Berserker Witherborn plays differently from a Berserker Avian.
- **Identity readability.** Each layer answers one question. *"What am I?"* (Origin), *"What am I made of?"* (Race), *"What do I do?"* (Class).
- **Respec flexibility.** Respec only affects Class (combat role). Origin and Race are permanent. The cost of switching combat identity is bounded.

### Custom origins

Beyond the nine rebalanced vanilla origins, the pack ships four custom:

- **Witch of Ink** — ritual-magic specialist
- **Artificial Construct** — machine-themed tech bias
- **Witherborn** — undead aesthetic + Wither immunity
- **Slimebodied** — slime physics + bouncing combat

Each has its own progression hook and dimension tie-in.

### Glass-cannon classes

Several classes are explicitly **glass cannons** — high damage ceiling at the cost of survivability. The Mage classes (Archmage, Battlemage, Void Summoner) sit in this category: low base HP, high spell-power scaling, weak melee penalty. By T4, a Mage with a fully-built Voidheart Blade and three spell-power curios outdamages any tank class — but a single hit kills them.

> **Design intent — the mage power curve.** Mages are intentionally back-loaded glass cannons: weak early, highest peaks late, uncapped multiplicative stat stacking. This creates the back-loaded power fantasy. The world's T4 threat ceiling is built to match it.

→ Full Origin / Race / Class roster + ability tables: [Appendix §A.6](master-appendix.md#a6-character-layer-reference).

### HP and equipment scaling

The Class layer is the only character layer that modifies HP and damage percentages. Race traits stay in the secondary-stats lane (movement, hunger, environmental resistances). Origins provide species fantasy without flat HP/damage skews.

> **Design rule.** Race + Class have meaningful tradeoffs. Skills are pure bonuses with no drawbacks.

| Archetype | Classes | HP modifier | Equipment HP | Damage modifier |
|-----------|---------|------------:|:------------:|:---------------:|
| Pure Tank | Vanguard | +20% | Normal | -15% all damage |
| Tank/Support/Healer | Paladin | +10% | Normal | — |
| Hybrid | Samurai, Battlemage, Wanderer | +5% | Normal | — |
| Crafter | Artificer | 0% | Normal | — |
| Melee DPS | Berserker | -5% | Normal | — |
| Summoner | Void Summoner | -10% | Half | — |
| Ranged DPS | Ranger | -20% | Half | — |
| Offensive Caster | Archmage | -20% | Half | — |

**Half-equipment-HP** (Ranger, Archmage, Void Summoner) means equipment-sourced HP bonuses count at 50% effectiveness — Vitality enchantment, Hearty/Vigorous/Vital affixes, curio HP bonuses, and armor attribute modifiers all halve. Vanilla armor base values are unaffected. This is the mechanical implementation of the glass-cannon pillar: their damage ceiling is high; their HP ceiling is half.

Vanguard's -15% damage penalty is the corresponding tank tradeoff: maximum survivability, weakest damage output. The Vanguard's role is to absorb hits, not deal them.

→ Per-class weapon affinities and active/passive ability rosters: [Appendix §K](master-appendix.md#k-character-build-reference).

### Race traits — mild tradeoffs

Races provide innate traits with **mild tradeoffs** — less impactful than class choice. Permanent at character creation.

> **Race design principles.** Every race has 2–3 benefits and 1–2 drawbacks. Drawbacks are inconveniences, not crippling. Races do *not* duplicate class identities (no "warrior race" overlapping Berserker). Races do not modify HP%, damage%, or equipment effectiveness — those belong to the Class layer.

What races *can* modify: movement speed (small, ±5–8%), hunger/saturation, vision (night/underwater), environmental resistances (fire/cold/fall), size (via Pehkui), resource interaction (mining/farming), social (villager prices, mob aggro).

The 11 race roster spans utility flavor (Human, Halfling), mobility specialists (Elf, Kirin, Fallen Angel), durability specialists (Dwarf, Demi-God, Ryu), and theme-driven races (Orc, Faefolk, Revenant). Each race has a "natural class pairing" but every race-class combination is viable.

→ Full race trait tables: [Appendix §K.3](master-appendix.md#k3-race-tradeoffs).

### Skill trees — six paths, deeper specialization

Pufferfish's Skills provides the third character layer. Six trees, each with its own XP track, each layered with a Trunk (shared first 8 nodes) → Branch A / Branch B (specialized paths) → Capstone (deep-investment payoff).

| Tree | XP source | Trunk theme | Branch A | Branch B |
|------|-----------|-------------|----------|----------|
| **Warfare** | Melee kills | melee damage, attack speed, melee resistance, HP | Sustained DPS + life steal (Berserker's Path) | Crit + weapon mastery (Duelist's Path) |
| **Marksman** | Ranged kills | ranged damage, draw speed, accuracy, movement | Single-target sniper (Sniper's Path) | AoE + fire rate (Volley Path) |
| **Sorcery** | Spell casts + magic kills | magic damage, mana regen, cast speed, magic resistance | Raw spell power (Destruction Path) | Healing + summoning (Enchanter's Path) |
| **Fortitude** | Damage taken | HP, all-resistance, healing received, knockback resistance | Tank HP + armor (Iron Wall) | Sustain + regen (Survivor's Path) |
| **Gathering** | Mining, chopping, harvesting, fishing | mining speed, breaking speed, crop yield, fortune | Mining + ore yield (Prospector's Path) | Farming + fishing (Harvester's Path) |
| **Engineering** | Crafting, machine operation, smelting | crafting speed, material save, machine speed, durability | Crafting quality (Artificer's Path) | Machines + automation (Engineer's Path) |

Each tree caps at **40 nodes** (~180 total across all six trees). A heavy endgame player reaches ~120–150 — enough for 2–3 deep trees plus 1–2 trunks. Forced prioritization is intentional.

> **Generalist vs specialist.** Spread points across multiple trees for broad moderate bonuses (good for Wanderer, Battlemage, Samurai). Go deep into one tree for powerful focused bonuses + capstone abilities (good for Berserker, Archmage, Ranger). Neither is strictly better. The math is tuned so going deep gives ~+15–20% more effectiveness in your specialty versus spreading, while generalists get meaningful bonuses across multiple contexts.

#### Class → tree affinity

Recommended primary tree per class. Players are not locked in — every class can invest in any tree — but class kits and weapon affinities make some pairings more efficient.

| Class | Primary tree | Secondary | Reasoning |
|-------|--------------|-----------|-----------|
| Berserker | Warfare (Branch A) | Fortitude (Branch B) | Life-steal + sustain → unkillable in sustained fights |
| Samurai | Warfare (Branch B) | Marksman (Branch A) | Crit scaling + ranged precision = Way of the Blade synergy |
| Battlemage | Warfare (trunk) | Sorcery (Branch A) | Moderate melee + strong spells = Arcane Infusion fuel |
| Wanderer | Any 3–4 trunks | — | Generalist wants broad moderate bonuses |
| Paladin | Fortitude (Branch A) | Sorcery (Branch B) | Tank HP + healing = Holy Aura + Lay on Hands |
| Vanguard | Fortitude (Branch A) | Warfare (trunk) | Maximum HP + some melee to offset -15% damage penalty |
| Ranger | Marksman (Branch A) | Gathering (trunk) | Max ranged damage + fortune for resource runs |
| Archmage | Sorcery (Branch A) | Marksman (trunk) | Spell power deep + ranged passive utility |
| Artificer | Engineering (Branch A) | Gathering (Branch B) | Crafting quality + farming/fishing supply |
| Void Summoner | Sorcery (Branch B) | Fortitude (Branch B) | Summoning depth + sustain to keep summons alive |

#### Respec rules

| Layer | Respec? | Cost |
|-------|---------|------|
| **Origin** | No — permanent | — |
| **Race** | No — permanent | — |
| **Class** | Yes, at the Class Altar | 1 tier-appropriate boss drop + 30 XP levels |
| **Skill point** | Yes, per-point | 5 levels per point refunded |

Skill points are **not lost on death** and **not lost on class respec** — they're permanent growth. A Berserker with 30 Warfare points who switches to Paladin keeps those points (suboptimal for Paladin but still functional). This creates interesting hybrid-build space without forcing a full skill reset every time the player tries a new class.

### Layered XP economy

JustLevelingFork runs alongside the skill trees as a passive HP / damage / speed scaling per character level. Flat XP curve (~1000–2000 XP per level), tuned so leveling never feels like an XP sink. Happens naturally as the player plays — no investment decisions, just steady reward for engagement.

Both Pufferfish (active investment) and JustLevelingFork (passive scaling) run alongside vanilla XP and the Apotheosis enchanting economy. The skill trees use **per-tree XP pools** (melee kills feed Warfare, ranged kills feed Marksman, etc.), naturally guiding players toward trees matching their activity.

---

## Part VII — Magic System

Magic in IridescentCraft is *not one mod* — it is an interlocking economy across **six magic mods**, gated tier-by-tier, with cross-mod loot economy linking them.

The progression chain:
*Botania (T1 entry)* → *Ars Nouveau (T1 entry through T2 infrastructure)* → *Iron's Spellbooks (T1 starter through T4 endgame, modular)* → *Forbidden Arcanus (T3 chokepoint)* → *Occultism (T3 spirit-binding)* → *Mahou Tsukai (T4 endgame)*.

> **Design intent.** Each tier surfaces new mods without retiring older ones. A T4 mage uses Botania mana flowers, Ars source jars, ISS modular books, F&A Hephaestus Forge, Occultism Marid miners, *and* Mahou rituals simultaneously.

### Tier 1 — Magic entry

**Botania.** Starter mana chain (Apothecary → Pure Daisy → entry-tier Mana Pool → Manaweave Cloth). Orechid is T1, restricted by datapack to non-tier-skipping ores.

**Iron's Spellbooks.** Starter scrolls (random pre-rolled spells), copper spell book, six starter spell types (magic_missile, firebolt, magic_arrow, fang_strike, summon_vex, healing_word). Class-kit Mages start with two pre-NBT-baked scrolls. Village chest scrolls and Overworld T1 loot drop usable scrolls.

**Ars Nouveau.** The novice spell book is T1-craftable (book + iron tool — no Imbuement Chamber needed) and T1 form glyphs seed into chest loot. A new player can inscribe at a Scribes Table on day one.

The cross-mod ink economy starts here: ISS common_ink and uncommon_ink drop from T1–T2 mobs, allowing early players to scribe simple spells.

### Tier 2 — Source infrastructure and mid-tier magic

**Ars Nouveau (deep).** Imbuement Chamber, Arcane Core, ritual brazier, full source-network expansion. Apprentice spell book unlocks. Spell-crafting bench gates behind T2. T2 form glyphs (aoe, underfoot) and mobility/utility effect glyphs seed into Twilight / Aether / Blue Skies chest loot.

**Botania.** Manasteel chain, Mana Spreader fundamentals, Runic Altar, mana diamond and mana pearl transmutation outputs.

**Iron's Spellbooks.** rare_ink starts dropping; T2 boss runes (fire, ice, nature, protection) appear in T2 boss-drop loot files.

### Tier 3 — Chokepoints and spirit binding

**Forbidden Arcanus.** Hephaestus Forge (T3-gated recipe). Arcane Crystal (T3-gated worldgen + ore replacement).

> **Design note — per-item gating.** F&A is *not* blanket-mod-gated. Passive items (Aureal bottles, edelwood) leak into early game intentionally; per-item gating handles the progression-critical chain.

**Occultism.** Foliot / Djinni / Afrit summon books, Books of Calling, Iesnium chain. The dimensional miner exploit is closed via the `icraft_occultism_overrides` datapack. Like F&A, Occultism is per-item gated — mod-blanket gating would block its passive items.

**Iron's Spellbooks.** epic_ink, T3 runes (blood, ender, cooldown), upgrade orbs (fire, ender, lightning) drop from Cataclysm + Stalwart Dungeons + custom-boss loot tables. T3 Diamond Spell Book (modular variant).

### Tier 4 — Endgame magic

**Mahou Tsukai.** A T4 player-spell mod with no native mob drops. The pack injects Mahou reagents (attuned_emerald, fae_essence, attuned_diamond, kodoku) into T4 boss drops. Cataclysm Ender Guardian, vanilla Warden, and Ender Dragon all contribute Mahou reagents.

> **Design note.** This is the cross-mod synergy peak — a Mage farming bosses is simultaneously progressing five magic mods.

**Iron's Spellbooks.** Netherite Spell Book + seven themed modular variants (Dragonskin, Druidic, Blaze, Evoker, Necronomicon, Villager, Rotten). Legendary ink drops from T4 bosses.

**Botania.** Gaia Ingot, Gaia Block. The Voidheart Blade is forged from `awakened_lichblade` (Ancient Remnant T4 drop) at the Mythic Forge using gaia_ingot, icraft_rift_shard, void_fragment, and primordial_essence. The Gaia Guardian is the Botania T4 capstone.

### Iridescent Modular Spells — native Tetra integration

The pack's signature magic system is the **Iridescent Modular Spells mod** — a custom Forge content mod that bridges Tetra's modular-item workbench to Iron's Spellbooks and Ars Nouveau spell books.

Each modular book has 4 module slots (front_cover / back_cover / spine / pages for ISS; front_cover / back_cover / spine / dye for Ars). Each slot accepts Tetra material categories (metal, skin, bone, gem, fibre, fabric). Each contributes stat bonuses (max_mana, mana_regen, spell_power, cast_time_reduction, cooldown_reduction). Lining improvements (fabric / fibre / skin) layer on top.

**Intrinsic stat overlay.** Each book has a `BookKind` (COPPER, IRON, GOLD, DIAMOND, NETHERITE, DRAGONSKIN, DRUIDIC, BLAZE, EVOKER, NECRONOMICON, VILLAGER, ROTTEN — plus three Ars tiers: NOVICE, APPRENTICE, ARCHMAGE) which contributes a baseline stat profile. The Diamond Spell Book is +50 mana / +0.10 spell_power; the Necronomicon is +100 mana / +0.30 spell_power / +50% Necro school. These stack with module and lining bonuses — uncapped, per the mage power curve pillar.

**Tetra replacement system.** Vanilla ISS / Ars spell books auto-convert to modular variants on the next inventory tick. No need to recipe-strip vanilla books or rewrite their loot tables — the conversion is transparent.

**12 ISS variants + 3 Ars variants = 15 modular spell books total**, each tier-staged, each available via Tetra workbench crafting.

**Unified mana pool (2026-05-15).** ISS and Ars Nouveau share a single mana pool from the player's perspective. Ars's `IManaCap` is mixin-routed to the ISS `MagicData` pool: `getCurrentMana` / `getMaxMana` read from ISS, `removeMana` deducts from ISS, and the Ars HUD bar is hidden (ISS bar is canonical). Ars retains its "reliable, spammable" identity via a **1/3 cost discount** when spells deduct from the unified pool — an Ars spell that displays cost=30 actually costs 10 ISS mana. ISS keeps its "high-impact, long-CD" identity by paying full cost. ISS school SP (`fire_spell_power`, `ice_spell_power`, etc.) also boost Ars elemental glyph damage via two-handler architecture (LivingHurtEvent for direct Ars damage types, SpellDamageEvent.Pre for glyph-school-tagged damage). ISS's built-in Apotheosis gems are buffed and integrated into the same gem ladder as native Apotheosis gems. See [Appendix §M](master-appendix.md#m-iss--ars-nouveau-cross-mod-integration).

> **Future work.** Phase 7 design adds 6 elemental subclasses (Pyromancer / Cryomancer / Necromancer / Priest / Druid / Stormcaller) layered on top of the Mage classes. Each gives +50% to one school with a -10% melee malus (vs Archmage's -25%). Add-alongside, not replace. Implementation deferred.

→ Detailed stat profiles, slot definitions, lining attribute mappings: [Appendix §E](master-appendix.md#e-custom-items-registry).

---

## Part VIII — Tech System

Tech in IridescentCraft is a **clean four-tier ladder**:
*Create (T1)* → *Thermal + Industrial Foregoing basic (T2)* → *Mekanism basic + Refined Storage + IF advanced (T3)* → *Mekanism advanced + RFTools + Ad Astra (T4)*.

Each tier opens a new automation paradigm without retiring the previous. A T4 player runs Create kinetics for cosmetic processing, Thermal phytogenic insolators in greenhouses, Mekanism Digital Miners for resource generation, and Ad Astra rockets for planetary travel — all simultaneously.

### Tier 1 — Create (kinetic automation)

Available immediately. Stress units, crushing wheels, mechanical mixers, deployers, encased fans. Pretty Pipes for early item logistics. Not gated by anything — the player's first power source.

Crushing wheels run at ~1.5× ore processing rate. Create's whole feel is *engineering puzzles + visible mechanical motion* rather than *resource numbers go up*. The pack uses Create as the T1 baseline because it does not trivialize anything — it shapes how the player thinks about automation before higher-tier mods add raw throughput.

### Tier 2 — Thermal Series + Industrial Foregoing (basic)

T2 stage unlocks Thermal Series (Phytogenic Insolator, Smelter, Pulverizer, basic Resonant cells) and IF basic (Block Placer, Block Breaker, basic mob interaction).

Thermal Pulverizer is the **first 2× ore processing**, gating the player into RF power generation. Phytogenic Insolator handles automated farming including Botania flowers (cross-system synergy). IF basic provides the first non-Create item logistics that does not require kinetic stress.

### Tier 3 — Mekanism (basic) + Refined Storage + Industrial Foregoing (advanced)

T3 stage opens the major tech jump:

- **Mekanism basic** — up to 5× ore processing (Enrichment Chamber → Combiner chain), energy cubes, basic factories.
- **Refined Storage** — digital storage (controller, grid, drives, crafters).
- **IF advanced** — Laser Drill, Mob Crusher, the auto-mining stack.

> **Cross-mod tier-skip blocks ship at T3 to prevent shortcut paths.** Mekanism Enriching/Combining/Purifying/Injecting are blocked from converting low-tier inputs to diamond/emerald/netherite_scrap. Create:mixing is blocked from converting copper to osmium ingot. The Botania Orechid datapack restricts diamond and ancient_debris Orechid weights to zero. The Occultism dimensional-miner override restricts Foliot / Djinni miners from producing T3+ ores — a previously open exploit vector.

### Tier 4 — Mekanism (advanced) + RFTools Dimensions + Ad Astra

T4 stage opens **Mekanism advanced** (Digital Miner, Fusion Reactor Controller, MekaTool, MekaSuit + 4 pieces, Antiprotonic Nucleosynthesizer, atomic_alloy, SPS — eleven specific items individually staged) and **RFTools Dimensions** (Dimension Builder, Dimension Editor, dimensional_shard_ore at T4 master only).

**Ad Astra** opens here too. The NASA Workbench requires the T4 reality progression token + Mekanism Steel Casing + netherite ingots. The 4-tier rocket progression gates each planet behind a tier-progression — the T4 Glacio rocket needs primordial_essence. Jet Suit recipes are stripped; MekaSuit fills that niche.

### MekaSuit Mk2 — the endgame chain

The pack's tech-endgame chain is **base MekaSuit (T4 entry-armor) → MekaSuit Mk2 (post-T4 ascension target)** via the Mythic Forge. Mk2 consumes all four base MekaSuit pieces + Aethersteel Ingot + Glacio Stone + Primordial Essence.

> **Design intent.** This converts the natural Ad Astra "you've reached the last planet" moment into a tangible reward.

### Planetary economy

Each Ad Astra planet has a unique extracted-element economy. Moon Stone → Helium-3 + Titanium Dust. Mars Stone → Ferric Oxide + Cryogenic Crystal. Venus, Mercury, and Glacio each contribute their own. Recipes route through Create Crushing Wheels — the planetary loop reuses T1 infrastructure for T4-tier rewards.

### Refined Storage at T3 — dual-path recipes

Refined Storage receives a special-case dual-path recipe model:

- **Tech path** uses Mekanism + Thermal materials.
- **Magic path** uses Botania + Ars Nouveau materials.
- **Hybrid bonus** — using both yields efficiency benefits.

This is the pack's most-explicit cross-system synergy and the proof point for the dual-path pillar at the storage layer.

→ Full stage list, cross-mod tier-skip block recipe IDs, Ad Astra rocket recipe matrix: [Appendix §B](master-appendix.md#b-tier-skip-recipe-state) and [§G](master-appendix.md#g-stage-restrictions).

---

## Part IX — Equipment Systems

Equipment is split into five sub-systems: weapons, armor, curios, modular spell books (covered in Part VII), and the modular-tools workbench. Each follows the same design instinct: **clean role separation between crafted and dropped**.

### Weapons — Truly Modular vs Simply Swords

**Truly Modular** is the primary crafted-weapon system: parts-based, customizable, scales with material tier. A T2 Truly Modular sword is a 4-part build (blade + handle + guard + accessory) using T2 materials. T4 Truly Modular is the netherite-tier ceiling for crafted weapons.

**Simply Swords** is the unique trophy-weapon system. **42 named uniques, all boss-drop only.** Unique-weapon recipes are stripped. Each unique is allocated to a specific boss — Tempest from Naga, Soulrender from Lich, Emberblade from Hydra, etc. 28 of the 42 are allocated; 14 are reserved for future boss mods (NovaBosses, Ultimate Bosses, Brutal Bosses) and currently creative-only.

> **Design intent.** The split is clean: crafted weapons are deterministic (build it from materials, get it); trophy weapons are aspirational (kill the boss, get the unique). A Mage can ignore Simply Swords entirely; a Hunter can ignore Truly Modular entirely. Both reach T4.

Other weapon sub-systems:

- **Iron's Spellbooks** — staves and spell scrolls (T1–T4 progression).
- **Cataclysm** — signature boss weapons from Cataclysm boss drops.
- **Mahou Tsukai** — T4 ritual-cast weapons.
- **Mekanism MekaTool** — T4 tech multitool.
- **Too Many Bows** — 14 named EPIC bows allocated T2–T4 across chest pools.
- **Better Combat** — passive animation/feel overhaul, always active.
- **Apotheosis affixes** — modifier layer on top of any weapon.

### Armor — vanilla, mod-tier, and boss-drop layers

Armor follows the same crafted-vs-dropped split. Modular armor is governed by **Iridescent Reforging** (`iridescent-reforging-mod`), a custom Tetra-armor extension that adds Tetra's modular framework to the armor slot. Players drop ANY armor (vanilla iron, ISS Cultist Hood, Aether Phoenix, Aquaculture Neptunium, etc.) into a Tetra workbench's input slot — it's replaced by a Reforged variant with default modules pre-installed. Specialized armor preserves identity (school spell power, set bonus, Apotheosis affixes, enchantments, Geckolib visual model) via an `ItemUpgradeRegistry` replacement hook that patches NBT after Tetra's swap. Vanilla armor gets the modular shape with an iron-tier default module. Honing + module upgrades happen at the same workbench. Boss-drop armor is mod-specific:

- **Cataclysm** Ignitium / Cursium / Witherite armor sets — recipe-stripped, boss-drop only.
- **Theabyss** Knight / Unorithe / Ragnarok / Dragon / Death armor sets — recipe-stripped, boss-drop only.
- **Iron's Spellbooks** Pyromancer 4-piece — mob-drop.

Iron Jetpacks are ungated from T1 — early flight is intentional. Mahou Tsukai defensive spells, MekaSuit Mk2, and the Mythic Forge endgame uniques (Voidheart Blade, Oblivion Aegis, Riftwalker Boots, Oblivion Crown) are T4 specific.

> **Armor philosophy.** Layer types should not stack power. A T3 player picks *one* of: Refined Obsidian (Mekanism), Terrasteel (Botania), Diamond (vanilla), or boss-drop (Theabyss). The combinatorial space is wide enough that the choice itself is the build identity.

### Curio system — equipping is never gated

**Curios drop from tier-appropriate chest loot tables**, distributed across 4 chest pools by dimension band:

| Pool | Dimensions | Combined drop rate |
|------|-----------|------------------:|
| T1 | Overworld | ~10% |
| T2 | Twilight, Aether, Blue Skies, Deep Aether | ~12% |
| T3 | Nether, Undergarden | ~14% |
| T4 | End, Deeper Darker, Abyss | ~16% |

> **Design intent.** Players can always equip anything they find — there is no AStages restriction on curios. If a T1 player obtains an Awakening artifact via creative gift or boss tier-peek, they can equip it. Curio early access is rare enough not to break the gating, and rewards engagement.

The curio mod stack: Artifacts, More Artifacts, Relics, Celestial Artifacts, Elytra Slot. Each contributes a tier of items into the chest pools.

**Fight-breaking curios** (fire/wither/poison immunities, flight-granting items) are restricted to T2+ chest pools. A T1 player cannot roll a fire-immunity ring from an Overworld dungeon. This is the only "soft gate" on curios, enforced by chest pool composition rather than item bans.

**Relics has a leveling system.** Each Relic earns XP from use and unlocks tiered abilities. The XP investment cost acts as a natural soft-gate — early players cannot afford to max their best Relics; endgame players can.

### Tetra modular workbench — connective tissue

Tetra is the cross-cutting framework. **Nine mod-integrated material categories** are wired in: vanilla metals + 27 modded metals + 5 gems + skin / bone / fibre / wool natively from Tetra. The pack ships an `icraft_tetra_materials` datapack adding these. Players craft Tetra modular weapons, modular spell books, and modular tools all using the same workbench.

This is what makes the cross-mod material economy feel coherent. A diamond pickaxe head can hold a steel handle with a knightmetal accessory and a fiery cap; the player hones the result at the workbench, then improves it further with linings.

**Copper added as a low tier material (2026-05-14).** Copper variants now sit between leather and iron on every armor + wand + spell book module that accepts metals. Tetra's material.primary auto-scales copper's stats to ~80% of iron's without per-module authoring (copper.primary=4 vs iron.primary=5).

**Honing system (2026-05-14).** Two parallel hone systems share the workbench infrastructure: wand multi-option (4 modules × 3 mutually-exclusive paths × 5 levels), and armor major-slot archetype-gated (4 archetypes × 4 pieces × 5 levels). See [Appendix §L](master-appendix.md#l-iridescent-reforging-honing-system).

→ Full curio chest-pool composition, Simply Swords boss allocation, custom-item registry: [Appendix §C](master-appendix.md#c-boss--loot-mapping) and [§E](master-appendix.md#e-custom-items-registry).

---

## Part X — Endgame Loops

T4 is not the finish line — it is the **starting line for five interlocking endgame meta-loops**. Each loop generates progression for the others; players move between them naturally rather than picking one and stopping.

### The five loops

| Loop | What it offers | Gates into |
|------|----------------|------------|
| 1. **Oblivion's Rift** | Procedural infinite dungeon. Floor depth scales loot quality. The pack's primary endgame activity. | Provides materials for Loop 2 (Mythic Gear). |
| 2. **Mythic Gear Chase** | Vertical power with diminishing returns and a hard ceiling. Voidheart Blade, Oblivion Aegis, Riftwalker Boots, Oblivion Crown, MekaSuit Mk2, Mythic Catalysts I–V. | Lets the player push deeper into Loop 1. |
| 3. **Build Diversity** | Horizontal replayability through class/build experimentation. Every class experiences the Rift differently — Berserker rushes trash, Vanguard pushes deeper floors, Void Summoner trivializes some floor modifiers but struggles with Silenced. | Different builds approach Loop 1 differently. |
| 4. **The Compendium** | Collection, achievements, cosmetic chase. Massive completionist checklist — Bestiary, Boss Chronicle, Rift Records, Gear Collection. | Tracks all four other loops; long-tail completionist target. |
| 5. **Creative Endgame** | Megabuilding with endgame-exclusive materials and tools. RFTools custom dimensions + Mythic Forge trophies + decorative endgame. | Uses resources from all other loops. |

> **Soft endpoint.** Killing the Ancient Remnant (Cataclysm) + completing the final quest chain = "you beat the pack" — credits-equivalent moment, unique trophy, bragging rights. That's hour ~150–200. The next 200+ hours come from these five loops feeding into each other.

### Loop 1 — Oblivion's Rift

Rifts are the procedural-dungeon endgame. Each Rift run:

1. Player crafts a **Rift Keystone** (T4 reagents: Dragon Heart + Void Essence + Gaia Ingot + Nether Star + Iridescent Rift Shard).
2. The Keystone is consumed at a Rift Anchor block to enter a procedurally-generated dungeon (RFTools Dimensions backbone, structure datapacks fill the content).
3. **Dungeon depth scales loot quality.** Deeper floors drop Iridescent Rift Shard, Void Fragment, and the rare Rift Core.
4. **Rift floor modifiers** randomize each run — Silenced (no spells), Disarmed (no ranged), Thorned (reflect damage), Volatile (mob explosions on death), etc. Some modifiers hard-counter specific builds; others trivialize them.
5. Death inside the Rift returns the player to base; the keystone is consumed regardless of completion.

The **Void Coffer** (T4 craftable) allows banking items mid-Rift without losing them on death.

Compendium tracking captures every Rift-shard pickup, Rift Keystone craft, Rift Core acquisition, and Primordial Essence acquisition. Floor depth records feed into Loop 4.

### Loop 2 — Mythic Gear Chase

The Mythic Forge is the **uniques-crafting endgame**. Crafted from Iridescent Rift Shard + Mekanism Teleportation Core + Crying Obsidian + Steel Casing + Netherite, it serves as the workbench for six endgame products:

1. **Mythic Catalysts I–V** — escalating power tokens used as "apply this Mythic effect to gear" reagents.
2. **Mythic Reforge Token** — Apotheosis-style gear-modifier reset (3 Primordial Essences).
3. **Voidheart Blade** (sword) — base: `simplyswords:awakened_lichblade` (Ancient Remnant T4 drop). On-kill damage stacking.
4. **Oblivion Aegis** (chestplate) — base: netherite chestplate. Death-delay protection.
5. **Riftwalker Boots** — base: netherite boots. Teleport + speed.
6. **Oblivion Crown** (helmet) — base: netherite helmet. Wallhack vision + first-strike bonus.

All four Mythic Uniques use **Rift Blueprints** as a slot ingredient. Blueprints drop from Rift completions, integrating Loops 1 and 2.

### Loop 3 — Build Diversity

Endgame replayability comes from **respeccing class and re-running the Rift differently**. Each of the 10 classes experiences the Rift fundamentally differently:

- Berserker rushes through trash but struggles with kiting floor guardians.
- Ranger handles floor guardians easily but gets overwhelmed by trash swarms.
- Vanguard is slow but nearly unkillable — pushes deeper floors than DPS classes.
- Void Summoner trivializes some floor modifiers (Thorned, Volatile) but struggles with Silenced.
- Some Rift floor modifiers hard-counter specific builds (Silenced = bad for Archmage, Disarmed = bad for Ranger).

The Compendium (Loop 4) includes class-specific Rift challenges that reward completing the same content with different builds.

> **Why respec exists at endgame.** The Class Altar respec cost (1 boss drop + 30 levels) is sized for endgame players. Respeccing 5–6 times over a long playthrough is the intended cadence — the player tries Berserker, then Vanguard, then Void Summoner, each on a fresh Rift run.

### Loop 4 — The Compendium

The Compendium is the **completionist endgame** — a massive in-game checklist tracking everything the player has accomplished. Implemented as a quest-book chapter + custom advancement triggers. **Not just a checklist** — every Compendium entry has a tangible reward: cosmetic, functional, or both.

#### Compendium categories

**Bestiary (enemy tracking).** Every unique enemy type tracked. ~80–100 mob types across all dimensions.

| Milestone | Kills | Reward |
|-----------|------:|--------|
| Discovered | 1 | Entry appears in Bestiary |
| Studied | 25 | Mob's HP, damage, and weaknesses visible (Jade HUD) |
| Expert | 100 | +5% damage vs this mob type (permanent passive) |
| Master | 500 | +10% damage vs this mob type + cosmetic trophy item |

A **Champion Bestiary** tracks affix combinations separately. Encountering every affix at least once unlocks "Champion Scholar" + the *Champion's Eye* curio (see Champion affixes from 16 blocks away).

**Boss Chronicle.** Tracks every boss killed and at what Progressive Bosses difficulty.

| Milestone | Reward |
|-----------|--------|
| First kill of any boss | Chronicle entry + boss lore text |
| Kill every T2 boss | Title: *Dungeon Delver* |
| Kill every T3 boss | Title: *Realm Walker* |
| Kill every T4 boss | Title: *God-Killer* + unique cape cosmetic |
| Kill Ancient Remnant at 10th+ difficulty | Title: *Rift Conqueror* + Rift Trophy (placeable, animated) |
| Kill every boss at 5th+ difficulty | *Veteran's Medal* curio (+3% all stats, +10% XP) |
| Kill every boss at 10th+ difficulty | *Legend's Insignia* curio (+5% all stats, +15% XP, +10% loot) |

**Rift Records.** Track deepest floor reached.

| Milestone | Reward |
|-----------|--------|
| Reach Floor 5 | Title: *Rift Diver* |
| Reach Floor 10 | *Rift Compass* curio (shows Rift loot tier of current floor) |
| Reach Floor 15 | Title: *Rift Veteran* + cosmetic armor overlay |
| Reach Floor 20 | Title: *Void Walker* + Riftwalker Boots blueprint guaranteed |
| Reach Floor 25 | Title: *Rift Breaker* + unique weapon cosmetic (void aura) |
| Reach Floor 30 | Title: *The Unfathomable* + animated void armor cosmetic set |
| Complete a run with every floor modifier active | Title: *Masochist* |

**Gear Collection.** Track unique items discovered, equipped, and crafted.

| Milestone | Reward |
|-----------|--------|
| Equip 1 Legendary affix item | Collection entry |
| Equip items from every material tier | Title: *Well-Equipped* |
| Obtain all 7 Mythic Unique blueprints | Title: *Mythic Collector* + display pedestal recipe |
| Craft all 7 Mythic Unique items | Title: *Mythic Forgemaster* + Mythic Forge operates 50% faster |
| Obtain a "perfect" affix item (max affixes, all Legendary) | Achievement entry |

**100% Compendium completion** is the "true endgame" — estimated 400+ hours. Requires mastering every class, clearing deep Rift floors, killing every boss at high Progressive difficulty, collecting all Mythic items, and exploring everything.

### Loop 5 — Creative Endgame

T4 unlocks **RFTools Dimensions** — players can create custom dimensions with controlled biomes, terrain, and lighting. Custom dimension templates unlock via Compendium milestones.

- **Decorative trophies.** Compendium milestones unlock placeable trophy blocks: animated boss heads, glowing Rift floor markers, class mastery statues, dimensional trophies.
- **Megabuilding materials.** Endgame-exclusive materials (Aethersteel blocks, Gaia Ingot blocks, planetary stones, ascension sigils) become decorative palette options.
- **Ongoing engagement.** Maintaining a custom dimension costs RF — endgame megabuilders stay engaged with the tech systems.

### Ascension — the prestige cycle

After T4 + Glacio + Mythic Forge endgame, the player can **ascend** — losing some progression but gaining permanent stat multipliers and access to ascension-only content.

Ascension consumes Iridescent Rift Shard + Void Fragment + Gaia Ingot + Cataclysm Void Core + Cataclysm Monstrous Horn. **Five ascension levels** (A1–A5) are available. Mob HP and damage scale 1.2× per level (A5 = 2.0× HP, 2.0× damage on top of dimension multipliers). The pack's late-game endgame is *"how high can you ascend before the world breaks you?"*

> **Design intent — irreversibility.** Ascension is per-character and irreversible. No toggling on/off to farm easy content with A5 rewards. Stat bonuses are percentage-based, so they don't trivialize early content — they keep pace with scaling enemies.

#### Ascension feature surface (design — partial implementation)

The Ascension system is designed to layer multiple difficulty + reward features on top of the base scaling. Some are shipped; others are deferred design.

| Feature | What it does | Status |
|---------|--------------|--------|
| **Mob HP/damage scaling** | 1.2× per ascension level, multiplicative with dimension scaling | Shipped |
| **Stat bonus per level** | Permanent +5% per stat per A-level, capped at A5 | Shipped |
| **Ascension Sigils** | Curio item per A-level, occupies a curio slot, competes with other curios | Shipped |
| **Nemesis System** | Mobs that kill the player gain a "nemesis" tag + stats; killing them grants bonus rewards | Future |
| **Corrupted Champions** | At A2+, Champions roll for "Corrupted" status — extra affix + special loot table | Future |
| **Rift Echoes** | At A3+, 20% chance after a boss death spawns a shadow copy with reduced HP + 2 random Rift modifiers | Future |
| **Night Raids** | At A4+, scheduled wave events every 3rd night | Future |
| **Corruption Zones** | At A2+, scripted zones with area effects; A5 zones persist and expand | Future |
| **Gauntlet Challenges** | Weekly-rotating quest set with KubeJS-driven rotation | Future |
| **Oblivion Trial** | Special RFTools dimension with forced sequential floors, no Void Coffer banking, death = clear inventory | Future |

> **Implementation note.** The "Future" features above ship as design specs but not as runtime systems yet. Each has a documented fallback simplification (e.g., Nemesis System → flat +XP bonus on death recovery; Corruption Zones → static pre-placed zones; Rift Echoes → flat % material drop chance from all bosses at A3+) that preserves the core value proposition without the full implementation.

→ Mythic Forge recipe matrix, ascension scaling formulas, Rift floor loot tables: [Appendix §E](master-appendix.md#e-custom-items-registry).

---

Rifts are the procedural-dungeon endgame. Each Rift run:

1. Player crafts a Rift Keystone (T4 reagents: Dragon Heart + Void Essence + Gaia Ingot + Nether Star + Iridescent Rift Shard).
2. The Keystone is consumed at a Rift Anchor block to enter a procedurally-generated dungeon (RFTools Dimensions backbone, structure datapacks fill the content).
3. Dungeon depth scales loot quality. Deeper floors drop Iridescent Rift Shard, Void Fragment, and rare Rift Core.
4. Death inside the Rift returns the player to base; the keystone is consumed regardless of completion.

Compendium tracking captures every Rift-shard pickup (advancements at 10 / 50 / 250 shards), Rift Keystone craft, Rift Core acquisition, and Primordial Essence acquisition.

### Mythic Forge

The Mythic Forge is the **uniques-crafting endgame**. Crafted from Iridescent Rift Shard + Mekanism Teleportation Core + Crying Obsidian + Steel Casing + Netherite, it serves as the workbench for six endgame products:

1. **Mythic Catalysts I–V** — escalating power tokens used as "apply this Mythic effect to gear" reagents.
2. **Mythic Reforge Token** — Apotheosis-style gear-modifier reset (costs 3 Primordial Essences).
3. **Voidheart Blade** (sword) — base: `simplyswords:awakened_lichblade` (Ancient Remnant T4 drop). On-kill damage stacking.
4. **Oblivion Aegis** (chestplate) — base: netherite chestplate. Death-delay protection.
5. **Riftwalker Boots** — base: netherite boots. Teleport + speed.
6. **Oblivion Crown** (helmet) — base: netherite helmet. Wallhack vision + first-strike bonus.

All four unique items use Rift Blueprint as a slot ingredient. Blueprints drop from Rift completions, integrating the procedural-dungeon endgame with the uniques-crafting endgame.

### Ascension

The Ascension system is the **prestige cycle**. After T4 + Glacio + Mythic Forge endgame, the player can ascend — losing some progression but gaining permanent stat multipliers and access to ascension-only content.

Ascension consumes Iridescent Rift Shard + Void Fragment + Gaia Ingot + Cataclysm Void Core + Cataclysm Monstrous Horn. **Five ascension levels** are available; mob scaling intensifies per level (per-character flag).

> **Design intent.** Ascension creates an explicit reset cycle for veteran players. Tier flags reset, the ascension flag persists, mob HP and damage scale 1.2× per level. The pack's late-game endgame is *"how high can you ascend before the world breaks you?"*

→ Mythic Forge recipe matrix, ascension scaling formulas, Rift floor loot tables: [Appendix §E](master-appendix.md#e-custom-items-registry).

---

## Part XI — Death & Penalty

The pack's death model is **inventory-kept, durability-cost**. Players never lose items on death; the cost is durability damage to equipped armor and held weapon, scaled by the dimension where the death occurred.

### Why this model

- Vanilla *drop everything* punishes dimensional exploration too harshly for a pack designed around 9 dimensions.
- *Keep everything for free* undervalues death entirely.

The middle path — **scaled durability damage** — keeps the player's gear in their inventory but takes a percentage hit that scales with dimension difficulty. A T1 Overworld death is a slap on the wrist (10% durability on iron = cheap repair). A T4 End death is significant (25% durability on netherite = expensive but capped repair).

### Items don't break — they go inert

This is the Hytale-inspired twist. At 0 durability, items become **inert** (cannot deal damage, provide armor, or mine) but stay in the inventory with a "(Broken)" tooltip indicator. Repair restores them to functional gear.

> **Design intent.** This eliminates "I'm afraid to use my best gear" syndrome. The worst case is *"you have to repair before using"*, not *"you destroyed your gear."*

### Soulbound enchantment

Repurposed from Ensorcellation as the pack's **most valuable enchant**:

| Level | Effect |
|:----:|--------|
| **I** | 50% of death durability loss prevented |
| **II** | 75% of death durability loss prevented |
| **III** | 100% durability loss prevented + items cannot go inert from death |

Treasure enchant; high Arcana required. Soulbound III completely negates the death penalty for that item — the endgame insurance policy.

→ Per-dimension durability loss scale and repair-cost cap formula: [Appendix §D.5](master-appendix.md#d5-death-durability-loss-by-dimension).

---

## Part XII — Quest System & Codex

The pack ships two complementary documentation systems: **Heracles** (active quest tracker) and **Patchouli Codex** (lore and reference book).

### Heracles quests

Heracles is the pack's quest engine. Quests serve three roles:

1. **Tier-unlock alternative paths.** Every tier transition has a *complete this quest* option as one of the 4–5 unlock options (per Part III). The Twilight Lich quest, the Botania Mana Diamond quest, the Create Automation Demonstration quest — all are valid T2 unlock paths.
2. **Boss-hunting tracking.** Kill X T3 bosses to unlock a Mythic Catalyst recipe. Kill the Ender Guardian to unlock the Riftwalker Boots schematic.
3. **Optional-side rewards.** Food diversity tracking (Spice of Life integration), automation milestones, exploration completionism, dimension-specific challenges.

> **Design intent.** Quests are not the *only* path through any system. They are a parallel rail that rewards engagement. Players who ignore the quest book can still advance through KubeJS-detected milestones (boss kills, key crafts, dimension entry).

### Quest book chapter structure

The book is organized as a **hub-and-spoke layout** with branching paths inside each tier chapter. Skill-point rewards are tuned so completing one full path per tier covers the player's needs; completing multiple paths grants bonus skill points.

| Chapter | Status | Skill points (min → max) | Notes |
|---------|--------|--------------------------|-------|
| **Welcome** | Always available | 3 | Tutorial, character introduction, codex orientation |
| **Tier 1** | Always available | 5 → 15 | 5 paths (Tech / Magic / Combat / Exploration / Hybrid). Min path-only; max all paths + bonuses |
| **Tier 2** | Locks until T1 complete | ~5 → 20 | Same path structure, more depth |
| **Tier 3** | Locks until T2 complete | ~5 → 20 | Same; introduces hybrid path |
| **Tier 4** | Locks until T3 complete | ~5 → 15 | Endgame entry |
| **Crucible** | Locks until T4 complete | 5 | Mythic Forge milestones, Rift records, Compendium-aligned challenges |
| **Community** | Always visible | 0 | Server-wide buff observation quests; no individual reward |
| **Prestige** | Locks until ascension unlocked | 0 | Ascension-specific tracking; bonuses are A-level perks, not skill points |

**Total skill points from quests across all chapters: ~80–95.** Combined with mob-kill XP across the six skill trees, a heavy endgame player reaches ~120–150 total skill points (out of the ~180 theoretical maximum).

#### Path branching inside each chapter

Each tier chapter follows the same **hub structure**:

1. **Tier baseline gate** — central node, always must complete.
2. **Forked Choice** (T2+) — split into 2–3 paths. Tech, Magic, Combat. Each path has 4–6 quests.
3. **Pillar Choice** (T3+) — within a path, sub-choose specialization (e.g., the Magic path branches further into Botania-focus / Ars-focus / F&A-focus).
4. **Mythic Choice** (T4) — endgame goal-set chosen by the player (e.g., "complete 3 Mythic Uniques" vs. "reach Rift Floor 20" vs. "kill every T4 boss at 10th+ difficulty").
5. **Bonus quests** — completing additional paths beyond the player's primary grants extra skill points + loot boxes.

Locked chapters prevent overwhelm. A T1 player sees only the Welcome and Tier 1 chapters; the rest unlock as tiers complete.

> **Anti-overwhelm design.** The quest book is a guide, not a cage. Each quest's description text teaches the player about the system being engaged with — the quest book doubles as documentation.

#### Prestige quest reset

On ascension, all quest progress resets. Skill points already earned are tracked separately in Pufferfish's persistent data and are **not** affected by quest reset. The KubeJS prestige handler marks which quest-sourced skill points have been earned to prevent re-earning on subsequent ascensions.

### Patchouli Codex

Codex is the **lore and reference** layer. The pack ships a custom Patchouli content jar with eleven categories and 80+ entries:

- **Choosing Your Build** — origin / race / class guide for new players.
- **Origins Guide** — full 13-origin breakdown with abilities and tradeoffs.
- **Classes** — 10-class combat-role guide.
- **Champions / Enchantments / Affixes** — combat system reference.
- **Tier System** — what each tier unlocks, kept in sync with this design doc.
- **Mods Overview** — per-mod role and tier placement.
- **Compendium milestones** — achievements and tracking notes.

Codex entries are **advancement-gated** — entries about T4 content show only after the player has unlocked T4. This keeps the codex spoiler-light for early players while still serving as the canonical in-game reference.

The Patchouli jar carries a bytecode patch that disables resource-pack enforcement on the codex book.

→ [Appendix §J](master-appendix.md#j-bytecode-patches) for the patched-jar reference.

---

## Part XIII — Loot Economy

The pack's loot economy is the **most-distributed system** in the pack — 322 references to ISS alone, 88 entities with explicit LootJS rules, 4 dimension-banded chest pools, 10 boss-drop allocation files. This part summarizes the design intent; the exact tables live in the appendix.

### The cross-mod ink/rune economy

The pack's most distinctive loot mechanic is the **Iron's Spellbooks ink / rune / upgrade-orb economy distributed across every boss tier**. Every dimension's bosses contribute reagents to the shared ISS ecosystem:

| Tier | Reagents |
|:----:|----------|
| T1–T2 mobs | common_ink + uncommon_ink. Mostly Alex's Mobs and Twilight Forest mobs. |
| T2 bosses | rare_ink + T2 runes (fire, ice, nature, protection) + tier-themed Simply Swords uniques. |
| T3 bosses | epic_ink + T3 runes (blood, ender, cooldown, lightning) + upgrade orbs (fire, ender, lightning). |
| T4 bosses | legendary_ink + Mahou reagents (attuned_emerald, attuned_diamond, fae_essence, kodoku). |

Mahou Tsukai is the **connective-tissue beneficiary** — it has no native mob drops, so the pack injects Mahou reagents into other mods' bosses (Cataclysm Ender Guardian, vanilla Warden, Ender Dragon all contribute Mahou reagents). This makes Mahou a viable T4 magic mod for combat-focused players.

### The four chest pools

Curio, artifact, relic, and spell-book chest loot is distributed across 4 tier-banded pools:

| Pool | Dimensions | Combined drop rate | Pool size |
|------|-----------|------------------:|----------:|
| T1 | Overworld | ~10% | ~19 items |
| T2 | Twilight, Aether, Blue Skies, Deep Aether | ~12% | ~31 items |
| T3 | Nether, Undergarden | ~14% | ~38 items |
| T4 | End, Deeper Darker, Abyss | ~16% | ~33 items |

Per-tier rates increase modestly as the player progresses, signaling *you're getting better stuff*. Per-item rate is the combined rate divided by pool size — each individual item is roughly a 0.3–0.5% chance per chest. Rolls are independent per item.

### Boss-drop allocation files

Boss-specific drops live in ten dedicated files under `kubejs/server_scripts/loot/`:

| File | Coverage |
|------|----------|
| `iss_boss_drops.js` | 5 ISS bosses + ISS mob types (cryomancer, pyromancer) |
| `iss_boss_first_kill.js` | Guaranteed first-kill drops (Necronomicon from Dead King, Evoker Spell Book from Archevoker) |
| `cataclysm_boss_drops.js` | 8 Cataclysm bosses with ISS reagent + Simply Swords drops |
| `twilight_boss_drops.js` | 8 Twilight bosses with ISS reagents + Simply Swords uniques |
| `blue_skies_drops.js` | 4 Blue Skies bosses + Runic Arc allocation |
| `alexsmobs_drops.js` | 21 Alex's Mobs entities (with mimicream nerf to 1%) |
| `stalwart_dungeons_drops.js` | 7 nether mini-bosses |
| `mahou_synergy_drops.js` | 14 cross-mod boss → Mahou reagent drops |
| `dimensional_boss_drops.js` | 11 cross-dimensional bosses (Aether, Deep Aether, Undergarden, Mutant Monsters, Warden) |
| `terramity_boss_drops.js` | 7 Terramity non-gun melee weapons |

### What's intentionally *not* in chest loot

> **Boss-drop tier integrity.** The following items are recipe-stripped *and* not in any chest pool. They exist only as boss drops or via bespoke crafting.

- **Simply Swords uniques** — boss-drop only.
- **Cataclysm boss-set armor** (Knight, Ignitium, Cursium, Witherite) — boss-only.
- **Theabyss boss-set armor** (Knight, Unorithe, Ragnarok, Dragon, Death) — boss-only.
- **MekaSuit Mk2 components** — Mythic Forge endgame only.
- **Custom mythic uniques** (Voidheart Blade, Oblivion Aegis, Riftwalker Boots, Oblivion Crown) — Mythic Forge crafting only.
- **Awakening artifacts** (rpgseteffects) — direct T4 boss drops only (the loot pouch table strips them at T2).

→ Full 88-entity boss → loot mapping with drop chances: [Appendix §C](master-appendix.md#c-boss--loot-mapping).

---

## Part XIV — Storage, XP, Travel, Food

Four smaller systems clustered together. Each has its own progression curve, but the curves are mostly orthogonal to the main tier system.

### Storage progression

| Tier | Storage | Transport |
|:----:|---------|-----------|
| **T1** | Sophisticated Backpacks (iron), Storage Drawers (basic) | Pretty Pipes, Create belts |
| **T2** | Sophisticated upgrades (steel), Drawers upgrades | Thermal Ducts, IF basic transport |
| **T3** | Refined Storage (digital), Sophisticated (diamond) | XNet, IF advanced |
| **T4** | RS advanced (Infinity Booster, Extra Disks), Sophisticated (netherite) | Mekanism QIO, RFTools |

EnderChests / EnderStorage are gated to T4 — cross-dimensional item transfer is endgame, not a starter convenience.

Flux Networks are ungated. Cross-dimensional RF is acceptable as a server-bootstrapping convenience.

### XP economy

XP is **plentiful with many things to spend it on**.

**Sources.** Mob kills (dimension-multiplied), XP from Crops, boss kills, quest rewards, villager emerald-to-XP trades, cooking and crafting XP.

**Sinks.** JustLevelingFork leveling, Pufferfish Skills investment, Apotheosis enchanting (flat-cost, not exponential), Relic leveling, anvil operations (Easy Anvils reduces but does not eliminate cost), Reforging.

> **Design intent.** XP-accessibility mods (Tax Free Levels, Easy Anvils, Easy Magic, Table of Experience) are intentional. The sinks are what matter — players should always have something valuable to invest XP in.

### Travel

**Free teleportation philosophy.** Exploration should feel liberating, not punishing.

- **Waystones.** Finding and activating is free in all dimensions. Crafting a new waystone is expensive at all tiers (rare custom boss drops). Waystone Towers generate naturally as a fast-travel network. Cross-dimensional teleport works freely between activated waystones.
- **Iron Jetpacks.** T1 (low-tier), better with material tier. Early flight is intentional.
- **Icarus.** T3-gated.
- **Origins flight.** Ungated, intentional.
- **Elytra Slot.** Available when an elytra is obtained (T4, naturally from the End).

### Food and hunger

**Food diversity is a major progression system.** Diversity = HP bonuses = survival in harder dimensions.

The mod stack: Hunger Overhaul (faster drain), Spice of Life: Carrot Edition (diverse-eating HP bonuses), Farmer's Delight + addons (complex cooking), Pam's HarvestCraft 2 (hundreds of crops), Cooking for Blockheads (kitchen multiblock), Brewin' and Chewin' (fermentation), Simple Farming, Sleep Hunger.

> **Design intent — natural soft-gate.** All food and farming is ungated from T1 — no crop or recipe staging. Players who diversify gain Spice of Life HP bonuses; players who eat only steak struggle in T3+ dimensions due to missing HP bonuses. Best food diversity requires dimensional ingredients (Nether's Delight = T3, Alex's Delight = mid-tier). Cooking is a parallel progression that rewards engagement without hard-blocking.

---

## Part XV — Building & QoL

Both **completely ungated from T1**. The pack's stance: building and QoL features should never feel restricted; they make the world more livable, not more powerful.

**Building mods.** Chipped, Macaw's suite (Bridges, Fences, Furniture, Roofs, Trapdoors), Decorative Blocks, Decorative LGBT Wall Flags, Valhelsia Furniture, Domum Ornamentum, ConnectedTexturesMod, Connected Glass, chisels-and-bits, Structurize.

**QoL mods.** JourneyMap, Jade, AppleSkin, Mouse Tweaks, Controlling, Inventory HUD+, Overflowing Bars, Fast Leaf Decay, TrashSlot, Trash Cans, FTB Ultimine, FTB Chunks, FTB Essentials, No Chat Reports, Simple Voice Chat, all performance mods (Embeddium, ModernFix, etc.).

These mods support the pack's expert-lite identity: powerful tooling, low overhead, no busywork.

---

## Part XVI — Implementation Status

For the live implementation status of every system in the pack, see the **Implementation Status table on [Home](../home.md)**. The table lists every major system, sub-system, and mod-integration with an *Implemented / In Progress / Planned* status flag.

> **Source-of-truth split.**
> - The status table is authoritative for "what is shipped."
> - This document is authoritative for "what is intended."
> - The two stay loosely synchronized: when intent changes, this doc updates; when implementation changes, the status table updates and the changelog logs the change.

For per-mod balance audit verdicts (which mods are GREENLIT, LIGHT POLISH, MEDIUM REWORK, etc.), see the private contributor-only `IridescentCraft-internal` repo's `audits/` directory. That repo is the living document for ongoing balance work.

---

## Appendix

All numerical data, recipe state, drop tables, mod rosters, custom-item registries, KubeJS script index, and bytecode-patch references live in **[`master-appendix.md`](master-appendix.md)**.
