# Design Changelog

A high-level, dated summary of the **major** design changes in IridescentCraft, newest first. This is the player-facing overview — one headline per change, no implementation detail. The blow-by-blow development history (root causes, script-level notes) is kept in the project's private developer log.

For where systems stand today, see the [Master Design Document](master.md) and the [Home page status table](../home.md).

---

## June 2026 — Loot-leak audit, dead-pack revival, and sync hardening

- **Stray loot fixed at the source** — three separate mechanisms were leaking high-tier items onto things that shouldn't carry them. Passive animals no longer drop boss-fragment cores, hostile-mob projectile/beam entities no longer get equipped with gear or scaled, and script-equipped mob gear no longer drops on death. The over-broad death-loot rule was replaced with a properly monster-gated handler.
- **Two dead datapacks revived** — the stone-tag fixer and the infinite-ham blocker were silently rejected for a packaging error (missing/misplaced pack manifest); both are now loading and doing their jobs again.
- **Affix and gem repairs** — several Apotheosis status-effect affixes had a malformed value shape and never loaded; two custom gems (Guardian, Intelligent) were fully disabled by a duplicate-slot conflict; the magic-weapon affix pool resolved to empty because a shadowing override dropped the relevant weapon types. All repaired.
- **Broken tag and ID cleanup** — a sweep of armor/entity/biome tags and a handful of loot/recipe scripts fixed dozens of references to renamed, mistyped, or uninstalled-mod items so they stop erroring at load.
- **Script error fixes** — the boss-bonfire tick error, several Create/Industrial-Foregoing recipe failures, and a non-existent loot id were corrected.
- **PacketFixer removed** — a redundant networking mod was dropped.
- **Ash blacklist** — common passive mobs are now excluded from a Supplementaries ash interaction via a tag override (the config flag for it was a dead toggle).
- **Stranded-item janitor** — a periodic cleanup sweeps up stray marker items left behind by the boss-wave randomizer.
- **Sync made fail-visible** — the launcher no longer launches silently stale on a failed update; an in-game warning surfaces if the pack didn't sync, and a new-machine setup guide documents the correct install layout.
- **Scorching (formerly Ignition) affix reworked** — it was accidentally granting the *target* fire resistance; it now marks struck enemies with a timed fire vulnerability that amplifies all fire damage they take, scaling with affix rarity.
- **MekaSuit Mk2 rebuilt** — the Mk2 is now a true in-place upgrade of the real MekaSuit: installed modules, stored energy, enchantments, and affixes all survive the craft, and the upgraded suit carries bonus base armor on top of the full module ecosystem. (The old version was a non-functional placeholder that destroyed installed modules — if you crafted one, ask an admin for a replacement.)

## May 2026 — Modular gear, unified magic, and the bespoke difficulty engine

- **Iridescent Tetra Expansion** — the modular-armor (Iridescent Reforging) and modular-spell-book (Iridescent Modular Spells) systems were bundled into a single custom mod, with full honing progression for armor, wands, and spell books.
- **Modded metals as Tetra materials** — dozens of modded ores and special materials (Twilight Forest, Blue Skies, Undergarden, Forbidden & Arcanus, Abyss, Botania cloths, and more) were wired into the Tetra crafting system, with a consistent hammer-tier ladder.
- **Unified mana pool** — Ars Nouveau and Iron's Spells & Spellbooks now share one mana pool, with gem buffs and elemental Apotheosis gems feeding school-specific spell power.
- **Crit system unified** — all critical-hit sources were converted to a single additive number, with Vorpal reworked and a dedicated magic-weapon enchant set.
- **Bespoke difficulty engine** — a custom time-and-dimension-based scaling mod (`iridescent_difficulty`) replaced ScalingMobs, Improved Mobs, and Azukaar's Fair Difficulty.
- **Magic progression** — Dan's Magic and Simple Staves wands were integrated as a Tier 1–4 mage progression and folded into the modular wand system; drop-wand tiers added.
- **Origin progression rework** — capstone abilities and in-game status commands for progression origins (Witch of Ink, Artificial Construct).
- **Armor weight system + Battlemage rework** — explicit light/medium/heavy armor tagging with a toughness trade-off for light armor.
- **Loot rebalances** — per-structure themed loot pools for marquee structures, a village food/seed rebalance, a Celestial Artifacts re-audit, and several over-aggressive mod-loot strips.
- **Iridescent Aptitudes** — the JustLeveling fork expanded with a five-tier skill-node pass across all eight aptitudes.

## April 2026 — Custom mods, the Codex, and the loot overhaul

- **Iridescent Reforging** shipped — a Tetra-style modular-armor extension with per-archetype modules, set bonuses, skins, and a workbench-driven conversion path.
- **Iridescent Modular Spells** completed — modular spell books spanning Iron's Spells and Ars Nouveau, integrated with the Tetra workbench.
- **Iridescent Codex** shipped as a proper Forge content mod — the in-game guidebook documenting the progression and systems.
- **Inert-on-break** — a custom durability coremod so gear goes inert at near-zero durability instead of being destroyed.
- **Class Artifacts** (Epic RPG) integrated as a drops-only, tier-gated system.
- **Loot system overhaul** — tiered artifact rates, village chest sanitization, battle-tower loot, and finalized per-tier drop rates.
- **Mod roster changes** — the FTB suite was removed in favor of FastBack (backups), Open Parties and Claims (chunk claiming), and LiteMiner + Amber (veinmining); Champions Unofficial was removed for Majrusz's Progressive Difficulty; Tetra was rolled back to a stable version.
- **Origins expansion** — additional custom races and origins, a JustLeveling redesign, and the Heracles quest system.
- **Combat tuning** — early-game damage retuned so full-iron players aren't one-shot; Ars Nouveau glyphs added to tiered loot.
- **Worldgen** — river and water generation restored/tuned; custom cherry biomes brought online.

## March 2026 — Foundations: progression, dimensions, and systems

- **Token economy** — the four-lane Codex progression system (Engineering · Magic · Exploration · Combat) that gates tiers, dimensions, and recipes.
- **Dimension/location-based boss tiering** — bosses and their drops mapped onto the tier ladder by where they're found.
- **Three-prompt character creation** — Origin → Race → Class selection on first join, with rebalanced vanilla origins plus custom races and classes.
- **Ore re-homing** — endgame ores (Aethersteel and others) re-gated behind tier unlocks, appearing as plain stone until the player reaches the right tier.
- **Dimension integration & balance** — Blue Skies, The Undergarden, The Aether, and The Abyss received balance passes and bespoke dimension mechanics; the End was reworked into an "explore first, fight the dragon last" gate.
- **Tetra modded materials** — the first datapack pass adding modded metals to Tetra, with a diamond hammer tier.
- **Tech & farming balance** — a Mekanism balance overhaul (generator nerfs, higher RF costs, recipe gating), a food-system overhaul, and Farmer's Delight cooking conversions.
- **Combat systems** — the full Apotheosis affix set, functional skill-tree effects, and per-dimension elite-mob affix scaling.
- **Distribution** — the dedicated-server distribution and the client installer were built out.
- **Ad Astra** integration begun as post-Tier-4 space content (ongoing).

## Origins

The pack began from a master design document covering progression, classes, dimensions, loot, and combat. Implementation started in March 2026; the systems above were built out from that foundation.

---

## Related pages

- [Master Design Document](master.md) — current design intent
- [Master Design Appendix](master-appendix.md) — numerical reference (tiers, materials, boss drops)
- [Known Issues](../known-issues/tracker.md) — current bugs and recent fixes
