# IridescentCraft Config Review — Resolved Decisions
## March 15, 2026 — For Claude Code Implementation

All REVIEW/CHECK items from the Master Design Document "Review Required" section, resolved with concrete actions.

---

## Enchanting & Repair Economy

### Easy Anvils — CONFIGURE
Keep "too expensive" removal (Apotheosis needs high-level enchant combining). Do NOT reduce base repair costs below default. The death penalty relies on repair costs being meaningful. Check `easymagic-common.toml` for repair cost multipliers — keep at 1.0 or higher.

### Easy Magic — KEEP AS-IS
Fine. Doesn't undermine Apotheosis enchanting balance.

### Disenchanting — GATE TO TIER 2+
Gate the Disenchanting Table recipe behind Steel or T2 materials. Free enchant extraction at T1 trivializes early enchanting progression.

### Enchantment Transfer — GATE TO TIER 2+
Same reasoning as Disenchanting. Gate recipe behind T2 materials.

### Merge Enchantments — KEEP AS-IS
Fine. QoL for anvil work, doesn't bypass anything.

### Enchantment Level Cap Indicator — KEEP AS-IS
Good QoL for Apotheosis above-vanilla levels.

### Tax Free Levels — KEEP AS-IS
The flat level cost curve is actually correct for the design. It makes the death penalty (lose levels) and respec cost (30 levels) feel consistent rather than exponentially punishing at higher levels. The XP economy balance comes from having enough sinks (JustLevelingFork, Pufferfish Skills, reforging, respec), not from making levels expensive.

### Table of Experience — GATE TO TIER 2
Gate the block recipe behind T2 materials. Free XP banking from T1 undermines early-game XP scarcity.

### DarkOrb - Orb of Origin — INVESTIGATE AND GATE
Check what layers DarkOrb's Orb of Origin actually resets in a 3-layer Origins setup. If it resets the Origins++ species layer only (not Race or Class), gate the recipe to T2+ materials (Steel + boss drop). If it also resets Race (which is designed as permanent), either remove the mod or configure it to only affect the Origins++ layer. Class respec is already handled by the Class Altar — DarkOrb is not needed for that.

---

## Combat & Difficulty

### Azukaar's Fair Difficulty Overhaul — DISABLE STAT SCALING, KEEP BEHAVIOR
Remove all stat scaling from Azukaar's config. Keep only AI/behavior improvements. Double-stacking stat multipliers with ScalingMobs would make T4 mobs hit 2x harder than designed. If Azukaar's doesn't allow disabling stat scaling separately from behavior, remove the mod entirely — ScalingMobs + Champions + Improved Mobs already cover combat feel.

### Armor Damage Limit — KEEP AS-IS (GOOD INTERACTION)
This is a positive interaction with the death penalty design. Armor Damage Limit caps durability loss during combat (slow drain). The death penalty applies durability loss on death (big hit). Result: combat wears gear slowly, death wears gear meaningfully. This makes Soulbound valuable specifically for death protection, not combat wear. Lean into this distinction.

### KeepDurable1.20.1 — KEEP, VERIFY IN-GAME
This mod likely implements the "items go inert at 0 durability" behavior from the design doc. Verify in-game that items at 0 durability become unusable (no damage, no armor, no mining) rather than just not breaking. If it handles the inert state natively, the KubeJS death_penalty.js can be simplified — custom "broken" NBT tagging may be redundant with this mod's functionality.

### Cut Through — KEEP AS-IS
Fine. Good melee QoL, synergizes with Berserker/Crowd Control builds.

### Footwork — TEST IN-GAME
Check for conflict with Better Combat. Both modify combat movement. If they fight over dodge/dash mechanics or keybinds, disable Footwork (Better Combat is more central to the design). Also check if Create: Estrogen adds movement abilities that conflict — three movement mods is one too many.

### Too Fast — ESSENTIAL, KEEP
With class speed bonuses, Agility skill nodes, and high movement speed builds, vanilla's speed check will kick players constantly. This mod prevents that. Non-negotiable keep.

### Multiplayer Bosses + Progressive Bosses + Boss Ultimatum — ASSIGN DISTINCT ROLES
Three mods modifying boss encounters will compound unpredictably. Assign each a distinct responsibility:

**Progressive Bosses** = per-kill stat scaling (the arms race). This is the designed system. Handles HP/damage/speed increases per kill count.

**Multiplayer Bosses** = HP scaling per player in range. Keep, but verify the formula. CHECK: does it multiply ON TOP of Progressive Bosses HP, or stack additively? If multiplicative, a 10th-kill Ender Dragon with 4 players could be 2000 × 2.0 × 4.0 = 16,000 HP. If so, reduce Progressive Bosses multipliers when Multiplayer Bosses is also active.

**Boss Ultimatum** = mechanics only. If it adds new attacks/phases, that's unique value. If it also scales stats, disable the stat scaling and keep only mechanic additions. If it can't be configured to separate mechanics from stats, remove it — Progressive Bosses already adds new attack patterns at kill thresholds.

### No Hostiles Around Campfire — KEEP, CONSIDER PER-DIMENSION
Fine for T1-T2. Ideally disable in Nether/Undergarden/Deeper Darker where constant threat is the design intent. Check if the mod has per-dimension config. If not, leave it on everywhere — a small safe zone isn't a game-breaker and rewards players who plan camp placement.

### Cataclysmic Combat — KEEP AS-IS
Fine. Complements Better Combat.

### Cataclysm Apotheosis Addon — VERIFY AFFIX TIERS
Ensure Cataclysm gear drops with affixes matching T3-T4 rarity tiers. If the addon doesn't respect Apotheosis dimension-based rarity settings and slaps Mythic affixes on T3 drops, configure the addon's affix pool or use LootJS to strip/reroll inappropriate affixes.

### Meet Your Fight — VERIFY TIER PLACEMENT
MYF bosses spawn in Overworld structures by default. Configure their spawn dimensions or structure placement to match the tier system. A MYF boss appearing in a T1 Overworld dungeon at T3 difficulty is confusing. Check what structures MYF generates, assign them tiers, and verify loot doesn't bypass tier gating via LootJS.

### Ender Dragon Fight Remastered — VERIFY T4 DIFFICULTY
The End is T4 (not T3 — the doc had an error). Ensure the remastered fight difficulty matches T4 expectations (1000+ HP base, enhanced AI). Also check that More Dragon Eggs doesn't let players farm dragon eggs for T4 recipes — if eggs are used in recipes, multiple eggs could be an exploit.

### More Dragon Eggs — REVIEW RECIPE USAGE
Fine for multiplayer fairness (multiple players get eggs). Check if dragon eggs are used in any tier-gated recipes. If so, multiple eggs could be an unintended exploit path.

### Configurable Extra Mob Drops — AUDIT CONFIG
Check whatever drops are configured. If custom drops include tier-gated materials (diamonds, netherite scraps, etc.), those bypass material progression. Audit the config file and remove any tier-breaking drops.

### Mahou Tsukai + Mahou Tsukai Combat — KEEP, VERIFY DURING PLAYTESTING
T4 magic. Concern about trivializing earlier magic systems is probably unfounded in practice — Mahou Tsukai is gated behind T4 materials and dimensions. By the time players access it, they've already used Iron's Spells and Ars Nouveau. Strong T4 magic fits the "players become absurdly powerful" design pillar. Just verify the numbers don't make T4 combat trivial during playtesting.

---

## Food & Hunger

### Hunger Overhaul + Spice of Life: Carrot Edition — CONFIGURE TOGETHER
These are complementary as designed. Hunger Overhaul makes food less effective, Spice of Life rewards variety. Players who engage with cooking are meaningfully stronger. Keep both, test the specific numbers together.

### Sleep Hunger — KEEP AS-IS
Fine. Minor realism, doesn't conflict with food systems.

### Absolutely Stuffed — KEEP AS-IS (INTENTIONAL COUNTERBALANCE)
Design intent: players will burn through stamina heavily and need large quantities of cooked food. Absolutely Stuffed is a moderate counterbalance to that drain. The overall food design goal is that raw/uncooked ingredients should be close to useless, while fully cooked meals provide meaningful advantage. Absolutely Stuffed supports this by making investment in cooking pay off with longer saturation, without removing the pressure to cook in the first place.

---

## XP Economy

### XP from Crops — KEEP AS-IS
Fine. Diversifies XP sources beyond combat. Helps Artificer builds that farm more than fight. Non-combat specialties need to be somewhat overtuned to be appealing — if farming XP is weak, nobody takes the Artificer path.

### Experienced Crops — KEEP, TUNE IF NEEDED
Keep both farming XP mods for now. The design intent is that non-combat play paths (farming, crafting, building) should be viable alternatives to combat for XP generation. If playtesting reveals farming is so dominant that combat XP feels pointless, tune one down. But start with both active — it's easier to nerf than to buff.

### Table of Experience — GATE TO TIER 2
As noted above.

---

## Gear & Items

### Bigger Stacks — KEEP AS-IS
If a player has 256 netherite ingots, they're not thinking about repair costs regardless of stack size. The economic impact is theoretical, not practical. Keep for QoL.

### Armor Unlocked — KEEP AS-IS
Fine. Enables creative builds.

### Treasure Reforging — VERIFY TIER GATING
Confirm in-game that the tier-gated recipes work: Salvaging Table T1 (ungated), Simple Reforging T2 (steel), Reforging Table T3 (diamond + token), Augmenting Table T4 (netherite + token). Recipes are in `tier_gated_recipes.js`.

### Furnace Recycle — KEEP AS-IS
Fine. Helps with gear economy. Unwanted affix gear can be recycled rather than trashed.

### Truly Modular Suite — KEEP IN FULL
Keep all Truly Modular modules (Archery, Armory, Arsenal, Create Compat). Players choose between Tetra and Truly Modular based on preference — the two systems are effectively mutually exclusive since a weapon can only have one set of upgrades. This gives players meaningful choice in their crafting path. Gate Truly Modular materials behind tier-appropriate dimensions the same way other gear is gated.

### Relics — REVIEW ACQUISITION GATING
Relics can be very powerful. Ensure acquisition is gated behind appropriate tiers via loot tables (LootJS). The XP investment to level Relics acts as a natural soft-gate, but the initial drop location matters. Powerful relics should not appear in T1 structure loot.

### More Artifacts + Celestial Artifacts — REVIEW ACQUISITION GATING
Combined with base Artifacts mod, this is a large pool of equippable items. Design doc says "equipping is NEVER gated" for curios, but acquisition should be tier-gated via loot tables. Check: do any of these mods have craftable artifacts with T1-material recipes? If so, gate those recipes behind appropriate tier materials.

### Simply Swords — KEEP AS-IS
Fine. Strongest swords are already boss-drop gated via LootJS. Standard craftable types use tier-appropriate materials.

---

## Dimensions & Worldgen

### Difficult Caves — KEEP, VERIFY NUMBERS
Caves SHOULD be harder than surface in the Overworld. If Difficult Caves stacks with ScalingMobs, Overworld caves might feel like 1.3-1.5x difficulty — that's good design. It teaches players that underground is dangerous before they enter any dimension. Verify the numbers don't make caves harder than Twilight Forest (that would be confusing for the progression signal).

### Serene Seasons — KEEP, DOCUMENT IN CODEX
Seasons affect crop growth. Winter kills crops. This is a feature, not a bug — it makes greenhouses (Thermal Phytogenic Insolator) valuable and creates seasonal urgency around farming. Pairs with Spice of Life beautifully. Add a Codex entry explaining seasonal farming so players aren't confused when crops die in winter.

### The Abyss: The Other Side — ASSIGN TIER 3
This is a separate mod adding its own dimension. Assign T3 (3.5x difficulty, same as Deeper and Darker). Does NOT conflict with the Oblivion's Rift endgame design (that uses RFTools Dimensions). Add it to the dimension table, death penalty table (18% durability loss), and LootJS tier system.

### Twilight Aether — VERIFY T2 CONTENT ONLY
Bridges T2 Twilight Forest and T2 Aether. Both are T2, so bridge content should also be T2. Check that Twilight Aether doesn't add any T3+ materials or structures that let T2 players skip ahead.

### Aethersteel — T4 ENDGAME MATERIAL
Decision from this session: Aethersteel is T4, NOT T2. Move worldgen from Overworld to Deep Aether. Aethersteel sits at the top of the mining progression chain (minable only by Netherite pickaxe). The doc's concern about fitting "within Tier 2 power level" is based on an incorrect assumption that it's Aether-tier content.

### Deimos — LIBRARY MOD, NO ACTION
Deimos is a library dependency. It doesn't add gameplay content. No review needed.

---

## Flight

### Icarus — GATE WINGS TO TIER 3-4
If Icarus wings are craftable with T1 materials and grant free flight, that trivializes vertical dimensions (Aether, Blue Skies, Deep Aether). Gate Icarus wing recipes to T3+ materials via KubeJS recipe replacement. Iron Jetpacks already cover early flight at T1 with fuel costs and tier-appropriate speed limits. Icarus wings should be a T3-T4 upgrade (permanent flight, no fuel, faster).

### Iron Jetpacks — VERIFY ASTAGES ENFORCEMENT
Already designed as tiered by materials. Verify AStages enforcement prevents players from using higher-tier jetpacks before their tier unlock. Progression: Iron (T1) → Steel (T2) → Diamond (T3) → Netherite (T4).

---

## Additional Notes

### Tetra Integration (New — From This Session)
Tetra is being added back to the pack as an alternative tool/weapon system alongside Truly Modular. This is a significant undertaking: all modded metals (Bronze, Steel, Manasteel, Signalum, Lumium, Diamond, Enderium, Netherite, Aethersteel) need Tetra material definitions with appropriate harvest levels, mining speeds, durability, and damage values. This requires a custom datapack or potentially a .jar mod for Tetra material registration. This is a future-session task, not an immediate action.

### Terramity Integration (New — From This Session)
Keep bosses, structures, mobs, accessories. Remove guns, enchantments, armor set recipes. Repurpose boss drops as alternative crafting ingredients for existing tier recipes. Full details in the Session Handoff Document.

---

*Compiled March 15, 2026. All decisions are final unless modified by playtesting results.*
