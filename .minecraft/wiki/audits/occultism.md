# Occultism Audit

**Mod:** Occultism
**Items in JEI:** 226 (0 EPIC, 1 RARE, 0 UNCOMMON, 225 COMMON)
**Audit date:** 2026-04-27
**Verdict:** MEDIUM REWORK — three of four crafting-route shortcuts are blocked (crushing, spirit_trade, mana_infusion), but the **fourth and most powerful exploit vector — the dimensional miners — has a documented TODO that was never closed**. The `icraft_occultism_overrides` datapack referenced in code comments **does not exist**. This is the most significant ungated tier-skip vector found so far.

## Why this mod is in scope

Occultism contributes a four-tier spirit progression (Foliot → Djinni → Afrit → Marid) with summoning rituals, the Spirit Attuned Crucible material chain, and dimensional miners as automation. The mod is intentionally **not blanket-gated** in `astages_restrictions.js` because it has passive items (Demon's Dream essence, otherworld saplings) that fit early-game. The same pattern as forbidden_arcanus.

Like F&A, all 226 items show **COMMON rarity in JEI** — Occultism uses the four spirit tiers internally for power scaling, not the vanilla Rarity enum. **Third mod confirming cross-cutting finding C** (after F&A and celestial_artifacts).

Already wired:
- `kubejs/server_scripts/recipes/recipe_audit.js` Section E.2-E.4: removed crushing recipes for diamond/emerald, removed spirit_trade recipes for diamond/emerald
- `kubejs/server_scripts/recipes/tier_skip.js` lines 255-256: `occultism:spirit_attuned_gem` used as ingredient in `kubejs:enderium` Thermal-bypass alt-recipe
- `kubejs/server_scripts/gates/astages_restrictions.js` line 187: comment confirms occultism NOT mod-gated

## All items by category

### Spirit summoning chain
9 books: `book_of_binding_empty`, `book_of_binding_foliot`/`bound_foliot`, `..._djinni`/`bound_djinni`, `..._afrit`/`bound_afrit`, `..._marid`/`bound_marid`. Plus `taboo_book` (advanced). Each tier requires the previous + ritual reagents.

### Calling books (24+ Books of Calling)
Foliot Lumberjack/Transporter/Janitor + Djinni Machine Operator + crusher/foliot/etc. Books of Calling let you bind a captured spirit to a specific job. Mod-internal balance.

### Miners (4 EPIC-equivalent items, all COMMON-rated)
`miner_foliot_unspecialized`, `miner_djinni_ores`, `miner_afrit_deeps`, `miner_marid_master`, plus `miner_debug_unspecialized`. **The dimensional miner exploit:** each miner has a recipe-driven loot table that produces ores based on the dimension it's placed in. The Marid (T4-equivalent) miner can produce diamond, ancient_debris, and netherite_scrap if its loot table isn't overridden.

### Spirit-attuned materials
`spirit_attuned_gem`, `spirit_attuned_pickaxe_head`, `spirit_attuned_crystal`, `iesnium_ingot/nugget/ore` (T3-T4 endgame metal).

### Ritual scrolls
21+ `ritual_dummy/*` items (named Ritual cards). Used in Golden Sacrificial Bowl + Crystal Sacrificial Bowl rituals.

### Otherworld content
`otherworld_sapling`, `otherworld_sapling_natural`, `otherworld_ashes`, `otherworld_essence`, `otherworld_goggles`, `burnt_otherstone`, `otherstone_frame`, `otherstone_tablet`. Otherworld is Occultism's astral-dimension overlay (no separate dimension; you "see through" via goggles).

### Reagents and core materials
`demons_dream_essence`, `dictionary_of_spirits`, `dictionary_of_spirits_icon`, `spirit_fire`. The starter reagent → ritual loop.

### Surprisingly Substantial Satchel (RARE)
The one RARE item in the mod. Bag-of-holding storage utility.

## Findings

### Properly gated (no action)

- **Crushing recipe shortcut blocked** (`recipe_audit.js` E.2) — Occultism's Spirit-Attuned Crusher can't convert lower-tier blocks → diamond/emerald.
- **Spirit Trade shortcut blocked** (E.3) — summoned spirits can't trade away gated materials.
- **Cross-mod synergy** — `spirit_attuned_gem` is used as a Thermal-enderium-via-Occultism alternative recipe. Provides cross-mod recipe diversity without breaking tier gates.

### CRITICAL — dimensional miners are completely ungated

This is the single biggest unmitigated exploit vector found in the audit so far.

**The risk:**
1. Foliot Miner — produces ores from the Overworld. T1-equivalent.
2. Djinni Ore Miner — produces ores including diamond. **T3-tier output, T2-craftable.**
3. Afrit Deep Ore Miner — produces deep-ore equivalents (ancient_debris analog). **T4-tier output, T3-craftable.**
4. Marid Master Miner — produces highest-tier outputs across dimensions. **T4-tier output, T4-craftable but loot is dimension-limited.**

The mod ships these miners with built-in JSON loot tables at `data/occultism/recipes/miners/`. **Without a datapack override, players can:**
- Craft a Djinni Ore Miner at T2 → get diamonds without entering the Nether
- Craft an Afrit Deep Ore Miner at T3 → get netherite-equivalent without End access
- Bypass the entire AStages dimension lock through automation

**The fix was already designed but never implemented.** `recipe_audit.js` line 137 explicitly says:
> ```
> NOTE: Verify icraft_occultism_overrides datapack handles this.
> ```

Looking at `datapack_sources/`:
```
champions_datapack
icraft_aethersteel_overrides
icraft_apotheosis_affixes
icraft_botania_overrides     ← exists, handles Orechid
icraft_dungeon_crawl_overrides
icraft_loot_overrides
...
```
**`icraft_occultism_overrides` does NOT exist.** The TODO was never closed.

**Action (highest priority of any audit finding so far):** create the `icraft_occultism_overrides` datapack at `datapack_sources/icraft_occultism_overrides/` mirroring the `icraft_botania_overrides` pattern. Each override targets `data/occultism/recipes/miners/<miner_id>.json` and either:
1. Removes diamond/ancient_debris/netherite_scrap from the loot result table for that miner, OR
2. Replaces the entire result table with a tier-appropriate one (e.g., Djinni miner produces only iron/copper/coal; Afrit miner produces those plus diamond IF the player is T3+ which AStages can't enforce on a tile entity).

Approach 1 is simpler and safer — strip the offending outputs entirely. Players still get value from the miners (lots of common ores, faster than mining manually) but can't tier-skip.

### CONCERN — `spirit_attuned_pickaxe_head` (COMMON, ungated)

Used as a Tetra material? Not currently in the Tetra material datapack list. If used in vanilla pickaxe construction, it might bypass material-tier requirements. **Verify** what slot/recipe it serves.

### CONCERN — `iesnium_ingot/nugget/ore` (T3-T4 endgame metal, COMMON-rated)

Iesnium is Occultism's late-game material (similar to F&A's deorum or Botania's elementium). Found in The Dreamworld dimension. Not in any of our stage lists.

If the Dreamworld dimension itself is dimension-gated (need to verify in `astages_restrictions.js`), iesnium is transitively gated. If not, players can rush iesnium without tier checks.

**Action:** verify Dreamworld dimension gating; if missing, add to T3-T4 dimension restrictions.

### CONCERN — Books of Binding chain not explicitly tier-gated

The book chain (foliot → djinni → afrit → marid) is the mod's primary tier system. Each tier requires the previous tier as a recipe ingredient PLUS dimension-specific reagents (Nether for Afrit, End for Marid). So it's transitively gated through dimensions.

But: if a player gets a `book_of_binding_djinni` from chest loot (chest-gen possibility?), they skip the foliot tier. **Action:** verify these books don't appear in chest loot tables; if they do, strip via lootjs.

### Verified clean

- **`spirit_fire`** — Occultism's flint-and-steel-equivalent fire-source. Used in many Occultism recipes (gates several mod-internal crafts). Low balance impact.
- **`dictionary_of_spirits`** — codex book. T1 starter; mod auto-gives on first joining. No issue.
- **`demons_dream_essence`** — entry-tier reagent (smoked from Demon's Dream weed). T1. Fine.
- **`taboo_book`** — high-tier ritual book. Acquired through advanced rituals which require lower-tier books. Transitive.

### Items not currently touched by gates

The 226 COMMON items split:
- ~40 progression items (books, miners, spirit-attuned materials, iesnium chain)
- ~100 ritual scrolls + cosmetic items (otherstone variants, otherworld decor)
- ~80 building blocks (otherstone bricks, slabs, stairs, walls — derived from base otherstone)

The 200+ derivative blocks/scrolls don't need gating; they're flavor. The ~40 progression items are mostly transitively gated via the spirit-tier chain, *if* the chain itself is properly enforced.

### Standouts

- **The miner exploit is the highest-priority unaddressed finding in any audit so far.** Higher than simplyswords' rename drift, higher than terramity's curio gap. This is a **dimension-skipping automation**, not just an item leak.
- **The TODO comment is dated** — `recipe_audit.js` line 135-137 was written when the datapack pattern was first established for Botania. The intent was clear, the work just got dropped. This is a process lesson: **TODOs in code that depend on external artifacts (datapacks, configs) need a build-time check** or they silently rot.

## Recommended actions (priority order)

1. **(CRITICAL)** Create `datapack_sources/icraft_occultism_overrides/data/occultism/recipes/miners/` with overrides for the 4 named miners. Strip diamond, ancient_debris, netherite_scrap, and any other T3+ ores from their result tables. Mirror the `icraft_botania_overrides` directory structure. This closes the largest tier-skip vector in the pack.
2. **(verify)** Dreamworld dimension gating — if missing, add `'occultism:dreamworld'` (or actual dim ID) to T3 or T4 dimension restrictions.
3. **(verify)** `spirit_attuned_pickaxe_head` — what does it slot into? If it's a vanilla-pickaxe-construction component, may need additional gating.
4. **(verify)** Books of Binding don't appear in chest loot. If they do, lootjs strip them.
5. **(process)** Add a one-time check that all `icraft_*_overrides` datapacks referenced in code comments actually exist on disk. Could be a startup_scripts validation script.

## Existing coverage map

| File | What it does | Occultism hits |
|------|--------------|---------------:|
| `recipes/recipe_audit.js` Section E.2 | Crushing diamond/emerald removed | 2 recipes |
| `recipes/recipe_audit.js` Section E.3 | Spirit trade diamond/emerald removed | 2 recipes |
| `recipes/recipe_audit.js` Section E.4 | **TODO comment for miners — never closed** | 0 actual mitigation |
| `recipes/tier_skip.js` lines 255-256 | spirit_attuned_gem in cross-mod recipe | 1 ingredient |
| `gates/astages_restrictions.js` line 187 | Comment: not mod-gated | 0 actual gates |

Total: 10 occultism references. **Coverage is incomplete by design** (per the line-187 comment), but the missing miner-overrides datapack is a critical blocker.
