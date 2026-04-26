# Custom Mods

Mods built from source or bytecode-patched in-house. None are managed by packwiz; they're committed directly to the repo and listed in the **custom-JAR allowlist** in both `iridescentserver.bat` and `sync_from_repo.bat` so the self-updater doesn't delete them as stale.

**JVM flag requirement:** the two bytecode-patched mods (Patchouli, Ars Nouveau) create dead code paths the verifier rejects. `-noverify` is required on both client and server JVM args. Server has it baked into `iridescentserver.bat`; client must add it manually in PrismLauncher (Instance → Settings → Java → JVM arguments).

---

## In-house mods (built from source)

### iridescent_origins-1.0.0.jar

Origins / races / classes implementation. Three sequential prompts on first join: Origin (13 origins, 9 vanilla + 4 custom) → Race (11 icraft) → Class (10 icraft). Implements glass-cannon HP modifiers, Faefolk armor weakness, Witch of Ink frailty, Archmage glass frame, and all the per-class power JSONs.

**Source:** `iridescent-origins-mod/src/main/resources/data/icraft/origins/*.json`
**Build:** `iridescent-origins-mod/build_mod.sh` (or jar-surgery for content-only edits — `iridescent_origins-1.0.0.jar` content-extract → edit → re-zip without Gradle rebuild).

### iridescent_biomes-1.0.0.jar

Custom TerraBlender region registration for `iridescent_biomes:cherry_river_valley` + `iridescent_biomes:cherry_mountains`. TerraBlender 3.x on 1.20.1 needs Java-side region registration via explicit `Climate.ParameterPoints` — datapacks alone can't assign parameter points. Biome JSONs + `is_overworld` + `is_mountain` tags + lang entries ship inside the jar under `data/iridescent_biomes/...` (biome namespace MUST match modId).

**Source:** `iridescent-biomes-mod/src/main/...`
**Build:** `./gradlew build` from `iridescent-biomes-mod/` (ForgeGradle toolchain).
**Caveat:** if you delete this jar the biomes stop spawning (but stay registered — Nature's Compass shows them with empty Dimension).

### iridescent_codex_data.jar

Patchouli Codex book. Shipped as a **javafml content mod** with a minimal compiled `@Mod` class. **`modId` MUST be `"icraft"`** to match the book.json path at `data/icraft/patchouli_books/iridescent_codex/book.json` — Patchouli's `BookRegistry.init()` scans `data/{modId}/patchouli_books/` so a modId mismatch silently no-registers the book (confirmed 2026-04-19: earlier attempts with modId `iridescent_codex_data` produced "Invalid book" tooltips).

**Source:** `datapack_sources/iridescent_codex/`
- `src/com/iridescentcraft/codex/IridescentCodex.java` — `@Mod("icraft")` entrypoint
- `stub/net/minecraftforge/fml/common/Mod.java` — annotation stub for compile-without-Forge-jar
- Only `IridescentCodex.class` ends up in the final jar
- `data/` mirrors to `assets/` automatically because `book.json` has `use_resource_pack: true`

**Build:** `bash build_codex.sh` — compiles + packs + deploys to all 3 distros. Jar filename remains `iridescent_codex_data.jar` so the custom-JAR allowlists don't need updating on rebuild.

### iridescent_modular_spells-0.2.0.jar

**Added 2026-04-26.** Modular spell book mod spanning ISS + Ars Nouveau ecosystems with full Tetra workbench integration. License-clean reimplementation of CurseForge's TSB (TSB is All Rights Reserved; we mirror its API-driven structure but write our own code/data).

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
| modular_blaze_spell_book | T3 | ISS `SpellBook` | 12 | **first-kill: ISS fire_boss** (then 50% sustained from blaze drop) |
| modular_evoker_spell_book | T3 | ISS `SpellBook` | 12 | **first-kill: ISS archevoker** |
| modular_netherite_spell_book | T4 | ISS `SpellBook` | 15 | smithing |
| modular_necronomicon_spell_book | T4 | ISS `SpellBook` | 15 | **first-kill: ISS dead_king** |
| modular_novice_spell_book | T1 | Ars `SpellBook` (Tier ONE) | per Ars | craft / vanilla → modular auto-convert |
| modular_apprentice_spell_book | T2 | Ars `SpellBook` (Tier TWO) | per Ars | craft |
| modular_archmage_spell_book | T3 | Ars `SpellBook` (Tier THREE) | per Ars | craft |

**Per-book intrinsic stat overlay (BookKind enum):** Each item adds Phase 6F buff modifiers on top of ISS's vanilla intrinsics. Stats stack additively across 3 layers in `getAttributeModifiers(SlotContext, UUID, ItemStack)`:
1. `super` — ISS vanilla per-book intrinsics (preserved)
2. `BookKind.intrinsicModifiers` — Phase 6F overlay (e.g. dragonskin: +25% Ender + +50 max_mana on top of ISS's +10% Ender → +35% Ender baseline)
3. `getAttributeModifiersCached` — Tetra slot/lining attrs from installed modules

Mage power curve is **uncapped by design** — mages weak early, highest peaks at T3-T4.

**Tetra slot model (4 majors per book, no `core` slot — items are tier-locked):**
- ISS: `iss_book/{front_cover, back_cover, spine, pages}`
- Ars: `ars_book/{front_cover, back_cover, spine, dye}`
- Front + back covers each have a separate **lining install** (Tetra-canonical `displayType: improvement`) — fabric/fibre/skin lining categories with thematic stat bonuses.

**Tetra replacement system:** vanilla `irons_spellbooks:<X>_spell_book` and `ars_nouveau:<X>_spell_book` items auto-convert to our modular variants on first inventory tick, with default modules pre-installed. No need to rewrite vanilla loot tables.

**ISS boss-drop wiring (Phase 6F-1):**
- **First-kill guarantees** (per-player, `EntityEvents.death` + persistentData): `dead_king` → necronomicon, `archevoker` → evoker_spell_book, `fire_boss` → blaze_spell_book, `aether:valkyrie_queen` → magehunter
- **Sustained drops** (LootJS): `dead_king` → blood_staff 50%, `citadel_keeper` → keeper_flamberge 40%, ISS `cryomancer` mob → ice_staff 15%, ISS `pyromancer` mob → pyromancer armor pieces ~10% each, `aether:cockatrice` → lightning_rod 25%, `twilight:snow_queen` → ice_staff 50%, `twilight:alpha_yeti` → ice_staff 25%, `aether:valkyrie_queen` → magehunter 30%, vanilla `phantom` (during thunderstorm) → lightning_rod 5%

**Legacy `imodspells_slots` NBT system** (Phase 1-5) still active for stat-bonus computation through Phase 6C. Phase 6D will run the migration to Tetra Modules NBT and retire `AttributeApplier` + `AnvilModuleInstaller`.

**Cover materials (ISS metal):** leather (T1) → copper (T1) → iron (T2) → gold (T2) → diamond (T3) → netherite (T4)
**Cover materials (Ars cloth):** white_wool (T1) → manaweave_cloth (T2 Botania) → sorcerer_robes (T3 Ars) → spell_cloth (T4 Botania endgame)

**Custom enchants** (book-exclusive via custom EnchantmentCategory):
- `mana_capacity` I-V — +5%/lv max mana (ISS + Ars)
- `mana_flow` I-III — +5%/lv mana regen
- `magic_crit_chance` I-III — +5%/lv magic crit roll
- `magic_crit_damage` I-III — +25%/lv magic crit damage

**Magic crit hook:** vanilla magic doesn't crit. `kubejs/server_scripts/magic_crit_hook.js` intercepts magic-typed `LivingHurtEvent`, rolls `magic_crit_chance` enchant on attacker's mainhand book + player's `icraft_crit_chance` attribute (cross-system synergy with melee crit), multiplies damage on hit.

**Caster starter kits:** Archmage / Battlemage / Void Summoner spawn with the modular variants instead of vanilla ISS/Ars books.

**Source:** `iridescent-modular-spells-mod/src/main/...`
**Build:** `bash build_mod.sh` (Gradle wrapper; deploys to all 3 distros).
**Build deps:** ISS, Curios, Ars Nouveau, GeckoLib (transitive — Ars's SpellBook implements GeoItem) — all `compileOnly` via `flatDir libs/`.

### mek_walkable_cables-1.0.1.jar

Mekanism cable coremod making cables walkable instead of player-pass-through.

### zeta_racefix-1.0.0.jar

Race selection fix for the Origins layer ordering bug.

### offlineskins-1.20.1-v1.jar

Offline skin support — required for LAN play without Mojang auth.

---

## Bytecode-patched mods (not in-house source)

### Patchouli-1.20.1-85-FORGE.jar

Bytecode patched: `athrow→pop` in `Book.class` to disable the `use_resource_pack` enforcement that crashes if the book.json's resource pack flag conflicts with our pack setup. Without the patch, the codex book throws on registration.

### ars_nouveau-1.20.1-4.12.7-all.jar

Bytecode patched: `doApply→immediate return` in `DungeonLootEnhancerModifier.class` to disable Ars's chest loot injection. Without the patch, Ars adds glyph items to vanilla dungeon chests, bypassing our LootJS overhaul's enchanted-book + spell-book progression curve.

---

## Adding a new custom JAR

1. Add the JAR to `mods/` in all three distributions (main, server_distribution, distribution/client)
2. Add the filename to the `$customJars` array in `iridescentserver.bat` (stale cleanup section)
3. Add the filename to the `$customJars` array in `sync_from_repo.bat` (stale cleanup section)
4. Add the filename to `CUSTOM_JARS` in `update_mods.sh`
5. If bytecode patched, add `-noverify` requirement note here

If the jar is content-mostly (assets/data/lang) without compiled changes, jar surgery (extract → edit → re-zip → keep filename) avoids the Gradle rebuild and the allowlist is untouched.

---

## Related

- [Iridescent Modular Spells design doc](../design/iridescent-modular-spells.md)
- [Game mechanics deep-dive](../mechanics/game-mechanics.md) — internal-only
- [Mod overview](overview.md)
