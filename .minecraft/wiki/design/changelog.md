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
- **PacketFixer removed, then restored same-day** — it looked redundant alongside Connectivity, but its string-length patch turned out to be load-bearing (without it, large server payloads broke client logins with a vanilla 32k string cap). Back in the pack; the harmless overlap warnings with Connectivity return with it.
- **Ash blacklist** — common passive mobs are now excluded from a Supplementaries ash interaction via a tag override (the config flag for it was a dead toggle).
- **Stranded-item janitor** — a periodic cleanup sweeps up stray marker items left behind by the boss-wave randomizer.
- **Sync made fail-visible** — the launcher no longer launches silently stale on a failed update; an in-game warning surfaces if the pack didn't sync, and a new-machine setup guide documents the correct install layout.
- **Scorching (formerly Ignition) affix reworked** — it was accidentally granting the *target* fire resistance; it now marks struck enemies with a timed fire vulnerability that amplifies all fire damage they take, scaling with affix rarity.
- **MekaSuit Mk2 rebuilt** — the Mk2 is now a true in-place upgrade of the real MekaSuit: installed modules, stored energy, enchantments, and affixes all survive the craft, and the upgraded suit carries bonus base armor on top of the full module ecosystem. (The old version was a non-functional placeholder that destroyed installed modules — if you crafted one, ask an admin for a replacement.)
- **Mekanism rebalance (engineering stack, ERA 4)** — fusion now generates 1.5x and fission 1.25x energy per fuel, making big reactors the rewarding answer to the pack's 2.5x machine power costs. Radiation is disabled (it could semi-permanently ruin a base); an overdamaged fission reactor now force-shuts-down until it cools instead of melting down — still dangerous, always recoverable. Fusion, antimatter/SPS, the Digital Miner, and ultimate-tier facilities are now Tier 4; intermediate materials stay open. The 5x ore chain is untouched — it's the reward for reaching Tier 3 and building the infrastructure.
- **Antimatter is now worth making** — the top Mythic Forge catalysts (IV and V) each require an Antimatter Pellet, the MekaSuit Mk2 upgrade consumes one per piece, and pellets can be exchanged for Codex progression tokens. The SPS is the endgame power sink it was always meant to be.
- **Biofuel rework** — all crops now crush into roughly a quarter of the biofuel they used to. Meaningful ethylene power runs on automated farming, not a hoe and patience. (Bio-generator burn values and the ethylene chain itself are unchanged.)
- **Worldgen rebalance (lands with the world reset)** — the world gets flatter and friendlier: noticeably more plains, lush deserts and volcanic biomes retired (scrubland and wastes remain), mountains about a quarter lower and smoother overall, Cherry River Valley trimmed very slightly (still common). Towers of the Wild appear more often; Apotheosis tome towers slightly less often. The tome-tower loot fix note: the long-standing "chests under-fill" issue was traced to an already-removed book-stripping bug, and the arcane-essence + scroll additions have been live since they shipped — a fresh world shows it all working.
- **Tier-gating regression fixed (fresh-world impact)** — a legacy gating script re-enabled in early June quietly re-imposed whole-mod locks (Thermal, Ars Nouveau, Occultism, Forbidden & Arcanus) on top of the current per-item design. Veterans never noticed (already high-tier); fresh-world players hit it immediately — starter spellbooks and Thermal seeds were un-pickupable at Tier 1. The legacy script set is retired again; gating follows the curated per-item lists. (Server operators: requires the stale-file cleanup to take effect.)
- **Pigs no longer drop boss loot** — the long-running mystery (boss weapons, reforging tokens, waystone cores, and runes appearing on ordinary pigs) is root-caused and fixed: the entity registry silently substitutes a *pig* for any misspelled or wrong-mod boss id in the loot system, and eight such ids had accumulated. All are corrected or removed, and a boot-time validator now loudly flags any future unresolvable id instead of letting it leak. (The Gaia Guardian's drops were never affected — its unusual internal name is correct.)
- **XP collection fixed (was gamebreaking)** — since the Linear Experience mod shipped, XP and levels were actually accruing server-side but the client bar never updated (the mod's interception bypassed the only field the game watches to re-send XP to your screen). Picking up orbs now visibly fills the bar and levels again.
- **Spawn village is now a safe haven** — hostiles can no longer spawn within the spawn village, and any that wander in are silently removed (no drops, no XP — the zone can't be farmed). Raids effectively cannot execute inside the protected radius.
- **Waystone Cores re-specced** — now a consistent uncommon (20%) drop across all twelve bosses, instead of guaranteed-or-coinflip.
- **Meat drops doubled** — all base meat from the standard animals (pig, cow, mooshroom, chicken, sheep, rabbit, cod, salmon, hoglin) now drops at twice the base rate, raw and cooked, with Looting stacking on top — food and cooking are central to the pack and the economy now reflects it.
- **Last pig-loot straggler fixed** — one more misspelled mob id (an ant "queen" that's actually a caste, not an entity) was quietly feeding Nature Runes to pigs; re-homed to the real ant at a much lower rate.
- **Spellbooks removed from village chests** — copper and novice spellbooks were appearing in roughly one of eight village chests (several per village), which trivialized mage entry that the class starter kits already provide. Village chests still carry ink and source gems at unchanged rates; spellbooks now come from your class kit, exploration loot, and progression.
- **Priest tower in every village (and always at spawn)** — the Iron's Spells priest tower (inscription table, priest villager) was a roughly coin-flip find per village; its weight is now up across all village styles (~85%+ of villages, still max one each), and the starting village is *guaranteed* one: if the spawn village didn't roll a tower naturally, one is placed at the village edge on first load — existing worlds get this retroactively on next boot.
- **Lovely Pieces curation pass** — the accessory mod is now fully loot-driven: all crafting recipes removed, every item tier-scoped into exploration loot (T1 dungeon chests, T2 progression-dimension chests, T3 nether-tier dimensions + ancient cities/bastions, Gambler set pieces hunted across T3). The six legendary accessories are exclusive 10% drops on tier-matched bosses (two hosts each — the Blasphemous Contract comes from the Lich or the Sun Spirit, the Dragon Heart from the Hydra or the Eye of the Storm, and so on). Also cut in our fork: the FPS-scaled damage eye (non-deterministic, hardware-biased), the heartrate HUD, and the floating damage-number particles. All drop rates provisional.
- **Iridescent Lovely Pieces (new custom mod, fork intake)** — a charm-focused accessory mod joins the pack as a managed fork: ~60 new curios (15 boots, rings, amulets, quivers, gadgets, a dark "legendary" tier with real tradeoffs) plus the Gambler set with its chip-gambling crit system. Upstream's game-breaking bug (a damage attribute that silently multiplied all unarmed/melee player damage to zero) is fixed in our build, the legendary auto-grant is off, and the floating damage-number particles it ships are config-toggleable. Items are currently craftable; tier-gating and slot-row curation are the next pass. Because curios are now affixable, these accessories participate in the affix lane automatically.
- **Curios become affixable and socketable (curio affix lane)** — two new mods land together: *Apothic Curios* bridges Apotheosis onto curios (every curio slot — rings, necklaces, charms, belts, backs, bracelets, spellstones, spellbooks, and more — can now roll affixes and gem sockets), and *Caster Curios Bonus* adds 12 build-around caster accessories (cooldown-from-spell-power, mana overflow casting, lifesteal sharing, a temporary free-casting overdrive, and more) found in structure loot like ancient cities and bastions. A 14-affix curio pool ships with it (offense on rings/bracelets/hands, defense on necklaces/bodies/backs/heads, utility on charms/belts/feet, caster stats on spellbooks), and all 14 custom gems gained a curio bonus matching their school or martial identity. Curios found in chests can roll pre-affixed from Tier 1 — the system introduces itself early. All numbers provisional pending a feel pass.
- **Mage curios join the village pool** — six caster-oriented curios (mana, cooldown, and cast-time rings, a concentration amulet, a mana-regen amulet, and a spell-discount ring) now roll in village chests alongside the martial set. Total village curio supply is unchanged — the pool redistributes, with mage items now about a third of artifact rolls.
- **Engineering questline** — a new 14-quest Heracles line walks the whole engineering lane: Create ore-doubling at Tier 1, Thermal infrastructure at Tier 2, the Mekanism 5x chain at Tier 3, fusion and your first antimatter at Tier 4 — with Codex token rewards and a matching "Engineering Lane" Codex chapter. Also fixed: the MekaSuit Mk2 recipes referenced a nonexistent ingot id and were silently uncraftable.

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
