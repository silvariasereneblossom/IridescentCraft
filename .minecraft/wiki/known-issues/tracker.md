# Known Issues

Player-facing status of known bugs, limitations, and recent fixes in IridescentCraft.

This page keeps the short version: a symptom, a status, and a one-line resolution per issue. The detailed root-cause write-ups (scripts, line numbers, NBT/code specifics) live in the private developer log, not here.

**Status legend:** **Open** · **Investigating** · **Mitigated** (worked around; safe to play) · **Deferred** (known, fix scheduled later) · **Known limitation** (intentional) · **Needs verification** (implemented, awaiting in-game confirmation) · **Resolved**.

---

## Open / In-progress

### Kill quests: kills from before 2026-10-13 are not credited — **Known limitation**
Twenty kill quests (the Boss-Rush gauntlets, the hunter quests, the Overworld Foundations boss quests, *Capstone: Lucifer* and others) recorded nothing until 2026-10-13. They work now, but only for kills made from then on.

### Trinity mage classes (Elemental / Blessed / Corrupted) — **Needs verification**
The three new specialist mage classes shipped (Phase 1a): selectable, with their three-school spell-power bonus, edge resistances, HP tiers, 2× mana pools, and themed starter kits. Awaiting in-game confirmation that (a) each is selectable and shows the right HP/stats, (b) casting an on-triad Iron's Spellbooks spell deals the intended ~+80% bump, and (c) the resistance triangle actually applies in PvP (a 2-player smoke test). Their signature active abilities and the offensive side of the rock-paper-scissors triangle are intentionally **Deferred** to a Phase 1b follow-up.

### Curio affix lane is brand new — **Provisional (feel pass pending)**
Curios can now roll Apotheosis affixes and gem sockets (new this window). All 14 curio
affix magnitudes and the per-gem curio bonuses are first-pass numbers, deliberately
conservative (about half armor-piece scale) because players stack many curio slots.
Expect tuning. If a curio shows a missing-name affix (raw `affix.apotheosis:...` text)
or a gem stops working entirely, report it immediately — those are loader-level
failures, not balance issues.


### Server can lag (low TPS) under heavy load — **Mitigated**
Under a full server with many players and active mobs, tick rate could drop and feel laggy to the lowest-ping player. Mitigated by raising the server heap and disabling some per-spawn diagnostic logging. Full resolution waits on a server-host RAM bump.

### A few Terramity items are over-tuned — **Deferred**
Two Terramity speed bracelets grant a near-permanent high Speed effect, and two Terramity weapons can mine any block. Kept at modest drop rates for now; a proper clamp is scheduled for a later pass.

### Some vanilla spiders spawn with permanent Regeneration — **Investigating**
A small number of vanilla spiders can appear with a permanent Regeneration effect. A drop-side defense is in place; the source of the spawn-time buff is still being tracked down.

### Spider–skeleton jockeys spawn more often than vanilla — **Open (design decision pending)**
A difficulty-mod setting makes spider-with-skeleton-rider jockeys more common than vanilla's ~1%. Whether to dial this back toward "rare encounter" is a pending design call.

### Entities launched skyward by a high-amplitude Levitation effect — **Investigating**
The "skyward launch" (seen on players and now on mobs too, e.g. a direwolf) is a **Levitation effect at amplifier ~50** applied for a fraction of a second — not a knockback and not a tipped arrow. In-game capture confirmed it is a *direct/area* effect, not a projectile. A full decompile sweep ruled out the obvious suspects: it is **not** EnemyExpansion (its launches are velocity-based, no Levitation effect), **not** Majrusz (its Levitation is amplifier-capped at 10), and there is **no** amplifier-50 Levitation defined in any config, datapack, or mod jar. So the amplitude is being built up at runtime (most likely an un-capped effect that re-applies and climbs). A stack-trace diagnostic is armed to name the exact source on the next occurrence.

### Some skeleton archers hit with excessive knockback — **Mitigated**
Elite skeleton spawns could carry Punch-enchanted bows and launch players. Punch is now stripped from those spawns. (The dramatic *skyward* launches were a separate Levitation issue — see above.)

### Some EnemyExpansion mobs could launch the player — **Mitigated**
A few EnemyExpansion mob attacks set player velocity directly, bypassing normal knockback limits. A multi-layer velocity/knockback cap now contains it; no further reports.

### Aetheric Tetranomicon compatibility edge case — **Mitigated**
A conflict between Aetheric Tetranomicon and the pack's modular armor/spell books is handled defensively — no crashes. In a rare case, some add-on durability effects are skipped on affected items.

### MekaSuit has no base armor stats — **Mitigated**
Mekanism's end-game MekaSuit has no innate armor values by design (its protection comes entirely from installed modules). The MekaSuit Mk2 upgrade (June 2026 rebuild) now adds true base armor/toughness/knockback-resistance on top of the module system, so the pinnacle suit composes with dimension-based difficulty scaling. The un-upgraded base suit remains module-only, matching Mekanism's design.

### Some near-spawn chests generate as vanilla, not Lootr — **Open (mechanism confirmed)**
A few chests can generate as ordinary shared chests instead of per-player Lootr chests. Root cause confirmed (June 2026 audit): Lootr only converts loot containers placed during world generation — chests placed afterward by command/function-driven content (e.g. Ultris structures place theirs via `setblock` with a LootTable) are structurally invisible to it, as are modded chest blocks outside the `forge:chests/wooden`/`trapped` tags (the config's additional-conversion lists are empty). A full per-source census is scoped as follow-up work.

### Reforged Botania / Cataclysm armors render approximately — **Known limitation**
Reforged variants of Botania (Manaweave / Manasteel / Terrasteel / Elementium) and Cataclysm (Ignitium) armors render on the vanilla armor model. Their color and material identity are preserved, but proportions differ slightly from the source mod's custom model. Intentional; revisited only if feedback calls for it.

### Structure loot is migrating to themed pools — **In progress**
Marquee structures are moving to per-structure themed loot pools (70% themed / 30% baseline). A few structures are on partial coverage until their loot-table IDs are verified.

### Tester pack-sync / log push may fail silently if shared credentials lapse — **Investigating**
The launcher updates the pack and pushes tester logs over a shared access token. If that token expires or is missing, the update/push can fail without an obvious symptom — and previously the game would launch on a stale pack with no warning. The launcher is now fail-visible (it surfaces an in-game warning and writes a marker when a sync didn't complete), and the operator is verifying the credential state.

### Ad Astra (space dimensions) — **In progress**
The Ad Astra planets (Moon, Mars, Mercury, Venus, Glacio) and their six orbits are Tier 4 dimensions: the rocket workbench is a Tier 4 recipe, each planet and orbit has its own Tier 4 gate, and their mobs follow the Tier 4 difficulty curve (all done in October 2026). Loot and space enchantments are still in flight. The `planetary_loot` system has a known low-priority error that will clear once that work lands.

### ~72 custom items use placeholder art — **Open**
About 72 custom items (progression tokens, boss materials, rings, end-game items, etc.) currently use tinted vanilla textures as functional, color-coded placeholders. Proper pixel art is a pending polish task.

### Minor, non-gameplay-affecting
- **Fast Leaf Decay** occasionally logs a harmless error while clearing leaves. Non-fatal, intermittent.

### Some log lines at boot are expected noise — **Known limitation**
A cluster of harmless log messages appears at server start and is safe to ignore: cross-mod compatibility shims (MCA, the Connector/Architectury registrar), benign mixin "conflict — skipping" lines from a few mods that optimize the same code path (Saturn, ModernFix + BadOptimizations, Citadel), and client-only mixin messages that have no effect on a dedicated server. The same goes for ten "Couldn't parse element loot_tables" errors: they belong to loot for blocks and structures that do not exist in this pack (Ice and Fire and Traveler's Backpack compatibility content, and a few leftover files), so nothing in the game uses them. The server boots clean to "Done" with these present.

### A small set of mods aren't statically mixin-scanned — **Known limitation**
About 95 of the pack's mods are pulled in by CurseForge metadata (no direct download URL in the index), so the offline compatibility scanner can't read them and they're excluded from the static mixin-conflict audit. They still load and run normally in-game; they're simply not covered by the automated conflict check.

---

## Needs in-game verification

Implemented features awaiting confirmation on a live world:

- Aethersteel Tier-4 ore replacement (ore appears as holystone until the T4 unlock)
- Undergarden metals in Tetra crafting
- Custom origin powers: Witherborn wither-on-hit, Slimebodied food/damage-reduction, Orc bloodlust, Witch of Ink progression, Artificial Construct iron-eating, Phantom Undeath, Samurai focus, Wanderer traveler bonuses, Paladin healing aura, Vanguard guardian's presence, Archmage mana attunement, Void Summoner soul tether, Battlemage mana shield
- Magic bonuses on Iron's spells, each counted once (2026-10-17: the magic damage sync is gone; Mana Attunement and the Magic aptitude skills are spell power only). Magic damage does not reach Ars Nouveau spells
- Compass of Return (bed tracking + cross-dimension teleport)
- Iron's Spells loot tiering (spell books / inks by dimension tier)
- Simply Swords unique Abyss weapons
- Apotheosis affix coverage
- Mekanism balance changes (2.5x machine RF costs, ERA-4 fusion/fission output buffs, reactor force-shutdown, Digital Miner recipe + T4 gate)
- Food-system overhaul (hunger drain, seed drops, structure-food reduction)
- Farmer's Delight cooking conversions

---

## Recently resolved

A condensed list of fixes, newest first. Full details are in the [Design Changelog](../design/changelog.md).

**Progression**
- The Twilight Forest portal could not be lit in survival: since April 2026 its only activator was a legacy token nothing gave. Since 17 October 2026 (from the next server restart) a Codex Token I lights it, and so does a diamond; stepping through still needs Tier 2.
- The Codex could not take submissions, count held tokens or credit boss kills above Tier 1, and the boss-rush rosters listed bosses the pack does not have: no tier could be reached through the Codex. All of it works since October 2026 (10-12 at the latest).
- A `/reload` switched every tier gate off until the next restart; gated recipes (netherite ingot, eye of ender, Digital Miner and others) were craftable by anyone, and the rocket workbench by no one. Fixed in October 2026.
- Iron's Spellbooks' *Pocket Dimension* spell could be cast long before Tier 4; it is refused until Tier 4 since October 2026.

**Items**
- Two Engineering skills (Material Save, Craft Bonus) handed out free materials or copies of items on every inventory change, not only on a craft. They roll on a real craft only since October 2026.

**Bosses**
- The Boss Compass led to the Nether's Chthonic Cathedral for the Thunker, and no Thunker stands there. It leads to the Chthonic Dungeon since 2026-10-17, where Thunkers stand in some of the halls and rooms (they also roam every Nether biome). Its bonfire is the "Chthonic Dungeon (Thunker)" one.

**Server**
- A Twilight Forest placeholder boss crashed the server when it died or was saved. It is kept out of the world since October 2026.

**Quests**
- Five Practical Magic rewards called "Random Spell Scroll" (*Iron's Spellbooks: A First Tome*, the scroll quest, *Practical Magic* and both scrolls of *Practical Mage*) gave nothing: the loot table they named did not exist, and the game only said so in chat. Each gives one spell scroll since 2026-10-17, bound to a random tier-1 spell the moment it lands in your inventory.
- *Iron Tools* (craft an iron pickaxe) rewarded an item that does not exist, so it gave only its XP. It gives 3 iron ingots since 2026-10-17.
- The quest *Brutal Bosses: Claim a Dungeon* could never be completed (its kill lines named things the game does not know as creatures). It was removed on 2026-10-14; nothing depended on it.

**World generation**
- The End could not generate a single chunk: two switched-off ore entries in the pack's own data counted as one and the same feature for the game, and the game refuses to generate a dimension in which a feature has to come before itself. In an offline test of the full pack, asking for an End chunk crashed the server; the test server carries the same data, and nobody had entered The End there. Fixed on 2026-10-13, from the next server restart: in the same test the central island, the outer islands and an End City all generate, and so does a new chunk in each of the 25 other dimensions. The pack's offline boot test now checks all 26 dimensions every time it is run.

**Mob drops**
- Three mobs dropped nothing of their own, because each mod's drop list named an item that does not exist and the game discarded the whole list. The Abyss's End Spider now drops an Icora Nugget and its Slime Spider slime balls (both only to a Looting weapon, as the mod's other spiders do), and the boss of the Mercury arena drops its raw iron, magma cream and blaze rods.

**Farming**
- Right-click/hoe-harvesting carrots or potatoes no longer yields nothing. The auto-replant consumes one of the crop as its replant cost, and the reduced-yield tuning had left exactly one to consume. Both crops now drop enough that every harvest method nets the same yield. (Wheat and beetroot were never affected.)

**Workbench (reforged gear)**
- Raw translation IDs in the workbench are gone: 407 missing labels filled across honing schematics (every armor class-hone, wand line, and spellbook hone now has a proper name like "Potency III" instead of a raw key), wand part labels, and material category headers.
- 166 selectable materials that silently did nothing in the workbench now work: newer materials (boss metals, Aether alloys, wools, fibres, hides) were selectable in armor/wand/spellbook schematics but had no module data behind them, so the craft no-opped. All now have variants with stats scaled from their material grade, plus repair definitions.

**Difficulty**
- Mobs now deal +30% damage at every dimension tier (damage-only; their health/armor/speed are unchanged). A deliberate threat increase to match restored class/race power -- expect to take noticeably more damage, especially before gearing up. Tunable in `config/iridescent_difficulty-common.toml` (`damageMultiplierPct` per tier). The early-Overworld T1 damage softener was also trimmed (-30% -> -15%): low-HP mage starts are *meant* to be fragile early -- expect ~3-shot territory at fresh T1, by design.

**Armor & classes**
- Class and race stat progressions that never applied now do: Witch of Ink toughness ladder + Penthesilea HP, Berserker Trance, Orc Bloodlust, Wanderer travel-speed and Adaptable bonuses, Slimebodied damage reduction, Witherborn weakness, the entire Artificial Construct ladder + capstone, and the mana-regen/cooldown sync into Iron's Spellbooks. (A command-syntax mismatch made all of them silent no-ops; offense-side effects living in the mod jar were unaffected.) Relog or trigger the effect once to see it apply -- check with /icraft armormods.
- **Armor sets now actually stack.** A modifier-identity collision meant only ONE equipped reforged armor piece ever counted toward your armor -- a set whose tooltips sum to 11 gave roughly one piece's worth. Each slot's contribution is now counted separately; your equipped total should match the sum of your tooltips (before class/weight percentages).
- Caster/ranger armor no longer wiped by class penalties: the flat -4/-3 armor maluses (Archmage/Ranger, plus the Elf toughness malus) are now percentages of your final armor, so robe builds keep their carried-over armor. The "robes read 0.5 armor" symptom is resolved.
- Glass-cannon equipment-HP halving corrected: it was only removing about a third of equipment HP (design says half) and could stick after unequipping; both fixed.
- New: `/icraft armormods` dumps every live armor/toughness modifier on you, for precise bug reports.

**Loot & chests**
- Stray high-tier drops traced and fixed at the source: passive animals no longer drop boss-fragment cores, hostile-mob projectile/beam entities are no longer equipped or scaled, and script-equipped mob gear no longer drops on death. (The diamond/ender-eye-on-spiders symptom was part of this and is resolved — it was intended modded entity loot, not a mystery injector.)
- Two silently-dead datapacks revived (the stone-tag fixer and the infinite-ham blocker) — both were rejected for a packaging error and are loading again.
- A LootJS strip rule that referenced a non-existent item id no longer errors.
- Enchanted books no longer spawn blank — they now roll real enchantments scaled by dimension tier.
- Tome Tower (Apotheosis) chests no longer under-fill — the same pack-wide book-strip bug was zeroing their enchanted books (it was never a load-order quirk, despite the original guess); chests now also carry guaranteed Arcane Essence (2-4) and an occasional spell scroll.
- "None" / blank spell scrolls in chests now always come with a random spell inscribed.
- Village chests cleaned up: no more double beds, no junk-flooding, artifacts at sane rates, weapons/iron bars/beds appear as intended.
- Ars Nouveau glyphs and spell materials added to tiered chest loot so spell books are usable from Tier 1.
- Modded loot modifiers (grass seeds, Farmer's Delight scavenging, Aether drops) restored after a config change had silently suppressed them.
- Apotheosis gems no longer roll with broken/empty bonuses; elemental gems fixed and rebalanced; two gems disabled by a duplicate-slot conflict (Guardian, Intelligent) now load, and the magic-weapon affix pool no longer resolves to empty.
- Epic Dungeons, towers, and ocean structures retuned to tier-appropriate loot.
- Lootr chest-conversion mode retuned so village/structure chests convert reliably.

**Magic**
- Unified mana pool: Ars Nouveau and Iron's Spells now draw from one shared mana pool.
- Iron's Spells gems buffed; spell-power, mana, and cooldown stats now display correctly on modular spell books.
- Magic progression rebalanced so early-game spells are playable, with a Scroll Forge entry point.

**Combat & mobs**
- Players in full iron no longer get one-shot in the Overworld (difficulty damage retuned).
- Skyward-launch from skeleton/pillager arrows fixed (a runaway Levitation affix).
- Several boss/entity crashes (Necromancer, Archevoker, Cryomancer, Wandering Magician and other unique Iron's Spells armor) fixed.
- Mobs no longer break torches/doors/blocks at starter bases.
- Blank "shot by ___" death messages fixed.
- Abyss (TATOS) mobs stay in their own dimensions: a count on a copy of the test server's world found none anywhere else. (The script meant to send strays back had never worked, and was removed in October 2026.)

**Gear & Tetra**
- Items no longer disappear when they break — they go inert at near-zero durability instead (vanilla and modular gear).
- Death penalty no longer destroys broken Tetra items.
- Reforged armor: workbench Repair tab now appears; modular percent stats now display correctly.
- Modular spell books and reforged armor: source NBT (skins, affixes, enchantments) preserved through the workbench.

**Progression & Codex**
- Iridescent Codex now registers and opens correctly with all entries and tier gating.
- Magic-class starter kits now reliably grant a usable spell book + scrolls on first join.
- Three-prompt character creation (Origin → Race → Class) confirmed working on dedicated servers.
- Skill effects, custom enchantments, and warfare skill nodes now apply correctly.

**Dimensions & worldgen**
- Blue Skies, Aether, Abyss, End, and Undergarden balance/mechanics passes completed.
- Rivers generate again after a terrain-tuning regression.
- Custom cherry biomes now spawn.

**Mods & server**
- FTB suite, Champions Unofficial, Truly Modular, PacketFixer, and the old scaling mods removed and replaced (see [Mod Overview](../mods/overview.md#removed-mods)).
- Several client-only mods that crashed the dedicated server identified and handled.
- Tester-sync drift (stale or mismatched custom jars) now caught automatically by the launcher's cleanup pass.
- The launcher no longer launches silently stale when a pack update fails — it now surfaces an in-game warning and writes a sync marker; a new-machine setup guide documents the correct install layout.
- A periodic janitor sweeps up stray marker items left behind by the boss-wave randomizer.

---

## Related pages

- [Design Changelog](../design/changelog.md) — dated list of major changes
- [Mod Overview](../mods/overview.md) — current and removed mods
- [Systems Overview](../systems/overview.md) — how the gameplay systems work
