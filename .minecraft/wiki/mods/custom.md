# Custom Mods

These mods are built from source or bytecode-patched in-house. Packwiz manages none of them: they are committed directly to the repo and listed in the custom-JAR allowlist in both `iridescentserver.bat` and `sync_from_repo.bat`, so the self-updater doesn't delete them as stale.

**JVM flag requirement:** the two bytecode-patched mods (Patchouli, Ars Nouveau) create dead code paths that the verifier rejects, so the client and the server JVM args both need `-noverify`. The server has it built into `iridescentserver.bat`; on the client you add it by hand in PrismLauncher (Instance → Settings → Java → JVM arguments).

---

## In-house mods (built from source)

### iridescent_origins-1.0.0.jar

The Origins / races / classes implementation. On first join the player answers three prompts in order: Origin (13 origins, 9 vanilla + 4 custom) → Race (11 icraft) → Class (10 icraft). The jar implements the glass-cannon HP modifiers, the Faefolk armor weakness, Witch of Ink frailty, the Archmage glass frame and all the per-class power JSONs.

**Source:** `iridescent-origins-mod/src/main/resources/data/icraft/origins/*.json`
**Build:** `iridescent-origins-mod/build_mod.sh` (or jar surgery for content-only edits: extract the content of `iridescent_origins-1.0.0.jar` → edit → re-zip, with no Gradle rebuild).

### iridescent_biomes-1.0.0.jar

Custom TerraBlender region registration for `iridescent_biomes:cherry_river_valley` and `iridescent_biomes:cherry_mountains`. TerraBlender 3.x on 1.20.1 needs the region registered on the Java side through explicit `Climate.ParameterPoints`, because datapacks alone can't assign parameter points. The biome JSONs, the `is_overworld` and `is_mountain` tags and the lang entries ship inside the jar under `data/iridescent_biomes/...` (the biome namespace MUST match the modId).

**Source:** `iridescent-biomes-mod/src/main/...`
**Build:** `./gradlew build` from `iridescent-biomes-mod/` (ForgeGradle toolchain).
**Caveat:** if you delete this jar, the biomes stop spawning but stay registered (Nature's Compass shows them with an empty Dimension).

### iridescent_codex_data.jar

The Patchouli Codex book, shipped as a javafml content mod with a minimal compiled `@Mod` class. **`modId` MUST be `"icraft"`** to match the book.json path at `data/icraft/patchouli_books/iridescent_codex/book.json`. Patchouli's `BookRegistry.init()` scans `data/{modId}/patchouli_books/`, so with a mismatched modId the book is silently never registered (confirmed 2026-04-19: earlier attempts with modId `iridescent_codex_data` produced "Invalid book" tooltips).

**Source:** `datapack_sources/iridescent_codex/`
- `src/com/iridescentcraft/codex/IridescentCodex.java`: the `@Mod("icraft")` entrypoint
- `stub/net/minecraftforge/fml/common/Mod.java`: an annotation stub so the class compiles without the Forge jar
- Only `IridescentCodex.class` ends up in the final jar
- `data/` mirrors to `assets/` automatically because `book.json` has `use_resource_pack: true`

**Build:** `bash build_codex.sh` compiles, packs and deploys to all 3 distros. The jar filename stays `iridescent_codex_data.jar`, so the custom-JAR allowlists don't need updating on a rebuild.

### iridescent_tetra_expansion-1.0.0.jar (Modular Spells + Reforging bundle)

Added 2026-04-26 (as `iridescent_modular_spells`); bundled into `iridescent_tetra_expansion-1.0.0.jar` on 2026-05-01. The jar ships two `[[mods]]` from one file: `iridescent_modular_spells` (below) and `iridescent_reforging` (the modular-armor extension). Item IDs keep their original namespaces (`iridescent_modular_spells:` / `iridescent_reforging:`); the full mod-ID merge into a single `iridescent_tetra_expansion` namespace is deferred to the alpha→beta cutover (Option C). The standalone `iridescent_modular_spells-0.2.0.jar` and `iridescent_reforging` jars are superseded.

Modular Spells is a modular spell book mod for both the ISS and the Ars Nouveau ecosystems, with full Tetra workbench integration. It is a license-clean reimplementation of CurseForge's TSB: TSB is All Rights Reserved, so we mirror its API-driven structure but write our own code and data.

**Books (15 modular variants):**
| Variant | Tier | Inherits from | Slot count | Source |
|---|---|---|---|---|
| modular_copper_spell_book | T1 | ISS `SpellBook` | 5 | crafted (vanilla → modular auto-convert) |
| modular_iron_spell_book | T2 | ISS `SpellBook` | 10 | crafted |
| modular_gold_spell_book | T2 | ISS `SpellBook` | 10 | crafted |
| modular_druidic_spell_book | T2 | ISS `SpellBook` | 10 | rare world loot |
| modular_villager_spell_book | T2 | ISS `SpellBook` | 8 | cleric trade |
| modular_rotten_spell_book | T2 | ISS `SpellBook` | 8 | rare world loot (-15% spell_resist trade-off) |
| modular_diamond_spell_book | T3 | ISS `SpellBook` | 15 | crafted |
| modular_dragonskin_spell_book | T3 | ISS `SpellBook` | 12 | crafted from Ender Dragon dragonskin |
| modular_blaze_spell_book | T3 | ISS `SpellBook` | 12 | first-kill: ISS fire_boss (then 50% sustained from blaze drop) |
| modular_evoker_spell_book | T3 | ISS `SpellBook` | 12 | first-kill: ISS archevoker |
| modular_netherite_spell_book | T4 | ISS `SpellBook` | 15 | smithing |
| modular_necronomicon_spell_book | T4 | ISS `SpellBook` | 15 | first-kill: ISS dead_king |
| modular_novice_spell_book | T1 | Ars `SpellBook` (Tier ONE) | per Ars | craft / vanilla → modular auto-convert |
| modular_apprentice_spell_book | T2 | Ars `SpellBook` (Tier TWO) | per Ars | craft |
| modular_archmage_spell_book | T3 | Ars `SpellBook` (Tier THREE) | per Ars | craft |

**Per-book intrinsic stat overlay (BookKind enum):** each item adds Phase 6F buff modifiers on top of ISS's vanilla intrinsics. Stats stack additively across 3 layers in `getAttributeModifiers(SlotContext, UUID, ItemStack)`:
1. `super`: ISS vanilla per-book intrinsics (preserved)
2. `BookKind.intrinsicModifiers`: the Phase 6F overlay (e.g. dragonskin: +25% Ender and +50 max_mana on top of ISS's +10% Ender, for a +35% Ender baseline)
3. `getAttributeModifiersCached`: Tetra slot/lining attributes from the installed modules

The mage power curve is uncapped by design: mages are weak early and reach the highest peaks at T3-T4.

**Tetra slot model (4 majors per book, no `core` slot; items are tier-locked):**
- ISS: `iss_book/{front_cover, back_cover, spine, pages}`
- Ars: `ars_book/{front_cover, back_cover, spine, dye}`
- The front and back covers each have a separate lining install (Tetra-canonical `displayType: improvement`), with fabric/fibre/skin lining categories that give thematic stat bonuses.

**Tetra replacement system:** vanilla `irons_spellbooks:<X>_spell_book` and `ars_nouveau:<X>_spell_book` items auto-convert to our modular variants on their first inventory tick, with default modules pre-installed, so the vanilla loot tables need no rewrite.

**ISS boss-drop wiring (Phase 6F-1):**
- First-kill guarantees (per player, `EntityEvents.death` + persistentData): `dead_king` → necronomicon, `archevoker` → evoker_spell_book, `fire_boss` → blaze_spell_book, `aether:valkyrie_queen` → magehunter
- Sustained drops (LootJS): `dead_king` → blood_staff 50%, `citadel_keeper` → keeper_flamberge 40%, ISS `cryomancer` mob → ice_staff 15%, ISS `pyromancer` mob → pyromancer armor pieces ~10% each, `aether:cockatrice` → lightning_rod 25%, `twilight:snow_queen` → ice_staff 50%, `twilight:alpha_yeti` → ice_staff 25%, `aether:valkyrie_queen` → magehunter 30%, vanilla `phantom` (during a thunderstorm) → lightning_rod 5%

The legacy `imodspells_slots` NBT system (Phase 1-5) is still active for stat-bonus computation through Phase 6C. Phase 6D will run the migration to Tetra Modules NBT and retire `AttributeApplier` + `AnvilModuleInstaller`.

**Cover materials (ISS metal):** leather (T1) → copper (T1) → iron (T2) → gold (T2) → diamond (T3) → netherite (T4)
**Cover materials (Ars cloth):** white_wool (T1) → manaweave_cloth (T2 Botania) → sorcerer_robes (T3 Ars) → spell_cloth (T4 Botania endgame)

**Custom enchants** (book-exclusive via custom EnchantmentCategory):
- `mana_capacity` I-V: +5%/lv max mana (ISS + Ars)
- `mana_flow` I-III: +5%/lv mana regen
- `magic_crit_chance` I-III: +5%/lv magic crit roll
- `magic_crit_damage` I-III: +25%/lv magic crit damage

**Magic crit hook:** vanilla magic doesn't crit. `kubejs/server_scripts/magic_crit_hook.js` intercepts a magic-typed `LivingHurtEvent`, rolls the `magic_crit_chance` enchant on the attacker's mainhand book plus the player's `icraft_crit_chance` attribute (the same attribute melee crit uses), and multiplies the damage on a hit.

**Caster starter kits:** Archmage / Battlemage / Void Summoner spawn with the modular variants instead of vanilla ISS/Ars books.

**Source:** `iridescent-tetra-expansion-mod/src/main/...` (the consolidated project; the legacy `iridescent-modular-spells-mod/` + `iridescent-reforging-mod/` trees are superseded).
**Build:** `bash iridescent-tetra-expansion-mod/wsl-build.sh` (Gradle wrapper; builds the bundled `iridescent_tetra_expansion-1.0.0.jar` and deploys to all 3 distros). The per-mod `build_mod.sh` scripts are stale.
**Build deps:** ISS, Curios, Ars Nouveau and GeckoLib (transitive, because Ars's SpellBook implements GeoItem), plus Tetra/Geckolib for the Reforging half; all are `compileOnly` via `flatDir libs/`.

### mek_walkable_cables-1.0.1.jar

A Mekanism coremod that makes cables walkable instead of letting players pass through them.

### zeta_racefix-1.0.0.jar

Race selection fix for the Origins layer ordering bug.

### offlineskins-1.20.1-v1.jar

Offline skin support, required for LAN play without Mojang auth.

### iridescent_difficulty-0.1.0.jar

Added 2026-05-03. Bespoke time-based per-dimension mob scaling. It replaces ScalingMobs / ImprovedMobs / AzukaarsFairDifficultyOverhaul (removed) and the dimension-scaling block of `mob_scaling_unified.js` (the tier-HP block stays as a static composable rule). Majrusz's Difficulty stays loaded for its treasure bags and content additions, but its scaling is disabled in config.

**Tier curves** (all configurable in `config/iridescent_difficulty-common.toml`):

| Tier | Dimensions | Start % | Cap % | Cap Hours |
|------|------------|---------|-------|-----------|
| T1 | Overworld | 150% | 300% | 100 |
| T2 | Twilight Forest, Blue Skies (Everbright, Everdawn), the Abyss's pocket dimension | 200% | 350% | 100 |
| T3 | Undergarden, Deeper Darker, Nether, Abyss + its Frost World | 300% | 450% | 100 |
| T4 | The End, Aether (Deep Aether's biomes included), the Ad Astra planets and orbits, Iron's Spellbooks' pocket dimension, the Reality Marble | 600% | 1000% | 200 |

Dimensions are matched by exact id, and any dimension not listed uses the T1 curve. Deep Aether has no dimension of its own (its biomes are part of the Aether), so it follows the Aether: T4 since 2026-10-16 (T2 before). `/icraftdiff status all` shows the tier each dimension resolved to.

**Multiplier scope:** linear on `max_health` / `attack_damage` / `armor`; `sqrt` on `movement_speed` (so a 6× HP mob isn't also 6× as fast). Tamed mobs and mobs outside the MONSTER category are skipped, except the mobs on a configurable force-scale list; since 2026-10-16 that list includes the Aether's own hostile creatures (blue and golden swets, whirlwinds and evil whirlwinds, the aechor plant, cockatrices, zephyrs, and Deep Aether's baby zephyrs and venomites). Bosses are skipped only when they are on the configurable excluded-entities list; there is no automatic boss detection. Since 2026-10-16 the tier lists and that list are generated from the pack's boss and dimension registries: every boss with a designed health or the boss x3 is excluded (78 entity ids), and every tiered dimension is on its tier's list (the planets, orbits and pocket dimensions ran the T1 curve before).

**End uncap:** killing the Ender Dragon in-world removes the cap for any dimension in the `uncapAfterEnderDragon` list (default: just `minecraft:the_end`). The multiplier then extrapolates proportionally beyond the cap once `capHours` has passed.

**Idle gating:** the per-dim timer ticks at the `active / total` ratio of players in that dim. A player counts as idle if either of these holds:
- No movement (>0.1 blocks delta) or damage taken/dealt for `idleThresholdMinutes` (default 5)
- Within `spawnIdleRadius` blocks (chebyshev cube, default 10) of their respawn point (the bed if set, otherwise world spawn)

So with 4 players, 2 active and 2 idle, the tick rate is 50%; with 7 players and 3 active it is ~42.86%; an empty dim ticks at 0%. A fractional `tickAccumulator` on `DimensionDifficultyData` implements this.

**Op-only debug commands** (permission level 2):
- `/icraftdiff status [all]`: status of the current dim or of all dims (tier, hours/capHours, multiplier, rate, active/total split, ED-killed flag)
- `/icraftdiff timer set <hours>`: seek the current dim's timer (QA)
- `/icraftdiff timer reset`: zero the current dim's timer
- `/icraftdiff uncap end`: set the ED-killed flag for the End by hand (to test the uncap)
- `/icraftdiff players`: three-state per-player status (`✓ active` / `◍ at-spawn` / `✗ idle`) with idle minutes

**Source:** `iridescent-difficulty-mod/`
**Build:** `./gradlew build` (ForgeGradle, no mixin)
**Stacks on top of (not replaced):** per-kill boss scaling, per player (`boss_progressive.js`; vanilla bosses do not scale per kill), `mob_scaling_unified.js` tier-HP block (basic 3× / mid 1.5× / champion 1.25×), Majrusz content features (treasure bags + spawn variants).

---

## Bytecode-patched mods (not in-house source)

### Patchouli-1.20.1-85-FORGE.jar

Bytecode-patched: `athrow→pop` in `Book.class` disables the `use_resource_pack` enforcement, which crashes when the book.json's resource pack flag conflicts with our pack setup. Without the patch, the codex book throws on registration.

### ars_nouveau-1.20.1-4.12.7-all.jar

Bytecode-patched: `doApply→immediate return` in `DungeonLootEnhancerModifier.class` disables Ars's chest loot injection. Without the patch, Ars adds glyph items to vanilla dungeon chests and bypasses the enchanted-book and spell-book progression curve of our LootJS overhaul.

---

## Adding a new custom JAR

1. Add the JAR to `mods/` in all three distributions (main, server_distribution, distribution/client)
2. Add the filename to the `$customJars` array in `iridescentserver.bat` (stale cleanup section)
3. Add the filename to the `$customJars` array in `sync_from_repo.bat` (stale cleanup section)
4. Add the filename to `CUSTOM_JARS` in `update_mods.sh`
5. If it is bytecode-patched, add a `-noverify` requirement note here

If the jar is mostly content (assets/data/lang) with no compiled changes, jar surgery (extract → edit → re-zip → keep the filename) avoids the Gradle rebuild and leaves the allowlist untouched.

---

## Related

- [Iridescent Modular Spells design doc](../design/iridescent-modular-spells.md)
- [Mod overview](overview.md)
