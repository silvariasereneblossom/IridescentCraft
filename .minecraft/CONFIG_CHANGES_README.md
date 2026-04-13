# Priority 6: Mod Config Changes

## Files Modified (copy to your `config/` folder, replacing originals)

### 1. `scaling_mobs/main.toml` — ScalingMobs
**Changes from original:**
- Damage Scale Rate: 0.5 → **0.15** (reduced — dimensions handle primary scaling)
- Health Scale Rate: 0.1 → **0.05** (gentle background pressure)
- Max Scaled Health: ∞ → **3.0** (cap so T1 mobs never exceed T2 difficulty)
- Max Scaled Damage: ∞ → **2.5** (same principle)
- Speed Scale Rate: 0.005 → **0.001** (speed scaling is frustrating)
- Max Scaled Speed: 1.5 → **1.15** (matches design doc T3-T4 cap)
- Scale with Player Count: true → **false** (disabled — dimension scaling is primary)
- Mobs Stop Burning: day 72 → **day 100** (later, matches endgame timing)
- Mob Drops Scaling: disabled entirely (loot controlled via LootJS)
- **Added boss blacklist** — 36 bosses excluded from time-based scaling
- Player Scale Favor: 10.0 → **0.0** (disabled — AStages handles progression)

### 2. `Dynamic Difficulty Config_Dimensions.toml`
**Changes from original:**
- Health add per dimension: 0.25 → **0.15** (reduced compounding)
- Damage multiply: 0.01 → **0.005** (reduced)
- Armor multiply: 0.01 → **0.005** (reduced)

### 3. `Dynamic Difficulty Config_Time.toml`
**Changes from original:**
- Health add/5min: 0.001 → **0.0005** (halved — ScalingMobs primary)
- Health multiply: 0.001 → **0.0005** (halved)
- Damage multiply: 0.03 → **0.01** (reduced 3x)
- Armor multiply: 0.01 → **0.005** (halved)

### 4. `champions-common.toml`
**Changes from original:**
- Death message tier: 0 → **3** (T3+ champions = mini-boss announcements)
- **Added boss entity blacklist** — 36 bosses excluded from becoming champions
- Other settings unchanged (beacon range 64, spawners enabled, HUD visible)

### 5. `progressivebosses-common.toml`
**Changes from original:**
- Wither charging non-players: false → **true** (more chaotic fights)
- All other settings preserved (dragon fixes, elder guardian adventure mode)

### 6. `Bosses_Scale_With_Player_Count/bosses_scale.json`
**Changes from original:**
- Multiplier: 3.0 → **2.0** (4 players = 2x boss, not 3x)

### 7. `apotheosis/adventure.cfg`
**Major changes:**
- Random Affix Chance: 0.125 → **0.11** (slight reduction)
- Boss Auto-Aggro: false → **true** (anti-cheese)
- Boss Spawn Cooldown: 1800 → **2400** (slightly more time between spawns)
- Spawner Value Chance: 0.4 → **0.2** (valuable chests were too common)
- **Added 7 modded dimensions to Boss Spawn Dimensions** with tier-appropriate rates:
  - T2 (TF/Blue Skies/Aether): 4%
  - T3 (Undergarden/DD/Nether): 6%
  - T4 (Deep Aether): 8%
  - End: 10%
- **Added dimension-specific Affix Convert Rarities** for all modded dims
- **Added dimension-specific Gem Rarities** for all modded dims
- **Added modded dimension patterns to Affix Item Loot Rules**
- Reforging costs increased for Epic/Mythic/Ancient tiers

## Files NOT Modified (copied as-is for completeness)
- `champions-client.toml` — HUD settings, no gameplay impact
- `apotheosis/apotheosis.cfg` — Module toggles, all enabled
- `apotheosis/ench.cfg` — Enchanting config
- `apotheosis/enchantments.cfg` — Individual enchant settings (already customized)
- `apotheosis/garden.cfg`, `names.cfg`, `potion.cfg`, `spawner.cfg`, `village.cfg`

## NOT ADDRESSED (requires separate implementation)
- **Improved Mobs** — NOT in modlist. Design doc says to add it for per-dimension mob AI.
- **Champions affix pools & spawn rates per dimension** — Requires Champions datapack (JSON), not TOML config. Will be a separate deliverable.
- **Custom Apotheosis affixes** — Requires Apotheosis datapack with custom affix definitions. Part V of design doc. Future priority.

## Design Philosophy
The design doc specifies per-dimension stat multipliers (1.0x → 12.0x), but these are the
*native stats of dimension mobs*, not config values. ScalingMobs/Dynamic Difficulty add a
gentle time-based escalation ON TOP of native dimension difficulty. The configs are tuned
so that:
1. **Overworld stays safe for 10+ in-game days** (learning period)
2. **Time scaling never exceeds the next tier's native difficulty** (T1 mobs capped at ~T2 power)
3. **Bosses are excluded from generic scaling** (Progressive Bosses handles boss escalation)
4. **Loot is NOT affected by scaling** (LootJS controls all drops)
