# Protocol 9 — New Mod Audit

<!-- INTERNAL ONLY -->

When adding a new content mod to the pack, run through this checklist BEFORE merging the `.pw.toml` to `main`. Surfaced as a process improvement (audit FINDINGS #43, Phase 8.2) — three mods (art_of_forging, too_many_bows, moreartifacts) shipped without any gating because nothing forced this check at integration time.

The check is most useful for **content mods** (mods that add items, blocks, or recipes). Pure utility / performance / decoration mods can be checked more lightly.

## Pre-merge

1. **Add to `.pw.toml` index** in all 3 distros (main, server_distribution, client). Set `side` correctly (most mods are `side = 'both'`; see CLAUDE.md "Mod Index Side Labels").

2. **Server compatibility audit.** Per CLAUDE.md "Server Mod Compatibility Audit" — if the mod references client-only classes, it'll crash dedicated server. Quick check:
   - Look at the mod's CurseForge/Modrinth page for explicit dedicated-server support
   - If unclear, search the mod jar for `Screen`, `MouseHandler`, `Minecraft.class`, rendering classes
   - If client-only, mark `side = 'client'` in server distro + add to force-skip lists

## Post-first-server-start

Run the server with the new mod and capture the JEI item dump (per `wiki/audits/README.md` Source data section). Then compare against the previous dump to identify new items:

```bash
# Capture new dump
diff <(awk -F'\t' '{print $1":"$2}' previous_all_items.tsv | sort -u) \
     <(awk -F'\t' '{print $1":"$2}' new_all_items.tsv | sort -u) \
  | grep '^>' | head -50
```

3. **Categorize new items by rarity/role.** For each new namespace, group items into:
   - **EPIC** — needs gating decision
   - **RARE / UNCOMMON** — likely needs gating
   - **COMMON** — usually flavor; check for outliers (e.g., `_spawn_egg`, `_debug_*`)
   - **Custom rarity** (chat-color or mod-internal) — see audit cross-cutting C; treat as unknown power level until verified

## Gating decision matrix

For each EPIC and most RARE items, choose ONE gating approach:

| Approach | When to use | Example |
|----------|-------------|---------|
| **Stage gate** (`astages_restrictions.js`) | Item should be inert until tier reached. Lowest effort. | Material ingots, endgame curios |
| **Recipe removal** (`recipe_audit.js`) | Item shouldn't be craftable; drops-only design | Boss-themed weapons, custom armor sets |
| **Chest pool allocation** (`lootjs_overhaul.js` Section 1) | Item is OK to drop in chests but only at appropriate tier | Curio mods (artifacts, relics, celestial, moreartifacts) |
| **Boss-drop allocation** (mod-specific `*_drops.js`) | Item is themed to a specific boss/dimension | Cataclysm/Twilight/Aether/Blue Skies weapons |
| **Recipe override** (`tier_gated_recipes.js`) | Item has a recipe that needs ingredient swap | Workbench-tier items |
| **Datapack override** (`datapack_sources/icraft_<mod>_overrides/`) | Item config is datapack-driven (loot tables, biome modifiers) | Botania Orechid, Occultism miners |
| **Three-layer gate** | Mod is "doesn't fit the pack" — strip everything | Terramity guns, Blue Skies Diopside/Charoite/Horizonite tools |
| **Tetra replacement** | Want a modified version of an existing item | ISS spell books → modular variants |
| **Drops-only with native GLM blocked** | Mod ships its own loot injection that's too aggressive | RPG Set Effects |
| **Chokepoint gate** | Mod has a clear workstation/reagent that gates everything | F&A Hephaestus Forge, Botania Gaia Guardian |

If uncertain which approach, default to **stage gate + chest pool allocation** as the safe combination.

## Cross-cutting checks

4. **Non-vanilla rarity check** (cross-cutting C): does the mod use ChatFormatting colors or a custom Rarity enum? If yes, the JEI rarity column is misleading; verify item power directly via `weapon_attributes.json5` config or stat lookup.

5. **Namespace collision check** (Phase 2.2 lesson): does the mod use any item IDs that match our `kubejs:*` or another mod's IDs? Run:
   ```bash
   awk -F'\t' '{print $2}' all_items.tsv | sort | uniq -c | sort -n | tail -10
   ```
   If duplicates surface, decide on rename or strip (see fix-plan decision #1 for rift_shard pattern).

6. **Native GLM check**: does the mod ship `data/<mod>/loot_modifiers/` files that auto-inject items? If yes, those bypass our chest pool allocations. Either:
   - Block via `global_loot_modifiers.json` `"replace": true` (rpgseteffects pattern), OR
   - Verify the GLM injection rates are tier-appropriate, OR
   - Override the GLM via datapack

7. **Stale-ID validator update**: if you add `event.remove({output: 'modid:itemid'})` calls, also add the IDs to `kubejs/server_scripts/validate_recipe_removals.js` REMOVAL_TARGETS list. The validator catches drift on next mod update.

## Datapack creation

If the mod requires a datapack override:

8. Create `datapack_sources/icraft_<modid>_overrides/` with `pack.mcmeta` + `data/...` files
9. ZIP it: `cd datapack_sources/icraft_<modid>_overrides && zip -r /tmp/icraft_<modid>_overrides.zip pack.mcmeta data/`
10. Copy zip to all 3 `config/paxi/datapacks/` dirs
11. Add the entry to all 3 `config/paxi/datapack_load_order.json` files
12. Run `tools/validate_datapack_references.sh` — should report all clean
13. Update the comment in `recipes/recipe_audit.js` (if there's a TODO referring to the new datapack — close it explicitly)

## Final

14. **Audit doc**: if the mod is substantial (>30 items or has clear progression), create a new `wiki/audits/<modid>.md` audit report. Otherwise add a row to the relevant batch audit doc.

15. **Update FINDINGS.md** if any new items couldn't be gated and need follow-up.

16. **Commit + push.** Per memory `feedback_commit_changes.md`, both are required (sync to Windows depends on push).

## Anti-patterns

Things that should NOT happen (and why each shows up in the audit):

- **TODO comment referencing a datapack that doesn't exist** (occultism rot)
  → Always create the datapack file BEFORE writing the comment. Or run `tools/validate_datapack_references.sh` to catch.

- **Recipe-removal list with stale IDs** (simplyswords drift)
  → After mod updates, re-run the stale-ID validator (`kubejs/server_scripts/validate_recipe_removals.js` runs at server start) and prune.

- **EPIC item with no gating** (art_of_forging / too_many_bows / moreartifacts)
  → Step 3 above (categorize) makes this visible. Don't merge until each EPIC has a chosen approach.

- **Mod-blanket gate on a mod that has passive/food items** (occultism / forbidden_arcanus)
  → Use per-item or chokepoint gating instead. Document the decision in the mod's audit doc.

- **Renaming our internal item ID without a migration path** (rift_shard near-miss)
  → Keep the old item registered for one transition window, run a `PlayerEvents.loggedIn` migration (see `kubejs/server_scripts/migrations/rift_shard_rename.js`), then remove old after testers confirm.
