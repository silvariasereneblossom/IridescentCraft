# Known Issues

Player-facing status of known bugs, limitations, and recent fixes in IridescentCraft.

This page keeps the short version: a symptom, a status, and a one-line resolution per issue. The detailed root-cause write-ups (scripts, line numbers, NBT/code specifics) live in the private developer log, not here.

**Status legend:** **Open** · **Investigating** · **Mitigated** (worked around; safe to play) · **Deferred** (known, fix scheduled later) · **Known limitation** (intentional) · **Needs verification** (implemented, awaiting in-game confirmation) · **Resolved**.

---

## Open / In-progress

### Server can lag (low TPS) under heavy load — **Mitigated**
Under a full server with many players and active mobs, tick rate could drop and feel laggy to the lowest-ping player. Mitigated by raising the server heap and disabling some per-spawn diagnostic logging. Full resolution waits on a server-host RAM bump.

### A few Terramity items are over-tuned — **Deferred**
Two Terramity speed bracelets grant a near-permanent high Speed effect, and two Terramity weapons can mine any block. Kept at modest drop rates for now; a proper clamp is scheduled for a later pass.

### Some vanilla spiders spawn with permanent Regeneration — **Investigating**
A small number of vanilla spiders can appear with a permanent Regeneration effect. A drop-side defense is in place; the source of the spawn-time buff is still being tracked down.

### Spider–skeleton jockeys spawn more often than vanilla — **Open (design decision pending)**
A difficulty-mod setting makes spider-with-skeleton-rider jockeys more common than vanilla's ~1%. Whether to dial this back toward "rare encounter" is a pending design call.

### Rare high-tier drops from vanilla spiders — **Mitigated**
Vanilla spiders were occasionally dropping high-tier items (diamond, ender eye). Those drops are now stripped from spider/entity loot, so the symptom is gone; the exact injecting mod hasn't been pinned down yet, and diagnostics remain armed.

### Some skeleton archers hit with excessive knockback — **Mitigated**
Elite skeleton spawns could carry Punch-enchanted bows and launch players. Punch is now stripped from those spawns. Awaiting in-game confirmation that it's fully gone.

### Some EnemyExpansion mobs could launch the player — **Mitigated**
A few EnemyExpansion mob attacks set player velocity directly, bypassing normal knockback limits. A multi-layer velocity/knockback cap now contains it; no further reports.

### Aetheric Tetranomicon compatibility edge case — **Mitigated**
A conflict between Aetheric Tetranomicon and the pack's modular armor/spell books is handled defensively — no crashes. In a rare case, some add-on durability effects are skipped on affected items.

### MekaSuit has no base armor stats — **Open**
Mekanism's end-game MekaSuit has no innate armor values (its protection comes entirely from installed modules), so it doesn't yet compose with the pack's dimension-based difficulty scaling. Parked for a later fix.

### Apotheosis tower chests can under-fill — **Open**
Some Apotheosis tower chests may roll light (e.g. gold only) due to a loot-table load-order quirk.

### Some near-spawn chests generate as vanilla, not Lootr — **Open**
A few chests near spawn can generate as ordinary shared chests instead of per-player Lootr chests. Conversion mode has been tuned to reduce this; some structures with unusual chest placement may still slip through.

### Reforged Botania / Cataclysm armors render approximately — **Known limitation**
Reforged variants of Botania (Manaweave / Manasteel / Terrasteel / Elementium) and Cataclysm (Ignitium) armors render on the vanilla armor model. Their color and material identity are preserved, but proportions differ slightly from the source mod's custom model. Intentional; revisited only if feedback calls for it.

### Structure loot is migrating to themed pools — **In progress**
Marquee structures are moving to per-structure themed loot pools (70% themed / 30% baseline). A few structures are on partial coverage until their loot-table IDs are verified.

### Ad Astra (space dimensions) — **In progress**
The post-Tier-4 Ad Astra planets (Moon, Mars, Mercury, Venus, Glacio) are still being implemented: recipe gating, dimension scaling, loot, and space enchantments are in flight. The `planetary_loot` system has a known low-priority error that will clear once this work lands.

### ~72 custom items use placeholder art — **Open**
About 72 custom items (progression tokens, boss materials, rings, end-game items, etc.) currently use tinted vanilla textures as functional, color-coded placeholders. Proper pixel art is a pending polish task.

### Minor, non-gameplay-affecting
- **Fast Leaf Decay** occasionally logs a harmless error while clearing leaves. Non-fatal, intermittent.
- **Industrial Foregoing latex rework** logs an occasional non-fatal recipe error. No gameplay impact.

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
- Mekanism balance changes (generator nerfs, 2× RF costs, Digital Miner recipe)
- Food-system overhaul (hunger drain, seed drops, structure-food reduction)
- Farmer's Delight cooking conversions

---

## Recently resolved

A condensed list of fixes, newest first. Full details are in the [Design Changelog](../design/changelog.md).

**Loot & chests**
- Enchanted books no longer spawn blank — they now roll real enchantments scaled by dimension tier.
- "None" / blank spell scrolls in chests now always come with a random spell inscribed.
- Village chests cleaned up: no more double beds, no junk-flooding, artifacts at sane rates, weapons/iron bars/beds appear as intended.
- Ars Nouveau glyphs and spell materials added to tiered chest loot so spell books are usable from Tier 1.
- Modded loot modifiers (grass seeds, Farmer's Delight scavenging, Aether drops) restored after a config change had silently suppressed them.
- Apotheosis gems no longer roll with broken/empty bonuses; elemental gems fixed and rebalanced.
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
- FTB suite, Champions Unofficial, Truly Modular, and the old scaling mods removed and replaced (see [Mod Overview](../mods/overview.md#removed-mods)).
- Several client-only mods that crashed the dedicated server identified and handled.
- Tester-sync drift (stale or mismatched custom jars) now caught automatically by the launcher's cleanup pass.

---

## Related pages

- [Design Changelog](../design/changelog.md) — dated list of major changes
- [Mod Overview](../mods/overview.md) — current and removed mods
- [Systems Overview](../systems/overview.md) — how the gameplay systems work
