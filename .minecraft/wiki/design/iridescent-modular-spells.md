<!-- INTERNAL ONLY -->
# Iridescent Modular Spells — design doc

A custom Forge content mod that bridges Tetra's modular-item system to Iron's Spellbooks and Ars Nouveau, replacing the functionality of the ARR-licensed `[TSB] Tetra Spell Book` mod with a license-clean implementation we can publish and extend.

**Status:** design phase, 2026-04-25.
**Effort estimate:** 1–2 weeks of focused work, phased.
**Hard prerequisite:** decision to spend that time pre-decom (2026-05-20) instead of bug-fixing. See "Phasing & timeline" at the bottom.

---

## Goals

1. **Modular ISS spell books** — copper / iron / gold / diamond / netherite books gain 4 module slots (cover, back cover, pages, spine). Each slot accepts material modules that contribute additive bonuses to spell power, max mana, mana regen, channel speed, cooldown reduction.
2. **Modular Ars items** — Novice/Apprentice/Archmage spell books, Spell Bow, Spell Crossbow, Enchanter's Sword get the same 4-slot treatment. Stats lean toward utility (cooldown / channel) for Ars items; ISS books lean toward power.
3. **Enchant support** — both ISS and Ars modular books are enchantable at the enchanting table. Mending repairs them. Unbreaking applies (durability is a Tetra concept on these items, distinct from their existing wear semantics).
4. **Future Tetra expansions** — architecture parameterized by item type, slot config, and material registry, so adding new modular items in a future content drop is an additive change, not a rewrite.

## Non-goals (explicitly defer)

- **Per-spell modules** ("modules that change which spells the book casts"). Stick to stat-bonus modules; spell selection stays inside ISS's existing inscribe/swap UI.
- **Modular Tetra-style ability buttons on spell books.** TSB doesn't do this either; not worth the extra surface.
- **Cross-mod synergies that aren't naturally there** (e.g., ISS+Ars combo modules). Each item type pulls from its own module pool.

## Architecture

### Project layout

Parallel to existing `iridescent-origins-mod` and `iridescent-biomes-mod`:

```
/root/IridescentCraft/iridescent-modular-spells-mod/
|- build.gradle                # ForgeGradle 6 + Tetra/ISS/Ars compileOnly deps
|- gradle.properties           # mod_id=iridescent_modular_spells, version, etc.
|- settings.gradle
|- gradlew, gradlew.bat
|- build_mod.sh                # gradle build + deploy to all 3 distros
|- src/main/java/com/iridescentcraft/modspells/
|   |- IridescentModularSpells.java   # @Mod entrypoint
|   |- item/
|   |   |- ModularSpellBookItem.java  # extends Tetra ModularItem, implements ISS SpellBook contract
|   |   |- ModularNoviceBookItem.java # Ars novice book wrapper
|   |   |- ModularSpellBowItem.java   # Ars spell bow wrapper
|   |   |- ModularSpellCrossbowItem.java
|   |   |- ModularEnchantersSwordItem.java
|   |- registry/
|   |   |- ModItems.java              # DeferredRegister for all modular items
|   |   |- ModRecipes.java            # Upgrade recipes (vanilla book -> modular book)
|   |- compat/
|   |   |- IronsSpellsCompat.java     # @ModBus listener; soft-dep on irons_spellbooks
|   |   |- ArsNouveauCompat.java      # @ModBus listener; soft-dep on ars_nouveau
|- src/main/resources/
|   |- META-INF/mods.toml             # license="MIT" (we own this), deps: tetra, optional: ISS+Ars
|   |- pack.mcmeta
|   |- data/iridescent_modular_spells/
|   |   |- modules/                   # Tetra-format module JSONs
|   |   |   |- spell_book/cover/
|   |   |   |- spell_book/back_cover/
|   |   |   |- spell_book/pages/
|   |   |   |- spell_book/spine/
|   |   |   |- spell_bow/...
|   |   |   |- enchanters_sword/...
|   |   |- materials/                 # Tetra-format material JSONs
|   |   |   |- leather.json           # +small bonuses
|   |   |   |- iron.json
|   |   |   |- gold.json
|   |   |   |- diamond.json           # gated T3 already
|   |   |   |- netherite.json         # gated T4 already
|   |   |   |- arcane_crystal.json    # gated T3 (just added)
|   |   |   |- source_gem.json        # T2 — Ars-themed material
|   |   |   |- mana_crystal.json      # T2 — ISS-themed material
|   |   |- recipes/                   # smithing/anvil upgrades from vanilla -> modular
|   |   |- tags/items/                # enchantable categories
```

### Tetra ModularItem extension model

From the API survey:
- Override `getMajorModuleKeys(ItemStack)` to return `["cover", "back_cover", "pages", "spine"]`
- Override `getMinorModuleKeys(ItemStack)` to return improvements (Tetra calls these "minor"). Could be honing slots or none; defer for v1.
- Module data goes in NBT under each module key as a sub-CompoundTag pointing to a registered module variant JSON.
- Tetra auto-populates `getAttributeModifierCache` from the module JSON's `attributes` block. We just need to use vanilla Forge attribute names (`irons_spellbooks:spell_power`, `ars_nouveau:ars_nouveau.perk.spell_damage`, etc.) and Tetra wires them up.

### ISS / Ars compat (soft-dep)

Mod's `mods.toml` declares ISS and Ars as `mandatory=false` runtime deps. The `compat/` package classes are loaded conditionally:

```java
@Mod.EventBusSubscriber(modid = MODID, bus = Mod.EventBusSubscriber.Bus.MOD)
public class IronsSpellsCompat {
    public static boolean LOADED = false;

    @SubscribeEvent
    public static void onSetup(FMLCommonSetupEvent e) {
        LOADED = ModList.get().isLoaded("irons_spellbooks");
        if (LOADED) registerIssModularBooks();
    }
}
```

If ISS isn't installed, the modular ISS books simply don't register. Same pattern for Ars.

### Spell-casting delegation

Modular ISS book extends `ModularItem` AND implements ISS's spell-book contract. Spell casts call through to the parent ISS book item logic; module bonuses apply via attribute modifiers (which ISS's `getSpellPower(level, entity)` already reads). No need to override casting logic itself — Tetra provides the modular gear, ISS provides the casting, and they meet at the attribute layer.

For Ars items, similar story — Ars's spell resolution reads the entity's `ars_nouveau:ars_nouveau.perk.spell_damage` attribute, which our modules can buff via Tetra's standard `attributes` JSON block.

### Enchantability

Override `Item.canBeEnchanted(ItemStack)` to return true. Add the items to `#minecraft:enchantable/sword` (for melee Enchanter's Sword) and a new `#iridescent_modular_spells:enchantable/spell_book` tag with appropriate vanilla/mod enchant restrictions. Mending + Unbreaking apply trivially. Vanilla Sharpness etc. don't apply meaningfully to spell books — relevant enchants are likely:
- ISS-shipped enchants targeting spellbook tag
- Apotheosis affixes (already extensible to any item via the affix-loot-rules JSON we already author)
- Mending / Unbreaking / (maybe) Curse of Vanishing

## Material design

5–8 base materials, mapped to existing tier gates:

| Material | Tier | Cover/Spine bonus | Pages bonus | Notes |
|---|---|---|---|---|
| Leather | T1 | +5% mana | +2% spell power | starter material |
| Iron | T1 | +5% spell power | +5% mana | iron is T1-T2 transitional |
| Gold | T2 | +10% channel speed | +10% cooldown reduction | gold is "magical" |
| Diamond | T3 | +15% spell power | +10% spell power | gated T3 |
| Netherite | T4 | +20% spell power, +5% durability | +15% spell power | gated T4 |
| Arcane Crystal | T3 | +12% spell power, +12% mana regen | +12% mana | F&A material, gated T3 |
| Source Gem | T2 | +15% channel speed | +15% cooldown | Ars-themed, T2 |
| Mana Crystal | T2 | +12% max mana | +8% mana regen | ISS-themed (we'd need to define this — could reuse `irons_spellbooks:common_ink` or similar) |

## Recipe paths

Two routes to obtain a modular book:

1. **Smithing-table upgrade**: existing ISS/Ars book + Tetra workbench (or smithing template + materials) produces the modular variant. Materials become module slots auto-filled with leather (default starter).
2. **Tetra workbench**: the standard Tetra path — craft a "blank" modular book at the workbench, fit modules slot-by-slot.

Path 1 keeps progression continuous (don't lose your existing book). Path 2 matches Tetra's standard UX. Ship both.

## Tier-gating

Already covered by existing AStages restrictions:
- The vanilla ISS/Ars books are gated by `astages_restrictions.js` already (T1 novice/apprentice, T3 archmage; T1 copper, T3 gold/diamond, T4 netherite for ISS).
- The modular variants inherit the same gating by being craftable only after you have the source book + appropriate-tier materials.
- New `iridescent_modular_spells:*` items get added to AStages entries by tier (parallel to the existing entries).

## Build + deploy

Following the established custom-jar pattern:

1. `iridescent-modular-spells-mod/build_mod.sh`:
   - `./gradlew build`
   - copy `build/libs/iridescent_modular_spells-1.0.0.jar` to all 3 distros' `mods/`
2. **Custom JAR allowlist** in `iridescentserver.bat`, `sync_from_repo.bat`, `update_mods.sh`:
   - Add `iridescent_modular_spells-*.jar`
3. `.gitignore` allow-list (per the existing pattern):
   - `!.minecraft/mods/iridescent_modular_spells-*.jar` etc. for all 3 distros

## Phasing & timeline

Built in stages so the project can pause at any phase and still ship a useful artifact:

### Phase 0 — Project bootstrap (~1 day)
- Gradle init, Tetra/ISS/Ars compileOnly deps, mods.toml, package skeleton
- Empty `@Mod` class + DeferredRegister scaffolding
- `build_mod.sh` → produces a no-op jar that loads cleanly
- `.gitignore` + allowlist updates
- **Deliverable:** an empty mod that loads on the test server without crashing

### Phase 1 — One modular book end-to-end (~3 days)
- Implement modular Copper Spell Book only (proves the pipeline)
- 2 module slots only (cover, pages — defer back_cover and spine)
- 3 materials (leather, iron, diamond — proves the gating layer works)
- Recipe: smithing-table upgrade from vanilla copper_spell_book
- **Deliverable:** in-game, an Archmage can craft a modular copper book, install a leather cover, see +5% mana on the tooltip, cast a spell with the bonus applied. Validates the full ISS-attribute integration.

### Phase 2 — Full ISS spell book coverage (~2 days)
- Apply Phase-1 pattern to iron / gold / diamond / netherite books
- All 4 module slots
- All 5–8 materials
- **Deliverable:** every ISS spell book is modularizable

### Phase 3 — Ars items (~3 days)
- Modular Novice / Apprentice / Archmage spell book wrappers
- Modular Spell Bow + Crossbow + Enchanter's Sword
- Ars-flavored material bonuses
- **Deliverable:** Ars items match ISS in modularity

### Phase 4 — Enchant support (~1 day)
- canBeEnchanted overrides
- Tag entries
- Custom enchant compat (if any)
- **Deliverable:** spell books accept enchantments at the table

### Phase 5 — Polish (~1 day)
- Tooltips show breakdown by slot
- Module-swap UI hints
- Patchouli codex entry under iridescent_codex/mods_t1 or t2
- Tier-gating finalization in astages_restrictions.js
- Class kit polish (Archmage starts with one cover module)
- Wiki updates: design doc cross-link, mechanics doc 6th-layer note

**Total: 11 days of focused work, phased.**

## Risks

1. **Tetra API stability** — we're depending on `ModularItem` and the module JSON schema. Mickelus is responsive to issues but if the API shifts in a future Tetra version, we're on the hook to update.
2. **ISS or Ars internal changes** — both mods have private APIs around their item classes. Where possible, attach via the public attribute system; avoid reflection.
3. **Java content-mod debugging cycle** — slower iteration than KubeJS. Plan for ~3x the iteration time of a KubeJS feature.
4. **License clarity** — we ship MIT (matches our other custom mods). Anything we model on TSB is functional, not source-derived. **No copy-pasting from TSB or its decompile.** All implementation comes from Tetra's public API + our reading of ISS/Ars public APIs.

## Decision points before starting

1. **Time budget OK?** This is 11 days of focused work in a 26-day window with stated bug-fix priority. Net-net: most of the available pre-decom time goes to this. Acceptable?
2. **Scope OK?** Defer Spell Bow/Crossbow/Enchanter's Sword (Phase 3 partial)? Saves 2 days and still hits the headline ISS-modularity feature.
3. **Phase gates?** Stop after Phase 2 (full ISS coverage but no Ars), evaluate, then commit to Phase 3+? Lower commitment, allows pivot if it doesn't play well.
