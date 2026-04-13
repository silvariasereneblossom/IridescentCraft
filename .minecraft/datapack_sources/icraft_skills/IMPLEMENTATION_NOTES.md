# Pufferfish's Skills — Implementation Notes (v3)

## Immediate Functionality: 58% (111/190 rewards)

### Required Mods (all in pack)
- **Pufferfish's Skills** — Framework (datapack-configured)
- **Pufferfish's Attributes** — melee_damage, melee_resistance, sword_damage, axe_damage, tamed_damage, tamed_resistance
- **Pufferfish's Unofficial Additions** — XP source integrations
- **Apothic Attributes** (Apotheosis) — arrow_damage, draw_speed, mining_speed, healing_received, armor_shred, prot_shred, crit_chance, crit_damage, life_steal
- **Iron's Spellbooks** — spell_power, spell_resist, mana_regen, cast_duration, summon_damage, cooldown_reduction

## Per-Tree Breakdown

| Tree | Attr | Cmd | % Immediate | Notes |
|------|------|-----|-------------|-------|
| Warfare | 31 | 0 | 100% | Fully functional |
| Marksman | 20 | 11 | 65% | Arrow dmg/draw speed work; ammo save/aoe need KubeJS |
| Sorcery | 25 | 7 | 78% | Spell power/mana/resist work; healing power/buff dur need KubeJS |
| Fortitude | 20 | 12 | 63% | HP/toughness/KB/healing work; all_resistance/regen need KubeJS |
| Gathering | 15 | 17 | 47% | Mining speed/luck work; crop yield/fishing need KubeJS |
| Engineering | 0 | 32 | 0% | All command-based (crafting/machine bonuses) |

## KubeJS Bridge Script
`kubejs/server_scripts/skills/skill_effects.js` handles:
- ✅ Execute damage (Kill Shot) — +X% to targets below 30% HP
- ✅ All resistance — Flat % damage reduction  
- ✅ HP regen — Passive healing every 5 seconds
- ✅ Crop yield — Bonus drops on harvest
- 📋 Phase 2b stubs for remaining effects

## Phase 2b (needs mod-specific integration)
- ammo_save, aoe_splash, accuracy → Projectile event hooks
- buff_duration → Potion application hook
- food_efficiency → Food consumption hook
- Engineering effects → Per-mod config changes
- ore_processing → Thermal augment / Mekanism multiplier configs

## Attribute Registry Verification
⚠️ These attribute IDs need in-game `/attribute` command verification:
- `apothic_attributes:armor_shred` (may be `apothic_attributes:armor_shred_chance`)
- `irons_spellbooks:cast_duration` (may be different namespace)
- `irons_spellbooks:summon_damage` (verify exists in ISS 1.20.1)

If an attribute doesn't exist, the node logs a warning but doesn't crash.
The reward simply doesn't apply until the correct ID is used.
