# Known Issues

Player-facing status of known bugs, limitations and recent fixes in IridescentCraft.

Each issue gets the short version here: a symptom, a status and a one-line resolution. The detailed root-cause write-ups (scripts, line numbers, NBT/code specifics) are in the private developer log.

Status legend: **Open** · **Investigating** · **Mitigated** (worked around; safe to play) · **Deferred** (known, fix scheduled later) · **Known limitation** (intentional) · **Needs verification** (implemented, awaiting in-game confirmation) · **Resolved**.

---

## Open / In-progress

### Kill quests: kills from before 2026-10-13 are not credited (**Known limitation**)
Twenty kill quests (the Boss-Rush gauntlets, the hunter quests, the Overworld Foundations boss quests, *Capstone: Lucifer* and others) recorded nothing until 2026-10-13. They work now, but only for kills made from then on.

### Trinity mage classes (Elemental / Blessed / Corrupted): **Needs verification**
The three new specialist mage classes shipped in Phase 1a. They are selectable and have their three-school spell-power bonus, edge resistances, HP tiers, 2× mana pools and themed starter kits. Still to be confirmed in game: (a) each is selectable and shows the right HP/stats, (b) casting an on-triad Iron's Spellbooks spell gives the intended ~+80% bump, and (c) the resistance triangle really applies in PvP (a 2-player smoke test). Their signature active abilities and the offensive side of the rock-paper-scissors triangle are deferred on purpose to a Phase 1b follow-up.

### Curio affix lane is brand new: **Provisional (feel pass pending)**
Curios can now roll Apotheosis affixes and gem sockets (new this window). All 14 curio
affix magnitudes and the per-gem curio bonuses are first-pass numbers, kept conservative
on purpose (about half the armor-piece scale) because players stack many curio slots, so
expect tuning. If a curio shows an affix with a missing name (raw `affix.apotheosis:...`
text) or a gem stops working entirely, report it right away: those are loader-level
failures, not balance issues.


### Server can lag (low TPS) under heavy load: **Mitigated**
On a full server with many players and active mobs, the tick rate could drop and feel laggy to the lowest-ping player. Raising the server heap and turning off some per-spawn diagnostic logging mitigates it; a full fix waits on more RAM for the server host.

### A few Terramity items are over-tuned: **Deferred**
Two Terramity speed bracelets grant a near-permanent high Speed effect, and two Terramity weapons can mine any block. They stay at modest drop rates for now; a proper clamp is scheduled for a later pass.

### Some vanilla spiders spawn with permanent Regeneration: **Investigating**
A small number of vanilla spiders can appear with a permanent Regeneration effect. A drop-side defense is in place; the source of the spawn-time buff is still being tracked down.

### Spider-skeleton jockeys spawn more often than vanilla: **Open (design decision pending)**
A difficulty-mod setting makes spider-with-skeleton-rider jockeys more common than vanilla's ~1%. Whether to dial this back toward "rare encounter" is a pending design call.

### Entities launched skyward by a high-amplitude Levitation effect: **Investigating**
The "skyward launch" (seen on players and now on mobs too, e.g. a direwolf) is a Levitation effect at amplifier ~50, applied for a fraction of a second. It is neither knockback nor a tipped arrow: an in-game capture confirmed it is a *direct/area* effect, not a projectile. A full decompile sweep ruled out the obvious suspects. EnemyExpansion's launches are velocity-based and use no Levitation effect, Majrusz caps its Levitation amplifier at 10, and no config, datapack or mod jar defines an amplifier-50 Levitation. So the amplitude builds up at runtime, most likely from an uncapped effect that re-applies and climbs. A stack-trace diagnostic is armed to name the exact source the next time it happens.

### Some skeleton archers hit with excessive knockback: **Mitigated**
Elite skeleton spawns could carry Punch-enchanted bows and launch players. Punch is now stripped from those spawns. (The dramatic *skyward* launches were a separate Levitation issue; see above.)

### Some EnemyExpansion mobs could launch the player: **Mitigated**
A few EnemyExpansion mob attacks set player velocity directly, bypassing normal knockback limits. A multi-layer velocity/knockback cap now contains it, and there have been no further reports.

### Aetheric Tetranomicon compatibility edge case: **Mitigated**
The pack handles a conflict between Aetheric Tetranomicon and its modular armor and spell books defensively, so nothing crashes. In rare cases some add-on durability effects are skipped on the affected items.

### MekaSuit has no base armor stats: **Mitigated**
Mekanism's end-game MekaSuit has no innate armor values by design: all its protection comes from installed modules. The MekaSuit Mk2 upgrade (June 2026 rebuild) adds real base armor, toughness and knockback resistance on top of the module system, so the top suit works with dimension-based difficulty scaling. The base suit without the upgrade stays module-only, as Mekanism designed it.

### Some near-spawn chests generate as vanilla, not Lootr: **Open (mechanism confirmed)**
A few chests can generate as ordinary shared chests instead of per-player Lootr chests. The root cause was confirmed in a June 2026 audit: Lootr only converts loot containers placed during world generation. It cannot see chests placed later by command- or function-driven content (for example, Ultris structures place theirs with `setblock` and a LootTable), nor modded chest blocks outside the `forge:chests/wooden`/`trapped` tags (the config's additional-conversion lists are empty). A full census per source is scoped as follow-up work.

### Reforged Botania / Cataclysm armors render approximately: **Known limitation**
Reforged variants of Botania (Manaweave / Manasteel / Terrasteel / Elementium) and Cataclysm (Ignitium) armors render on the vanilla armor model. They keep their color and material identity, but the proportions differ slightly from the source mod's custom model. This is intentional and will be revisited only if feedback calls for it.

### Structure loot is migrating to themed pools: **In progress**
Marquee structures are moving to per-structure themed loot pools (70% themed / 30% baseline). A few structures have partial coverage until their loot-table IDs are verified.

### Tester pack-sync / log push may fail silently if shared credentials lapse: **Investigating**
The launcher updates the pack and pushes tester logs over a shared access token. If that token expires or is missing, the update or push can fail without an obvious symptom, and in the past the game then launched on a stale pack with no warning. The launcher now fails visibly (it shows an in-game warning and writes a marker when a sync did not complete), and the operator is checking the credential state.

### Ad Astra (space dimensions): **In progress**
The Ad Astra planets (Moon, Mars, Mercury, Venus, Glacio) and their six orbits are Tier 4 dimensions: the rocket workbench is a Tier 4 recipe, each planet and orbit has its own Tier 4 gate, and their mobs follow the Tier 4 difficulty curve (all done in October 2026). Loot and space enchantments are still in progress. The `planetary_loot` system has a known low-priority error that will clear once that work lands.

### ~72 custom items use placeholder art: **Open**
About 72 custom items (progression tokens, boss materials, rings, end-game items, etc.) use tinted vanilla textures for now, as functional, color-coded placeholders. Proper pixel art is a pending polish task.

### Minor, non-gameplay-affecting
- Fast Leaf Decay sometimes logs a harmless error while clearing leaves. It is non-fatal and intermittent.

### Some log lines at boot are expected noise: **Known limitation**
A cluster of harmless log messages appears at server start and is safe to ignore: cross-mod compatibility shims (MCA, the Connector/Architectury registrar), benign mixin "conflict. Skipping" lines from a few mods that optimize the same code path (Saturn, ModernFix + BadOptimizations, Citadel), and client-only mixin messages that do nothing on a dedicated server. The same goes for ten "Couldn't parse element loot_tables" errors: they belong to loot for blocks and structures that do not exist in this pack (Ice and Fire and Traveler's Backpack compatibility content, and a few leftover files), so nothing in the game uses them. With these present, the server boots cleanly to "Done".

### A small set of mods aren't statically mixin-scanned: **Known limitation**
About 95 of the pack's mods come in through CurseForge metadata (the index has no direct download URL for them), so the offline compatibility scanner cannot read them and they are left out of the static mixin-conflict audit. They still load and run normally in game; the automated conflict check just does not cover them.

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
- The Twilight Forest portal could not be lit in survival: since April 2026 its only activator had been a legacy token that nothing gave out. Since 17 October 2026 (from the next server restart) a Codex Token I lights it, and so does a diamond; stepping through still needs Tier 2.
- The Codex could not take submissions, count held tokens or credit boss kills above Tier 1, and the boss-rush rosters listed bosses the pack does not have, so no tier could be reached through the Codex. All of it works since October 2026 (10-12 at the latest).
- A `/reload` switched every tier gate off until the next restart: gated recipes (netherite ingot, eye of ender, Digital Miner and others) were craftable by anyone, and the rocket workbench by no one. Fixed in October 2026.
- Iron's Spellbooks' *Pocket Dimension* spell could be cast long before Tier 4; since October 2026 it is refused until Tier 4.

**Items**
- Two Engineering skills (Material Save, Craft Bonus) handed out free materials or copies of items on every inventory change, not only on a craft. Since October 2026 they roll only on a real craft.

**Bosses**
- The Boss Compass led to the Nether's Chthonic Cathedral for the Thunker, and no Thunker stands there. Since 2026-10-17 it leads to the Chthonic Dungeon, where Thunkers stand in some of the halls and rooms (they also roam every Nether biome). Its bonfire is the "Chthonic Dungeon (Thunker)" one.

**Server**
- A Twilight Forest placeholder boss crashed the server when it died or was saved. Since October 2026 it is kept out of the world.

**Quests**
- Five Practical Magic rewards called "Random Spell Scroll" (*Iron's Spellbooks: A First Tome*, the scroll quest, *Practical Magic* and both scrolls of *Practical Mage*) gave nothing: the loot table they named did not exist, and the game only said so in chat. Since 2026-10-17 each gives one spell scroll, bound to a random tier-1 spell the moment it lands in your inventory.
- *Iron Tools* (craft an iron pickaxe) rewarded an item that does not exist, so it gave only its XP. Since 2026-10-17 it gives 3 iron ingots.
- The quest *Brutal Bosses: Claim a Dungeon* could never be completed (its kill lines named things the game does not know as creatures). It was removed on 2026-10-14; nothing depended on it.

**World generation**
- The End could not generate a single chunk. The game treated two switched-off ore entries in the pack's own data as one and the same feature, and it refuses to generate a dimension in which a feature has to come before itself. In an offline test of the full pack, asking for an End chunk crashed the server; the test server carries the same data, and nobody had entered The End there. Fixed on 2026-10-13, from the next server restart: in the same test the central island, the outer islands and an End City all generate, and so does a new chunk in each of the 25 other dimensions. The pack's offline boot test now checks all 26 dimensions every time it is run.

**Mob drops**
- Three mobs dropped nothing of their own, because each mod's drop list named an item that does not exist and the game discarded the whole list. The Abyss's End Spider now drops an Icora Nugget and its Slime Spider slime balls (both only to a Looting weapon, as the mod's other spiders do), and the boss of the Mercury arena drops its raw iron, magma cream and blaze rods.

**Farming**
- Harvesting carrots or potatoes by right-click or with a hoe yields crops again. The auto-replant uses one of the crop as its replant cost, and the reduced-yield tuning had left exactly one to use. Both crops now drop enough that every harvest method nets the same yield. (Wheat and beetroot were never affected.)

**Workbench (reforged gear)**
- Raw translation IDs in the workbench are gone: 407 missing labels are filled in across honing schematics (every armor class-hone, wand line and spellbook hone now has a proper name like "Potency III" instead of a raw key), wand part labels and material category headers.
- 166 selectable materials that silently did nothing in the workbench now work. Newer materials (boss metals, Aether alloys, wools, fibres, hides) were selectable in armor/wand/spellbook schematics but had no module data behind them, so the craft did nothing. All of them now have variants with stats scaled from their material grade, plus repair definitions.

**Difficulty**
- Mobs now deal +30% damage at every dimension tier (damage only; their health, armor and speed are unchanged). The threat increase is deliberate, to match restored class and race power, so expect to take noticeably more damage, especially before gearing up. It is tunable in `config/iridescent_difficulty-common.toml` (`damageMultiplierPct` per tier). The early-Overworld T1 damage softener was also trimmed (-30% -> -15%): low-HP mage starts are *meant* to be fragile early, and dying in about 3 hits at a fresh T1 is by design.

**Armor & classes**
- Class and race stat progressions that never applied now do: Witch of Ink toughness ladder + Penthesilea HP, Berserker Trance, Orc Bloodlust, Wanderer travel-speed and Adaptable bonuses, Slimebodied damage reduction, Witherborn weakness, the entire Artificial Construct ladder + capstone, and the mana-regen/cooldown sync into Iron's Spellbooks. (A command-syntax mismatch had made all of them silently do nothing; offense-side effects in the mod jar were unaffected.) Relog or trigger the effect once to see it apply, and check it with /icraft armormods.
- Armor sets now stack. A modifier-identity collision meant only one equipped reforged armor piece ever counted toward your armor: a set whose tooltips summed to 11 gave roughly one piece's worth. Each slot's contribution is now counted separately, so your equipped total should match the sum of your tooltips (before class/weight percentages).
- Class penalties no longer wipe out caster and ranger armor: the flat -4/-3 armor maluses (Archmage/Ranger, plus the Elf toughness malus) are now percentages of your final armor, so robe builds keep their carried-over armor. This resolves the "robes read 0.5 armor" symptom.
- The glass-cannon equipment-HP halving is corrected. It removed only about a third of equipment HP (the design says half) and could stick after unequipping; both are fixed.
- New: `/icraft armormods` dumps every live armor/toughness modifier on you, for precise bug reports.

**Loot & chests**
- Stray high-tier drops were traced and fixed at the source: passive animals no longer drop boss-fragment cores, hostile-mob projectile/beam entities are no longer equipped or scaled, and script-equipped mob gear no longer drops on death. (The diamond/ender-eye-on-spiders symptom was part of this and is resolved: it was intended modded entity loot, not a mystery injector.)
- Two datapacks that had silently stopped loading (the stone-tag fixer and the infinite-ham blocker) are loading again; both had been rejected for a packaging error.
- A LootJS strip rule that referenced a non-existent item id no longer errors.
- Enchanted books no longer spawn blank: they roll real enchantments scaled by dimension tier.
- Tome Tower (Apotheosis) chests no longer under-fill. The same pack-wide book-strip bug was zeroing their enchanted books (it was never a load-order quirk, despite the original guess). The chests now also carry guaranteed Arcane Essence (2-4) and an occasional spell scroll.
- "None" / blank spell scrolls in chests now always come with a random spell inscribed.
- Village chests are cleaned up: no more double beds or junk flooding, artifacts at sane rates, and weapons, iron bars and beds appear as intended.
- Ars Nouveau glyphs and spell materials are in the tiered chest loot, so spell books are usable from Tier 1.
- Modded loot modifiers (grass seeds, Farmer's Delight scavenging, Aether drops) are restored after a config change had silently suppressed them.
- Apotheosis gems no longer roll with broken or empty bonuses. Elemental gems are fixed and rebalanced, two gems disabled by a duplicate-slot conflict (Guardian, Intelligent) now load, and the magic-weapon affix pool no longer resolves to empty.
- Epic Dungeons, towers and ocean structures are retuned to tier-appropriate loot.
- The Lootr chest-conversion mode is retuned so village and structure chests convert reliably.

**Magic**
- Unified mana pool: Ars Nouveau and Iron's Spells now draw from one shared mana pool.
- Iron's Spells gems are buffed, and spell-power, mana and cooldown stats now display correctly on modular spell books.
- Magic progression is rebalanced so early-game spells are playable, with a Scroll Forge as the entry point.

**Combat & mobs**
- Players in full iron no longer get one-shot in the Overworld (difficulty damage retuned).
- The skyward launch from skeleton/pillager arrows is fixed (a runaway Levitation affix).
- Several boss and entity crashes (Necromancer, Archevoker, Cryomancer, Wandering Magician and other unique Iron's Spells armor) are fixed.
- Mobs no longer break torches/doors/blocks at starter bases.
- Blank "shot by ___" death messages are fixed.
- Abyss (TATOS) mobs stay in their own dimensions: a count on a copy of the test server's world found none anywhere else. (The script meant to send strays back had never worked, and was removed in October 2026.)

**Gear & Tetra**
- Items no longer disappear when they break: they go inert at near-zero durability instead (vanilla and modular gear).
- The death penalty no longer destroys broken Tetra items.
- Reforged armor: the workbench Repair tab now appears, and modular percent stats display correctly.
- Modular spell books and reforged armor: source NBT (skins, affixes, enchantments) is preserved through the workbench.

**Progression & Codex**
- The Iridescent Codex now registers and opens correctly, with all entries and tier gating.
- Magic-class starter kits now reliably grant a usable spell book and scrolls on first join.
- Three-prompt character creation (Origin → Race → Class) is confirmed working on dedicated servers.
- Skill effects, custom enchantments and warfare skill nodes now apply correctly.

**Dimensions & worldgen**
- Balance and mechanics passes are done for Blue Skies, the Aether, the Abyss, the End and the Undergarden.
- Rivers generate again after a terrain-tuning regression.
- Custom cherry biomes now spawn.

**Mods & server**
- The FTB suite, Champions Unofficial, Truly Modular, PacketFixer and the old scaling mods are removed and replaced (see [Mod Overview](../mods/overview.md#removed-mods)).
- Several client-only mods that crashed the dedicated server were identified and handled.
- The launcher's cleanup pass now catches tester-sync drift (stale or mismatched custom jars) automatically.
- When a pack update fails, the launcher no longer starts silently on a stale pack: it shows an in-game warning and writes a sync marker. A new-machine setup guide documents the correct install layout.
- A periodic janitor sweeps up stray marker items left behind by the boss-wave randomizer.

---

## Related pages

- [Design Changelog](../design/changelog.md): dated list of major changes
- [Mod Overview](../mods/overview.md): current and removed mods
- [Systems Overview](../systems/overview.md): how the gameplay systems work
