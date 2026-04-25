<!-- INTERNAL ONLY -->
# IridescentCraft Game Mechanics

Implementation deep-dive. This is **not** the design doc — `wiki/design/master.md` captures *intent*. This captures *reality*: which scripts fire in what order, which attributes scale what, where multipliers compound, the math the game actually runs at runtime.

Use this when:
- Balancing — checking whether a tuning change actually moves the dial you think it does
- Debugging — chasing why a number on screen doesn't match the design doc
- Onboarding — a future Claude session that hasn't seen the codebase needs to know which side of a multiplier chain to edit

Marked **INTERNAL ONLY** because it names file paths, KubeJS function names, Forge event hook order, and SRG-style internals. A trimmed player-facing version lives separately if/when we author one.

## Per-section format

Every section follows the same template so a reader can skim:

1. **Design intent** — one paragraph, what the player should experience
2. **Implementation chain** — the scripts / classes / events involved, in firing order
3. **Math** — actual formulas with defaults
4. **Stacking behavior** — additive vs multiplicative; what compounds with what
5. **Edge cases / gotchas** — known weirdness
6. **Where to change it** — file:line pointers for the typical tuning knob

---

## Damage Systems

### Spell Damage (Ars Nouveau + Iron's Spellbooks)

#### Design intent
A magic class casting a spell should hit harder than a non-magic class casting the same spell. Class identity, character skills, and class-passive perks each contribute. The basic Ars Nouveau Pain (Harm) glyph cast by an unbuffed non-magic player should land at Ars-stock damage; an Archmage with full skill investment should land noticeably above stock.

#### Implementation chain

The damage moves through five layers, in order. Layers 1–3 happen *inside the source mod* before any Forge event fires. Layers 4–5 happen on the Forge `LivingHurtEvent`.

| # | Layer | Where | Mechanism |
|---|---|---|---|
| 1 | Native Ars perk | `class_passives.js:228` (Archmage / Battlemage / Void Summoner) | `player.modifyAttribute('ars_nouveau:ars_nouveau.perk.spell_damage', ...)` — this is Ars's own scaling attribute, applied inside `EffectHarm.onResolve()` before the `entity.hurt()` call |
| 2 | Native Ars perk (skills) | `skills/skill_effects.js:506`, `justleveling_skills.js:172` | Same `ars_nouveau.perk.spell_damage` attribute, additive with #1 |
| 3 | ISS spell power (mirrored, not Ars-active) | `enchantments/enchant_effects.js:495`, `class_passives.js:226`, `skill_effects.js:461`, `skill_effects.js:508`, `justleveling_skills.js:170/175` | `irons_spellbooks:spell_power` — **does not affect Ars** because Ars only reads its own perk attribute. Mirrored to keep the player's "spell power" stat consistent across both spellcasting mods |
| 4 | LivingHurtEvent fires | Forge core | `event.damage` already incorporates layers 1+2 |
| 5 | icraft synthetic `spell_power` multiplier | `attribute_sync.js:155` | Reads the synthetic `spell_power` attribute (icraft's own, not the mod-native ones) and multiplies `event.damage` IF `source.type` contains `magic` or `indirect`. Pain casts as `DamageSource.magic` so this fires |

#### Math

Let:
- `B` = Ars stock base damage for the glyph (Pain default ~6 HP at level 1)
- `A` = `ars_nouveau:ars_nouveau.perk.spell_damage` value (additive, from layers 1+2)
- `S` = synthetic `spell_power` attribute value (multiplicative, from class baselines)

Final damage applied:

```
final_damage = B * (1 + A) * S
```

**Class baselines** (from `class_attribute_bonuses.js`):

| Class | A from class passive | S from class baseline | Compound multiplier on Pain |
|---|---:|---:|---:|
| Non-magic class | 0 | 1.0 | 1.0× (Ars stock) |
| Battlemage | +0.15 (passive) | 1.15 | 1.15 × 1.15 = **1.3225×** |
| Void Summoner | +0.10 (passive) | 1.10 | 1.10 × 1.10 = **1.21×** |
| Archmage | +0.25 (passive) | 1.25 | 1.25 × 1.25 = **1.5625×** |

Skills (e.g. JustLeveling Magic 30 "Spell Attunement +25%") add to `A` additively. So an Archmage at MAG-30 = `1 + 0.25 + 0.25 = 1.5` for `(1+A)`, times `S = 1.25` = **1.875× Pain**.

#### Stacking behavior

- Layer-1+2 effects on `A` are **additive** with each other (Ars's own perk attribute uses `multiply_base` operations that all sum into the perk's effective value).
- Layer-5 (`S`) is **multiplicative** with the rest.
- This is **intentional** per the design comment in `attribute_sync.js:151–152`: icraft `spell_power` is a separate post-event multiplier on top of mod-native scaling.

#### Edge cases / gotchas

- **Pain via tipped arrow / projectile**: if cast via something that delivers as `INDIRECT_MAGIC` source type, layer-5 still applies (the `includes('indirect')` check covers it).
- **Pain delivered by an Ars Spell Bow projectile**: same — the spell carries the source type forward.
- **`puffish_attributes:magic_damage`** modifications (`class_passives.js:224`) — Ars **does not read** this attribute natively. The icraft synthetic `spell_power` is computed in `attribute_sync.js:62-95` and may pull from puffish; check `getAttr` resolution order if changing.
- **Magic Resistance** — applied symmetrically in `attribute_sync.js:100-107` when the *defender* is a player and source type is magic. Multiplies down: `event.damage *= (1 - magic_resistance)`. Mob magic resistance is not currently checked here; if it should, that's a TODO.
- **Damage source type strings vary by Minecraft version**. In 1.20.1 vanilla magic damage is `magic`, indirect (e.g. potions) is `indirect_magic`. Mods sometimes register custom types — double-check `String(source.type)` against the actual log if a spell is missing the multiplier.

#### Where to change it

| Knob | File:Line | What it does |
|---|---|---|
| Class baseline `S` (synthetic `spell_power`) | `attributes/class_attribute_bonuses.js:13,29,33,62` | Per-class multiplicative base |
| Class native Ars `A` (per-class passive) | `origins/class_passives.js:224-228` | Per-class additive perk |
| Skill native Ars `A` | `skills/skill_effects.js:506`, `justleveling_skills.js:172`, `enchantments/enchant_effects.js:495` | Skill / enchant additive perks |
| Final-event multiplier (synthetic) | `attributes/attribute_sync.js:153-156` | The post-event multiplicative apply |
| Magic-source detection | `attributes/attribute_sync.js:154` | What source types qualify as "magic" for the multiplier |

#### Single-source alternative (parked)

If the multiplicative compounding is unwanted, the cleaner architecture is:
1. Make icraft's synthetic `spell_power` write-through to both `ars_nouveau:ars_nouveau.perk.spell_damage` and `irons_spellbooks:spell_power` whenever it changes (so they reflect the same value).
2. Remove the layer-5 multiplier in `attribute_sync.js:153-156`.
3. Net: a player's "spell power" stat moves both mods' scaling together, no double-multiply.

This is the cleaner long-term design but a behavior change for current testers — flag before flipping.

---

## TODO sections (stubs to fill in next sessions)

The sections below are placeholders. Format follows the spell-damage template above. Fill in as the question comes up — don't try to author all in one pass.

### Melee damage stacking
Crit chance, crit damage, weapon affixes (Apotheosis), armor penetration, lifesteal, class baselines, Better Combat hit-window. Where: `attribute_sync.js:111-167`, `affixes/affix_effects.js`.

### Mob damage scaling
ScalingMobs daily growth (`scaling_mobs/main.toml`), MajruszsDifficulty stage scaling, Improved Mobs difficulty curve, Champions tier multipliers, Apotheosis boss attribute roll, dimension multiplier (`scaling/dimension_mechanics.js`).

### Mob health scaling
Same source-of-truth list as damage, but with health-specific multipliers. Reconcile against the ScalingMobs `Health Scale Rate` cap.

### Loot rate stacking (chest)
LootJS structure modifiers + Apotheosis affix_loot GLM (currently disabled) + per-tier dimension rules + Lootr per-player rolls + tester custom strips. Order matters because LootJS's pre-apply runs before the Forge LootModifier registry.

### Loot rate stacking (entity)
LivingDropsEvent subscriber order (full audit landed 2026-04-24, see `wiki/known-issues/tracker.md`). Map each subscriber's effect to whether it adds, removes, or scales. Specifically: Apotheosis dropsHigh (gem at 4.5%), alexsmobs (vine_lasso for tagged), Improved Mobs equipment drops, Sophisticated Backpacks (now disabled). Where: `kubejs/server_scripts/loot/diagnose_mob_drops.js` is the live observability handle.

### Item durability protection
INERT_THRESHOLD computation, when fast-path vs full-sweep fires, what triggers the broken tag, what removes it, what events the broken state suppresses (BlockEvents.broken cancel, EntityEvents.hurt damage=1, ItemEvents.rightClicked cancel). Where: `death_penalty.js:185-340`.

### Mana / Source pools
Iron's Spellbooks mana (numeric, regen rate, base cap from origin/class), Ars Source (Source Jar tiers, regen, base cap). How does class identity scale them?

### XP gain
Vanilla XP base, class XP multipliers, JustLeveling skill bonus (Enlightenment +50%), `xp_multiplier` attribute (tick-diff handler in `attribute_sync.js`), `Harvesting` affix bonus, dimension multipliers (`dimension_mechanics.js`).

### Death penalty
Per-dimension durability loss %, Soulbound enchant reduction (1/2/3/full), Shulk origin reduction, target-damage clamp, `icraft_broken` tag write, repair detection (`PlayerEvents.inventoryChanged` repair handler).

### Spawn protection
Radius (currently 32), what events cancel (block break/place, hostile spawn), throttled tell-message cadence, dimension scope (overworld only).

### Sunlight smite
Tag-based undead detection (`#minecraft:undead` + `#forge:undead`), canSeeSky gating, magic damage source (bypasses fire resistance + armor), tick rate (10 ticks). Where: `kubejs/server_scripts/sunlight_smite.js`.

### Mob block breaking
Improved Mobs config (currently disabled), Mutant Monsters EntityMobGriefingEvent DENY, vanilla zombie BreakDoorGoal strip on spawn, Cataclysm boss-arena `ignore_mobgriefing = true` carveout. Where: `improvedmobs-common.toml`, `mutant_monsters_no_grief.js`, `disable_zombie_door_break.js`, `cataclysm-common.toml`.

---

## How to extend this doc

1. When a question arises that involves "what does the math actually look like" or "in what order do these events fire", create or fill a section here.
2. Follow the 6-part template (Intent / Chain / Math / Stacking / Gotchas / Where).
3. Use file:line references for the actual tuning knobs.
4. Cross-link from the design doc when appropriate (the design doc is the *intent*; this is the *reality*).
5. When implementation drifts from intent, write a **Reconciliation note** at the bottom of the section rather than rewriting silently.
