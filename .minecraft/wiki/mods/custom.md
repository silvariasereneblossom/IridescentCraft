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

### iridescent_modular_spells-0.1.0.jar

**Added 2026-04-26.** Modular spell book mod spanning ISS + Ars Nouveau ecosystems. 8 books, 6 cover materials, 4 custom magic enchants, magic-crit hook.

**Books:**
| Variant | Tier | Inherits from | Slot count |
|---|---|---|---|
| modular_copper_spell_book | T1 | ISS `SpellBook` | 5 |
| modular_iron_spell_book | T2 | ISS `SpellBook` | 10 |
| modular_gold_spell_book | T2 | ISS `SpellBook` | 10 |
| modular_diamond_spell_book | T3 | ISS `SpellBook` | 15 |
| modular_netherite_spell_book | T4 | ISS `SpellBook` | 15 |
| modular_novice_spell_book | T1 | Ars `SpellBook` (Tier ONE) | per Ars |
| modular_apprentice_spell_book | T2 | Ars `SpellBook` (Tier TWO) | per Ars |
| modular_archmage_spell_book | T3 | Ars `SpellBook` (Tier THREE) | per Ars |

**Slot system:** NBT key `imodspells_slots`, two slots per book (`cover` + `pages`). Material installed in each slot grants attribute bonuses summed via `AttributeApplier` server tick.

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
