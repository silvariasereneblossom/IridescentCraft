# Known Issues

Player-facing status of known bugs, limitations, and recent fixes in IridescentCraft.

This page keeps the short version: a symptom, a status, and a one-line resolution per issue. The detailed root-cause write-ups (scripts, line numbers, NBT/code specifics) live in the private developer log, not here.

**Status legend:** **Open** · **Investigating** · **Mitigated** (worked around; safe to play) · **Deferred** (known, fix scheduled later) · **Known limitation** (intentional) · **Needs verification** (implemented, awaiting in-game confirmation) · **Resolved**.

---

## Open / In-progress

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

### Some skeleton archers hit with excessive knockback — **Mitigated**
Elite skeleton spawns could carry Punch-enchanted bows and launch players. Punch is now stripped from those spawns. Awaiting in-game confirmation that it's fully gone.

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
The post-Tier-4 Ad Astra planets (Moon, Mars, Mercury, Venus, Glacio) are still being implemented: recipe gating, dimension scaling, loot, and space enchantments are in flight. The `planetary_loot` system has a known low-priority error that will clear once this work lands.

### ~72 custom items use placeholder art — **Open**
About 72 custom items (progression tokens, boss materials, rings, end-game items, etc.) currently use tinted vanilla textures as functional, color-coded placeholders. Proper pixel art is a pending polish task.

### Minor, non-gameplay-affecting
- **Fast Leaf Decay** occasionally logs a harmless error while clearing leaves. Non-fatal, intermittent.

### Some log lines at boot are expected noise — **Known limitation**
A cluster of harmless log messages appears at server start and is safe to ignore: cross-mod compatibility shims (MCA, the Connector/Architectury registrar), benign mixin "conflict — skipping" lines from a few mods that optimize the same code path (Saturn, ModernFix + BadOptimizations, Citadel), and client-only mixin messages that have no effect on a dedicated server. The server boots clean to "Done" with these present.

### A small set of mods aren't statically mixin-scanned — **Known limitation**
About 95 of the pack's mods are pulled in by CurseForge metadata (no direct download URL in the index), so the offline compatibility scanner can't read them and they're excluded from the static mixin-conflict audit. They still load and run normally in-game; they're simply not covered by the automated conflict check.

---

## Needs in-game verification

Implemented features awaiting confirmation on a live world:

- Aethersteel Tier-4 ore replacement (ore appears as holystone until the T4 unlock)
- Undergarden metals in Tetra crafting
- Custom origin powers: Witherborn wither-on-hit, Slimebodied food/damage-reduction, Orc bloodlust, Witch of Ink progression, Artificial Construct iron-eating, Phantom Undeath, Samurai focus, Wanderer traveler bonuses, Paladin healing aura, Vanguard guardian's presence, Archmage mana attunement, Void Summoner soul tether, Battlemage mana shield
- Magic damage sync across Ars Nouveau + Iron's Spells
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

**Armor & classes**
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
- Abyss (TATOS) mobs confined to their own dimensions instead of leaking into the Overworld.

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
