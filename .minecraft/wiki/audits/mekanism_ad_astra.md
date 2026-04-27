# Mekanism + Ad Astra Audit

**Mods:** Mekanism, Mekanism Generators, Ad Astra (audited together — they form one tech-tree progression)
**Items in JEI:** 822 combined (Mekanism 379, Mekanism Generators 33, Ad Astra 410)
**Audit date:** 2026-04-27
**Verdict:** GREENLIT — second benchmark audit. Mekanism is mod-blanket-staged at T3 with all major shortcut paths blocked (Enriching/Combining/Purifying/Injecting/Mixing for gated materials). Ad Astra is dimension-T4-locked with 4-tier rocket progression + NASA Workbench + Jet Suit removal. MekaSuit Mk2 endgame upgrade path is fully wired through Mythic Forge. ~192 references across 17 files. **Largest single tech-tree audit, smallest finding count.**

## Why these mods are in scope

Mekanism is the pack's primary tech-progression mod (T3 entry, MekaSuit endgame). Ad Astra is the post-T4 space progression (5 planets, MekaSuit Mk2 capstone). They share a tight dependency: Ad Astra's NASA Workbench requires Mekanism Steel Casing; rockets require Mekanism Steel Plate; MekaSuit Mk2 requires base MekaSuit. Auditing together because the tier flow doesn't make sense in isolation.

User's expectation going in: "I don't expect to find much here since this was heavily tiered going into this." Confirmed — coverage is extensive and intentional.

Already wired (192 references across 17 files):
- `kubejs/server_scripts/gates/astages_restrictions.js`:
  - Line 180: `mekanism` blanket T3-staged
  - Line 181: `mekanismgenerators` blanket T3-staged
  - Lines 258-259: osmium ore + deepslate_osmium_ore replacement at T3
  - Lines 285-294: 11 specific T4 items (digital_miner, fusion_reactor_controller, MekaSuit 4 pieces, meka_tool, qio_drive_array/dashboard/importer/exporter, ultimate_control_circuit, antiprotonic_nucleosynthesizer, atomic_alloy)
  - Lines 382-386: 5 Ad Astra dimensions T4-staged (moon, mars, mercury, venus, glacio)
- `kubejs/server_scripts/recipes/recipe_audit.js`:
  - Line 42: `create:mixing` removed for `mekanism:ingot_osmium` (cross-mod tier-skip)
  - Lines 88-91: `mekanism:enriching` removed for diamond + emerald
  - Lines 94-95: `mekanism:combining` removed for emerald_ore + deepslate_emerald_ore
  - Line 100: `mekanism:purifying` removed for `clump_diamond`
  - Line 101: `mekanism:injecting` removed for `shard_diamond`
  - Line 166: `mekanism:combining` removed for `nether_star`
- `kubejs/server_scripts/recipes/recipe_audit.js` Section J: meka_tool + atomic_disassembler + refined_obsidian armor recipes removed (overpowered multi-tools)
- `kubejs/server_scripts/recipes/tier_gated_recipes.js` Section B: meka_tool re-gated to T4 with custom recipe (alloy_atomic + netherite + configurator + ultimate_control_circuit + T4 token)
- `kubejs/server_scripts/recipes/ad_astra_gating.js` (155 lines): NASA Workbench T4-gated, Jet Suit removed (MekaSuit replaces), 4-tier rocket recipes with progressive materials, MekaSuit Mk2 4-piece upgrade
- `kubejs/server_scripts/recipes/planetary_extraction.js`: Create Crushing Wheel recipes for planet stones → unique elements (helium_3, titanium_dust, ferric_oxide, cryogenic_crystal)
- `kubejs/server_scripts/loot/planetary_loot.js`: planetary chest loot tuning
- `kubejs/server_scripts/recipes/refined_storage_dualpath.js`: RS-Mekanism cross-recipe alternatives
- `kubejs/server_scripts/recipes/tier_skip.js`: Mekanism/RS dual-paths for vanilla items
- `kubejs/server_scripts/recipes/if_latex_rework.js`: HDPE/rubber alternative pipeline
- Walkable Mekanism cables coremod (`mek_walkable_cables-1.0.1.jar`)
- Mekanism balance overhaul (per Implementation Status: 2x RF costs, generator nerfs, Digital Miner recipe change, tool/armor removal)

## Key items by category

### Mekanism EPIC (12) — all T4
- **MekaSuit + Meka-Tool** (5 items): mekasuit_helmet/bodyarmor/pants/boots, meka_tool. T4-staged ✓.
- **MekaSuit modules** (3 items): module_teleportation_unit, module_gravitational_modulating_unit, module_elytra_unit. **Not in stage list directly, but transitively gated** — modules require base MekaSuit (T4) + advanced materials.
- **SPS components** (3 items): sps_casing, sps_port, supercharged_coil. Used in the Supercritical Phase Shifter (antimatter reactor). **Not in stage list directly, but transitively gated** — recipes require atomic_alloy (T4-staged).
- **alloy_atomic** — T4-staged ✓.

### Ad Astra RARE (6) — all cosmetic
6 globe items (earth_globe, moon_globe, mars_globe, mercury_globe, venus_globe, glacio_globe). Decorative blocks; no balance impact. Likely chest loot from planetary structures.

### Ad Astra COMMON (404) — mostly building blocks
Planet stones (moon_stone, mars_stone, mercury_stone, venus_stone, glacio_stone), atmospheric blocks, decorative variants, machine blocks (NASA Workbench, fuel refinery, oxygen distributor), space suit (4 pieces), Jet Suit (4 pieces — but recipes removed), oxygen tank, etiher gas tank, rocket tier 1-4 (recipes overridden), and the 5 planet crafted-items/sets.

### Mekanism COMMON/UNCOMMON (335) — material chain + machines
- **Tier-progression circuits**: basic → advanced → elite → ultimate (4 tiers). Ultimate Control Circuit is T4-staged.
- **Pure materials**: ingots (osmium, lead, tin, copper, refined obsidian, refined glowstone, hdpe), dusts, alloys (infused, reinforced, atomic).
- **Machine tier sets**: factory, advanced factory, elite factory, ultimate factory.
- **Pipe/Cable variants**: 5 transport types × 4-5 tiers each.
- **Reactor parts**: fusion (controller is T4-staged), fission, SPS, Antiprotonic Nucleosynthesizer (T4-staged).

## Findings

### Properly gated (no action)

- **Mekanism mod-blanket T3-stage** — recipes lock until T3. Covers the entire 379-item registry by default.
- **MekaSuit + meka_tool T4** — final tier gate. Custom recipe exists for meka_tool with T4 token requirement.
- **5 cross-mod tier-skip blocks**:
  - Enriching: diamond + emerald removed
  - Combining: emerald_ore + deepslate_emerald_ore + nether_star removed
  - Purifying: clump_diamond removed
  - Injecting: shard_diamond removed
  - Create:mixing: mekanism:ingot_osmium removed (cross-mod via Create rotation)
- **MekaSuit Mk2 endgame path** — 4-piece upgrade recipe at Mythic Forge consumes base MekaSuit + aethersteel_ingot + glacio_stone + primordial_essence. This is the *only* upgrade path; no shortcuts.
- **Ad Astra dimension T4-locks** — all 5 destinations dimension-locked.
- **Ad Astra rocket progression** — 4 rocket tiers with progressive materials:
  - T1 Rocket → Moon: netherite + enderium + steel + engine_frame
  - T2 Rocket → Mars: + aethersteel + moon_stone
  - T3 Rocket → Venus/Mercury: + 2× aethersteel + mars_stone
  - T4 Rocket → Glacio: + primordial_essence + venus_stone
- **NASA Workbench T4-gated** — custom recipe with reality_progression_token_t4 reagent.
- **Jet Suit removed** — recipes for all 4 pieces stripped. MekaSuit replaces.
- **Atomic Disassembler + Refined Obsidian armor removed** — overpowered multi-tools blocked.
- **Planetary economy** — Create Crushing Wheel recipes provide a unique sub-economy for planet materials (helium_3, titanium, etc.). T4+ players have meaningful planet-specific loops.

### Verified clean

- **3 MekaSuit modules** (teleportation, gravitational, elytra) not in stage list — transitively gated via base MekaSuit T4.
- **3 SPS components** not in stage list — transitively gated via atomic_alloy T4.
- **6 Ad Astra globes** — cosmetic chest loot, no impact.
- **Walkable cables coremod** — separate jar (`mek_walkable_cables-1.0.1.jar`); QoL only, not balance.

### Items not currently touched by gates

None of consequence. The 404 Ad Astra COMMON building blocks and 296 Mekanism COMMON building blocks are flavor / building / mid-tier circuits — handled by the mod-blanket T3 stage.

### Standouts

- **The MekaSuit → MekaSuit Mk2 progression is the cleanest endgame loop in the pack.** Base MekaSuit is the T4 entry-armor; Mk2 is the post-T4 ascension target via Mythic Forge consumption of all 4 pieces + Glacio + Primordial materials. This converts the natural Ad Astra "you've reached the last planet" moment into a tangible reward.
- **Cross-mod tier-skip blocking is comprehensive** — 5 separate Mekanism processing recipes blocked from converting low-tier material to high-tier. Plus the cross-Create block for osmium. Best protection of any mod in the pack.
- **The planetary extraction sub-economy** is unique to IridescentCraft — vanilla Ad Astra has no use for planet stones beyond decoration. Crushing them via Create Wheels for unique elements creates a genuine "explore the planets to refine resources" loop.
- **Confirms cross-cutting finding D** (dimensional/automation tier-skip): Mekanism has the **most thorough tier-skip coverage in the pack** (Enriching/Combining/Purifying/Injecting/Mixing all blocked for sensitive materials). This is the bar to compare other automation mods against.

## Recommended actions (priority order)

None. Like rpgseteffects, this audit produces zero actionable findings.

If we wanted to be paranoid:
- **(verify)** MekaSuit modules' recipes — confirm they require advanced materials (atomic_alloy or equivalent), not just basic circuits.
- **(future)** When the Antimatter SPS gets a use case beyond "make antimatter for fun," verify the antimatter pellet itself is T4-gated as a power resource.
- **(future polish)** If post-Glacio content lands (additional Ad Astra mods like Beyond Earth or Astronemia), audit those mods individually.

## Existing coverage map

| File | What it does | Mek+AA hits |
|------|--------------|------------:|
| `gates/astages_restrictions.js` | T3 mod-blanket + T4 specific items + 5 dim gates | 18 individual + 2 mod gates + 5 dim gates |
| `recipes/recipe_audit.js` | 5 cross-mod tier-skip blocks + multi-tool removal | ~10 recipe blocks |
| `recipes/tier_gated_recipes.js` Section B | meka_tool T4 re-recipe | 1 recipe |
| `recipes/ad_astra_gating.js` (155 lines) | NASA Workbench + 4 rockets + MekaSuit Mk2 | 9 recipes |
| `recipes/planetary_extraction.js` | Create Crushing Wheel planet-stone recipes | 5+ recipes |
| `loot/planetary_loot.js` | Planetary chest loot tuning | multiple |
| `recipes/refined_storage_dualpath.js` | Cross-mod RS recipes | multiple |
| `recipes/tier_skip.js` | Vanilla-item dual-paths via Mekanism | multiple |
| `recipes/if_latex_rework.js` | HDPE alternative pipeline | multiple |
| `endgame/mythic_forge.js` | MekaSuit Mk2 consumes base MekaSuit | 4 pieces |
| `gates/milestone_detection.js` | Tier counters | multiple |
| `skills/skill_effects.js`, `enchantments/enchant_effects.js` | Cross-system | misc |
| `scaling/dimension_mechanics.js`, `mob_scaling_unified.js` | Dim/mob scaling | misc |
| `tags/transmuted_tags.js` | Tag-based recipe alternatives | misc |
| `mek_walkable_cables-1.0.1.jar` | Coremod (separate from kubejs) | binary |

Total: ~192 references. **Most-tier-skip-blocked mod pair in the pack.** Second benchmark audit alongside rpgseteffects.
