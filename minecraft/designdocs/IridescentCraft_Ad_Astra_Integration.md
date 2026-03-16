# Ad Astra Integration Design
## IridescentCraft — March 15, 2026

---

## Overview

Ad Astra is integrated as **endgame content** — the space frontier that opens after T4 is established. It is NOT a T4 entry point; it is what T4-geared players work toward. The entire mod requires significant RF infrastructure investment, making it the ultimate tech-path payoff.

---

## Tier Placement: Endgame (Post-T4)

Ad Astra content is gated behind T4 completion. Players must have:
- Netherite-tier gear minimum
- Established RF power infrastructure (Mekanism Fusion Reactor or equivalent)
- Access to End/Deep Aether materials for rocket construction
- MekaSuit for space survival (replaces Ad Astra's Jet Suit)

### Planet Difficulty Scaling

| Planet | Difficulty | Comparable To | Notes |
|--------|-----------|---------------|-------|
| Moon | 7.0x | End Outer Islands | Entry point. Low gravity, no oxygen, moderate mobs |
| Mars | 8.0x | End Deep/Cities | Cold, hostile. Mars-specific materials required for Tier 2 rocket |
| Mercury | 9.0x | End Dragon's Domain | Extreme heat. Heatward enchant highly valuable |
| Venus | 10.0x | Dragon's Domain+ | Most hostile inner planet. Acid atmosphere, extreme pressure |
| Glacio | 12.0x | Beyond anything else | Proxima Centauri system. Ultimate endgame destination. Extreme cold, alien mobs |

Glacio is the hardest content in the pack — harder than the End, harder than Oblivion's Rift. It is the "true final frontier."

---

## Gating: Recipe Modifications

### Rocket Workbench
- Remove default recipe
- New recipe: Netherite + Mekanism Steel Casing + reality_progression_token_t4
- This is the gateway item — everything else flows from here

### Tier 1 Rocket (Moon)
- Replace iron/steel components with Netherite + Enderium
- Requires significant material investment even for T4 players
- Fuel: Ad Astra fuel refining system (requires RF-powered machines)

### Tier 2 Rocket (Mars)
- Requires Moon-specific materials (obtained from Moon mining)
- Additional Netherite + Aethersteel components
- Natural progression: must visit Moon before Mars

### Tier 3 Rocket (Venus/Mercury)
- Requires Mars-specific materials
- Additional Aethersteel + endgame alloy components

### Tier 4 Rocket (Glacio)
- Requires materials from all inner planets
- Aethersteel + Primordial Essence (endgame item from Oblivion's Rift)
- This is the most expensive single craft in the pack

### Space Suit Progression
- **Remove:** Ad Astra Jet Suit entirely (recipe removal via KubeJS)
- **Basic Space Suit:** Netherite + Ad Astra materials. Allows Moon/Mars survival
- **Netherite Space Suit:** Ad Astra's existing recipe, gated behind Mars materials. Allows Venus/Mercury survival
- **MekaSuit:** Fills the Jet Suit niche (flight + space survival). Already T4-gated via Mekanism progression
- **MekaSuit Mk2:** New custom item. Crafted from MekaSuit + Aethersteel + Glacio materials. Affixable and enchantable. The ultimate armor in the pack. This is the ONLY space-capable armor that can receive Apotheosis affixes and custom enchantments.

---

## RF Infrastructure Requirements

Ad Astra machines run on RF (Forge Energy), compatible with Mekanism/Thermal power. The design intent is that space exploration requires **major** RF investment — not a few generators, but proper industrial power infrastructure.

### Power Requirements (Configure via Ad Astra config)

| Machine | Purpose | RF Requirement |
|---------|---------|---------------|
| Oxygen Loader | Fills space suits with oxygen | High — requires continuous power |
| Oxygen Distributor | Creates breathable zones on planets | Very High — scales with area |
| Fuel Refinery | Produces rocket fuel | High — processes fluid over time |
| Water Pump | Extracts water for oxygen conversion | Moderate |
| Compressor | Processes planet-specific materials | High |
| Coal Generator | Ad Astra's basic power gen | LOW — intentionally weak |

**Design intent:** Ad Astra's built-in Coal Generator should be intentionally underpowered for the pack's needs. Players should be forced to bring their existing Mekanism/Thermal power infrastructure to space. A Fusion Reactor powering a Moon base feels earned. A Coal Generator powering a Moon base feels cheap.

**Config action:** Increase Ad Astra machine RF costs significantly (2-5x default) so that Ad Astra's own generators can't keep up. Players must invest in proper RF infrastructure (Mekanism generators, Thermal dynamos, or Flux Networks for cross-dimensional power transfer) to sustain a planetary base.

Flux Networks becomes critically valuable here — it's the only way to wirelessly transmit RF across dimensions. A player who invested in Flux Networks during T2-T3 now has a massive advantage for space exploration. This rewards long-term infrastructure planning.

---

## MekaSuit Mk2 Design

### Concept
The ultimate armor set. Combines MekaSuit's tech capabilities with Apotheosis's affix/enchantment system. The first and only power armor that can be enhanced by the magic/affix systems.

### Crafting
- Base: Full MekaSuit set (helmet, chest, legs, boots)
- Upgrade material: Aethersteel Ingot (×4 per piece)
- Glacio-specific material (×2 per piece) — requires reaching Glacio
- Primordial Essence (×1 per piece) — from Oblivion's Rift endgame
- Crafted at: Mythic Forge (endgame crafting station)

### Properties
- All MekaSuit base functionality (flight, protection, modules)
- CAN receive Apotheosis affixes (unlike base MekaSuit)
- CAN receive custom enchantments (Heatward, Voidward, Warp Shield, Vitality, etc.)
- CAN receive affix sockets and gems
- The convergence of tech and magic progression paths — rewards players who engaged with both systems

### Balance Note
MekaSuit Mk2 is the reward for completing essentially everything in the pack: T4 Mekanism (MekaSuit base), Aethersteel (Deep Aether mining), Glacio (Ad Astra endgame planet), Primordial Essence (Oblivion's Rift). It SHOULD be the strongest armor in the game. Players who earn it have beaten the pack.

---

## Planet-Specific Content

### Moon
- **Environment:** No oxygen, low gravity, dark side/light side cycle
- **Materials:** Moon Stone, Moon Sand, moon-specific ores (check Ad Astra defaults)
- **Mobs:** Basic space mobs, moderate difficulty
- **Unique mechanic:** Low gravity affects combat — knockback doubled, fall damage halved, projectiles travel further
- **Structures:** Lunar surface structures with loot
- **Purpose:** Entry-level space content. Source of Tier 2 rocket materials.

### Mars
- **Environment:** No oxygen, extreme cold, thin atmosphere
- **Materials:** Mars-specific ores, ice deposits
- **Mobs:** Mars creatures, cold-themed
- **Unique mechanic:** Cold damage ticks without Frostward/cold protection. Faster hunger drain.
- **Structures:** Martian ruins, underground facilities
- **Purpose:** Mid-space content. Source of Tier 3 rocket materials.

### Mercury
- **Environment:** No oxygen, extreme heat on sun-facing side, extreme cold on dark side
- **Materials:** Heat-resistant ores, mercury-specific metals
- **Mobs:** Heat-themed creatures
- **Unique mechanic:** Day/night cycle is lethal — sun side deals fire damage, dark side deals cold damage. Players must follow the terminator line or have full environmental protection. Heatward enchant essential.
- **Structures:** Solar collection arrays, ancient structures
- **Purpose:** Challenge planet. High-value ores.

### Venus
- **Environment:** No oxygen, crushing pressure, acid atmosphere
- **Materials:** Venus-specific high-value ores
- **Mobs:** Acid-resistant creatures, pressure-adapted
- **Unique mechanic:** Acid rain deals continuous damage. Pressure effect reduces movement speed without proper suit. Most hostile inner planet.
- **Structures:** Floating cloud structures (above acid layer), deep surface bunkers
- **Purpose:** Hardest inner planet. Required materials for Tier 4 rocket.

### Glacio (Proxima Centauri)
- **Environment:** No oxygen, extreme cold, alien biomes
- **Materials:** Glacio-exclusive endgame materials (for MekaSuit Mk2)
- **Mobs:** Alien creatures, highest difficulty in the pack
- **Unique mechanic:** Unknown alien technology — structures contain unique loot not found anywhere else. Possible dimension-specific affixes (like dimensional affixes in the Apotheosis system).
- **Structures:** Alien ruins, crashed ships, technology caches
- **Purpose:** True endgame destination. Source of MekaSuit Mk2 materials. The "final frontier."

---

## Removed/Disabled Content

| Content | Action | Reason |
|---------|--------|--------|
| Jet Suit | Remove recipe | MekaSuit fills this niche |
| Coal Generator (or reduce output) | Configure to be very weak | Forces use of proper RF infrastructure |
| Any overlapping processing machines | Evaluate case-by-case | Avoid redundancy with Thermal/Mekanism |

---

## Patchouli Codex Entries (New Category: "The Stars")

### Category: The Stars
*"Beyond the sky, beyond the End, beyond everything you know — the stars are waiting."*

**Entries needed:**

1. **Getting to Space** — Rocket Workbench, fuel refining, oxygen basics. Emphasize RF requirements.
2. **Space Suits & Survival** — Basic suit, Netherite suit, MekaSuit for space, MekaSuit Mk2 as ultimate goal.
3. **The Moon** — First destination, what to expect, what to bring, what to mine.
4. **Mars** — Cold survival, materials, structures.
5. **Mercury** — Day/night lethality, terminator line strategy.
6. **Venus** — Acid rain, pressure mechanics, floating structures.
7. **Glacio** — The true endgame, alien content, MekaSuit Mk2 materials.
8. **Planetary Bases** — Oxygen distribution, RF infrastructure, Flux Networks for cross-dimensional power.

---

## Integration Checklist

- [ ] Gate Rocket Workbench recipe behind T4 materials
- [ ] Gate all rocket tier recipes appropriately
- [ ] Remove Jet Suit recipe
- [ ] Register MekaSuit Mk2 as custom item (startup_scripts)
- [ ] Add MekaSuit Mk2 crafting recipe (Mythic Forge)
- [ ] Configure Ad Astra machine RF costs (2-5x default)
- [ ] Configure Ad Astra Coal Generator to be underpowered
- [ ] Add planet difficulty scaling to dimension_scaling.js
- [ ] Add planet combat mechanics to dimension_mechanics.js
- [ ] Add planet loot tables to lootjs_overhaul.js
- [ ] Add AStages dimension gates for all 5 planets (require T4 stage)
- [ ] Create 8 Patchouli Codex entries
- [ ] Add death penalty percentages for each planet
- [ ] Configure Aethersteel worldgen to include relevant planets (if applicable)
- [ ] Test Flux Networks cross-dimensional RF to planets
- [ ] Verify Ad Astra RF compatibility with Mekanism/Thermal

### Death Penalty by Planet

| Planet | Durability Loss |
|--------|----------------|
| Moon | 22% |
| Mars | 25% |
| Mercury | 27% |
| Venus | 28% |
| Glacio | 30% |

Glacio has the highest death penalty in the pack — dying there is expensive. Soulbound III is almost mandatory.

---

*All numbers are placeholders subject to playtesting adjustment.*
