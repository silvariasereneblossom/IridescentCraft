# Boss Bonfire Design — IridescentCraft

> **Purpose.** Design spec for the auto-waystone half of Task #46. Captures trigger semantics, placement rules, and per-boss-type threshold detection. Cross-refs: [`boss-catalog.md`](boss-catalog.md) (which bosses), [`waystones-api-audit.md`](waystones-api-audit.md) (what's possible), [`waystone-rename-blocking-options.md`](waystone-rename-blocking-options.md) (Strategy 5 + 1 for the rename-lock).

---

## 1. Player experience

The model is **FromSoftware bonfires** — not boss-kill memorials. Sequence of player events:

1. Player uses the unified boss compass (task #46 Part A) to find a boss they're tier-ready for. Needle points at the boss arena structure / biome / spawn site.
2. Player traverses to the area, often through hostile terrain or a long structure interior.
3. Player crosses the **arena threshold** — defined as the entry boundary of the boss's combat zone (just outside the door, not inside the arena itself).
4. A waystone with the boss's fixed name ("Naga Court", "Hydra Lair", "Burning Arena") **auto-materializes and activates** at the threshold. Already pre-`setGlobal(true)` per the rename-blocking strategy, so it's globally visible to all players in their teleport list immediately.
5. Player can now teleport back to this threshold from any other waystone, at any time, free for the rest of the playthrough. Re-fighting the boss is one warp away.
6. On boss-arena death, vanilla bed/spawn behavior — Waystones is purely a teleport convenience layer, not a respawn-override. Players walk back via teleport from their respawn waystone (every player ships in a village with a waystone per master.md Part XIV).

### 1.1 Why threshold, not inside arena

Two reasons:
- **No teleport-cheese.** A bonfire inside the arena would let players warp in mid-fight (consumable refresh, pet revival, etc.) without committing. Threshold placement keeps the boss fight as a single contiguous arena experience.
- **Clean re-fight loop.** Player dies → respawns at bed → warps to the boss bonfire → walks through the threshold → arena re-loads → boss fight begins. The threshold is the explicit "fight start" boundary.

### 1.2 Why vanilla bed/spawn (not bonfire-as-respawn)

User-confirmed (2026-05-28): bed-respawn is fine; Waystones provides cheap return-to-bonfire. Avoids hooking Waystones' spawn-override config, keeps mod-coupling minimal, and matches the existing village-bound new-player onboarding (every player ships at a village with a waystone).

---

## 2. Trigger event

The auto-waystone fires on **threshold entry**, not boss-kill. Concrete event sources by boss type:

| Boss type (count from catalog) | Threshold detection mechanism |
|---|---|
| Structure-locked (~47 of 106) | Either (a) `EntityJoinLevelEvent` for the boss entity → place waystone at structure's outermost door piece, or (b) `PlayerTickEvent` proximity check against a worldgen-time marker block placed inside the structure piece's NBT. Prefer (b) — robust against structure-piece variants and player skip-paths. |
| Biome-conditional-random (~12 bosses) | `PlayerTickEvent` proximity check: when player gets within configurable N-block radius of the boss entity (entity must exist in the world, so requires player → biome → boss spawn → player approaches). Waystone placed at the player's position − unit vector toward boss − threshold offset (~12 blocks away from the boss for safety). |
| Summoned-by-item / summoned-by-altar (~15 bosses) | Hook the altar / summon-item activation event directly. Waystone placed at the altar's position (or summon-item use position) BEFORE the boss spawns. Threshold = the altar itself. |
| Dimensional-arrival (~6 bosses) | `PlayerChangedDimensionEvent` for the target dimension. Waystone placed at the player's spawn-in coordinates (or at the dimension's anchor structure, e.g., the Aether portal landing pad). |
| Scripted custom (~26 bosses) | Per-boss KubeJS trigger. Defined inline next to the boss's existing scripted logic. |

### 2.1 Why prefer worldgen-time marker for structure bosses

The `assets/<modid>/structures/<piece>.nbt` files can carry custom NBT tags Forge passes through to a `StructurePieceProcessor` at place-time. We define a marker tag `iridescent:boss_bonfire_threshold` with a `boss_id` value. At worldgen, a KubeJS structure-modifier inspects each placed piece, and if the marker is present, drops a sentinel block at the marker position. Then a single `PlayerTickEvent` listener checks player → sentinel-block proximity globally (~one chunk-radius scan per second), spawns the waystone on first crossing.

Benefits over `EntityJoinLevelEvent`:
- Works even if the player skips the door piece (e.g., obsidian bridges into the arena, dig-in via TNT)
- Doesn't fire if the boss is spawned manually via `/summon` (avoids waystone spam from operator commands)
- Survives boss-respawning structure types (Twilight Lich respawns; bonfire shouldn't re-create)

Tradeoff: requires per-mod structure-piece NBT injection or a parallel KubeJS table mapping `<structure_piece_id>` → `<bonfire_offset>`. Acceptable scope for the ~47 structure-locked bosses; we maintain the table as part of the boss-catalog.

---

## 3. Placement rules

### 3.1 The threshold position

Per boss, the **threshold position** is a specific block coordinate or offset definition. For structure-locked bosses, it's relative to a known structure piece — e.g., "the block one tile outside the Naga Court entrance door". For biome-random bosses, it's computed from the boss entity's position at first-detection. For altar-summoned bosses, it's the altar itself.

The threshold position MUST satisfy:
- **Not inside the combat zone.** Player can't warp in mid-fight.
- **Safe spawn area.** No mob mosh pit at the threshold; player materializes in a stable spot.
- **Accessible without re-fighting boss prerequisites.** If a boss arena has a 5-minute corridor of trash mobs, the threshold is at the END of that corridor (so warp-back skips the corridor), but BEFORE the boss's leash/aggro range.

### 3.2 Catalog of per-boss threshold positions

Authored as a new column / sub-table in `boss-catalog.md`: `Threshold Position`. For each of the ~106 bosses, fill out:
- Coordinate or offset definition (e.g., "Twilight Lich Tower: one tile outside the spiral staircase entry door, at floor level")
- Block fixture name if a sentinel block is being placed (e.g., `iridescent_reforging:naga_threshold_marker`)
- Sentinel-block visibility: hidden (under the floor, invisible to players) vs decorative (visible torch/icon at the threshold)
- Notes / quirks (e.g., "Hydra has 3 arena entrances — choose the SW one as canonical threshold")

This is per-boss authoring work spread across multiple sessions. Best done alongside the compass implementation — each boss's compass-pointing entry needs the same metadata.

### 3.3 Waystone naming convention

Boss waystone names are fixed at creation. Convention (proposed; revisit if it causes Heracles linkage issues):

- Format: `<Boss Display Name> Bonfire` — e.g., "Naga Court Bonfire", "Hydra Lair Bonfire", "Ur-Ghast Tower Bonfire".
- Lang key: `waystone.iridescent.bonfire.<boss_short_name>` for future localization.
- Naming registry: a `kubejs:waystone_id_registry` table mapping `boss_entity_id` → `display_name`. Auto-generated from `boss-catalog.md`'s `Display Name` column with " Bonfire" suffixed.

**Rename block** is via Strategy 5 (`setGlobal(true)`) per `waystone-rename-blocking-options.md`. Survival players cannot rename. Creative-mode operators can override for debugging.

---

## 4. Multi-phase bosses

Per user (2026-05-28): **one bonfire per boss**, placed at the threshold of the **first-phase arena**. Reasoning:
- Hydra (3 phases across the bog): bonfire at the bog approach, before phase-1 aggro.
- Twilight Lich (3 towers): bonfire at the spiral staircase entry (phase 1's location).
- Burning Arena tiered bosses: bonfire at the arena perimeter, no inner phase-segmentation.

Treats the boss as a single discovery moment / single Heracles quest objective. Avoids teleport-list inflation.

---

## 5. Cross-references

### 5.1 To existing design docs

- **`boss-catalog.md`** — boss roster + Discovery Pain scoring. This doc adds a `Threshold Position` column per boss (authored alongside compass implementation).
- **`waystones-api-audit.md`** — confirms `WaystonesAPI.placeWaystone()` + `IMutableWaystone.setName()` + `setGlobal(true)` are the implementation triad.
- **`waystone-rename-blocking-options.md`** — Strategy 5 (`setGlobal(true)` permission gate) + Strategy 1 (KubeJS UID-keyed tick-guard) as the rename-lock combo.
- **`heracles-quest-tree.md`** — boss-quest objectives are pure "defeat" tasks (no "find the boss" prerequisite). Quests benefit from the bonfire's existence as a re-fight enabler, not as a discovery checkpoint.

### 5.2 To existing pack infrastructure

- **`kubejs/server_scripts/recipes/waystone_recipes.js`** (272 lines) — existing waystone-craft gating. Boss bonfires must coexist (no recipe interaction; bonfires are auto-placed, never crafted by player).
- **`kubejs/server_scripts/gates/milestone_detection.js`** — the existing 20-boss tracker. Boss bonfires expand this to ~106. Migration plan: re-key the milestone array on the boss-catalog's full roster, fire bonfire-place events from the same listener.
- **JourneyMap** — `displayWaystonesOnJourneyMap=true` is already set, so all bonfires appear automatically on every player's map post-activation.

---

## 6. Implementation milestones (work breakdown for #46 Part B)

After the boss compass (#46 Part A) ships, Part B work breaks down as:

1. **Structure-piece NBT marker convention.** Define the `iridescent:boss_bonfire_threshold` NBT tag shape. Author a worldgen structure-modifier that places a sentinel marker block when the tag is present. Test on one Twilight structure.
2. **Sentinel marker block.** Custom block (`iridescent_reforging:bonfire_threshold`) — invisible, no collision, no interaction. Lives at the worldgen-placed threshold position.
3. **Threshold-proximity listener.** `PlayerTickEvent` server-side scans player chunks for sentinel markers within proximity. On first crossing per (player, marker) tuple, fires `placeBossWaystoneIfAbsent(player, marker)`.
4. **Per-boss-type trigger registry.** KubeJS table mapping `boss_entity_id` → `trigger_type` (one of: `structure_marker` / `biome_proximity` / `summon_event` / `dim_enter` / `scripted`) and any per-trigger-type config.
5. **`placeBossWaystoneIfAbsent` core function.** Calls `WaystonesAPI.placeWaystone()` + `IMutableWaystone.setName()` + `setGlobal(true)` + `PlayerWaystoneManager.activeWaystoneForEveryone()` per the audit's three-call path. Idempotent: no-op if a waystone with the same boss-id is already placed in the world.
6. **Boss-catalog `Threshold Position` authoring.** Per-boss data fill, ~106 entries. Spread across sessions; can batch by mod (all Twilight first, all Cataclysm second, etc.).
7. **Test matrix.** Verify trigger fires correctly for at least one boss of each trigger type. Verify rename-blocking via Strategy 5 holds for placed waystones. Verify JourneyMap visibility.

Order of authoring: 1 → 2 → 3 → 5 → 4 (with one boss as seed) → 7 (with one boss) → 6 (expand to full catalog) → 7 (full coverage).

---

## 7. Resolved design calls

Locked 2026-05-28 via operator review:

- **Sentinel marker visibility — INVISIBLE / functional-only.** No decorative torch or particle fixture. The sentinel block placed at worldgen is invisible (no model, no particles, no collision). Acknowledgment of "bonfire lit" comes from a **chat message** to the activating player + the global broadcast (see broadcast item below), not from in-world visuals. Implementation simplification: no per-mod fixture-placement logic, no aesthetic conflicts with structure interiors.
- **Compass needle after bonfire ignites — KEEP pointing at boss.** The compass stays as a combat-zone pointer. Waystone is the return mechanism; compass is the re-target / re-fight mechanism. After ignition, both work independently.
- **Cross-pack waystone naming — `[Boss]` prefix.** All boss bonfire display names start with `[Boss] ` literal prefix. Example: `[Boss] Naga Court Bonfire`. Visually distinct from player-crafted waystones in the teleport list; trivially greppable; survives any UI font that handles ASCII.
- **Multiplayer first-ignition broadcast — server-wide chat.** Format: `"{Player} has lit the {Boss} bonfire"`. Fires once per (boss, world) tuple — re-discoveries by other players don't re-broadcast (the bonfire already exists). Reinforces the shared-discovery culture of the pack and ensures off-line / not-present players see the new waystone appear in their teleport list with explicit context.

### 7.1 Implications for §6 implementation milestones

The resolved calls simplify milestones 1-2:
- **Milestone 1 (NBT marker convention) — unchanged.** The marker still encodes the boss_id and gets read at worldgen.
- **Milestone 2 (sentinel block) — simplified.** Invisible block, no rendering, no particle hooks. Just a position-holder with `boss_id` NBT.
- **New milestone 3a:** chat broadcast helper (`fireBonfireBroadcast(player, boss_id)`) — called by `placeBossWaystoneIfAbsent` after the waystone activates. Localized via `chat.iridescent.bonfire_lit` lang key with `{player}` + `{boss}` substitutions.

### 7.2 Boss respawn semantics — no special handling needed

Some bosses respawn (Twilight Lich on world reload), others don't (Ur-Ghast is one-shot per arena). The bonfire is placed once and stays. For non-respawning bosses, the bonfire becomes a "I beat this once" memorial after kill. For respawning bosses, the bonfire is a re-fight launchpad. Both work with the current design — no special handling needed.

---

## 8. Non-goals

- **Bonfire mechanics beyond teleport** (no resting / refilling estus / leveling up at bonfires — Minecraft already has eat/sleep mechanics; we don't layer FromSoftware mechanic depth on top, just the discovery+return convenience).
- **Bonfire-as-respawn-override** (per §1.2; vanilla bed/spawn is intentional).
- **Player-rename of boss bonfires** (Strategy 5 blocks it; design intent is discovery record).
- **Boss-spawn-egg auto-bonfire** (if an operator spawns a boss via creative, no bonfire fires — bonfires are player-discovery events, not spawn events).

---

*Last revised 2026-05-28. Next revision when the boss-catalog's `Threshold Position` column is authored alongside compass implementation.*
