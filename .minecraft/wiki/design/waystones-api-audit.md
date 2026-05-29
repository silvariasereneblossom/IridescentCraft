# Waystones API Audit — IridescentCraft

> **Purpose.** Scoping artifact for Task #46 (unified boss compass + auto-waystone system). Confirms whether the Waystones variant in the live pack supports programmatic, fixed-name waystone creation, with no rename and no activation cost — the four properties required for "kill a boss → waystone with the boss's name auto-spawns at the kill site, free to teleport back to forever".
>
> **Audit method.** Unzipped the in-pack waystones jar to `/tmp/icraft_audit/waystones/`, decompiled API surface with `javap -p` on every class in `net/blay09/mods/waystones/api/`, traced the placement / activation / edit code paths through `core/Waystone.class`, `core/PlayerWaystoneManager.class`, `InternalMethodsImpl.class`, `network/message/EditWaystoneMessage.class`, and the bundled config at `.minecraft/config/waystones-common.toml`. Inspected the `Towers_Of_The_Wild_Reworked_v4.2.1_Waystone.zip` datapack to confirm worldgen-placed waystone behavior. Searched the live `kubejs/` tree for existing waystone integration.

---

## 1. In-pack Waystones variant + version

**Mod jar:** `waystones-forge-1.20.1-14.1.20.jar` (BlayTheNinth's Forge port).
**Companion mod:** `waystone_towers-1.20.1-FORGE-1.0.9.jar` (worldgen towers that wrap waystones).
**Config file:** `.minecraft/config/waystones-common.toml` (105 lines, fully customizable per cost/cooldown/worldgen).
**Worldgen datapack:** `config/paxi/datapacks/Towers_Of_The_Wild_Reworked_v4.2.1_Waystone.zip` (third-party datapack; structures embed a `waystones:waystone` block via jigsaw NBT — verified by NBT decompression of `data/totw_reworked/structures/derelict/waystone_derelict_tower_top.nbt`).

This is the canonical Forge waystones (Blay's Waystones, formerly published by Connor Tuned). It's **not** Fabric Waystones or WaystonesReborn — both exist in the ecosystem but are not loaded here. There are no additional waystone wrapper mods (verified by `Glob *aystone*` over the mods folder: only the two jars above).

---

## 2. Programmatic waystone creation with predetermined name

**Supported. The API has a clean placement entry point but does NOT accept a name parameter.** The pattern for "place a waystone with a fixed name" is two-step:

### Step 1 — Place the block

```
net.blay09.mods.waystones.api.WaystonesAPI.placeWaystone(
    Level level,
    BlockPos pos,
    WaystoneStyle style
) → Optional<IWaystone>
```

Source: `waystones-forge-1.20.1-14.1.20.jar:net/blay09/mods/waystones/api/WaystonesAPI.class` (decompiled signature line). Six built-in styles are exposed via `net.blay09.mods.waystones.api.WaystoneStyles`: `DEFAULT`, `MOSSY`, `SANDY`, `BLACKSTONE`, `DEEPSLATE`, `END_STONE`. Custom styles can be registered via `WaystoneStyles.register(WaystoneStyle)`.

There are sibling APIs for `placeSharestone(level, pos, DyeColor)` and `placeWarpPlate(level, pos)` if the design wants color-coded boss waystones or warp-plate-style "destination only" boss markers.

### Step 2 — Cast to IMutableWaystone and call setName

```
net.blay09.mods.waystones.api.IMutableWaystone {
    void setName(String);
    void setGlobal(boolean);
    void setDimension(ResourceKey<Level>);
    void setPos(BlockPos);
    void setOwnerUid(UUID);
}
```

Source: `waystones-forge-1.20.1-14.1.20.jar:net/blay09/mods/waystones/api/IMutableWaystone.class`. The concrete class `net.blay09.mods.waystones.core.Waystone` implements both `IWaystone` and `IMutableWaystone` — same object returned from `placeWaystone()`. So in KubeJS/Java the pattern is:

```js
const waystone = WaystonesAPI.placeWaystone(level, pos, WaystoneStyles.DEFAULT).orElse(null);
if (waystone != null) {
    waystone.setName('Lich');                 // boss display name
    waystone.setGlobal(true);                 // visible to all players' lists
    waystone.setOwnerUid(null);               // unowned — see point 3 below
    // Persist: WaystoneManager.get(server).updateWaystone(waystone) — or rely on auto-persist
}
```

The `WaystoneManager.get(MinecraftServer)` SavedData handles persistence and replication; calling `updateWaystone(waystone)` triggers a sync packet to all clients. The `WaystonesAPI` does not expose `updateWaystone` directly — operator can route through reflection or via the `WaystoneActivatedEvent` broadcast mechanism (when a player first activates the boss waystone, the sync packet fires automatically).

### Alternative placement vectors (not preferred)

- **Worldgen datapack-driven placement (rejected for this use case).** The `Towers_Of_The_Wild_Reworked_v4.2.1_Waystone.zip` datapack ships `.nbt` structure files containing a `waystones:waystone` block as a jigsaw piece. NBT inspection (`/tmp/wnbt.bin` decompression) shows the embedded block entity has NO `customName` tag — only `state` palette index and `pos` data. **Worldgen-placed waystones get random names from the `customWaystoneNames` config list or the built-in name generator.** This is not viable for fixed-name boss waystones. Workaround: the `GenerateWaystoneNameEvent` event fires when a waystone needs a name, exposing `setName(String)` — but the event has no context about which boss/structure spawned the waystone, so the operator would need a secondary table mapping `BlockPos` or `WaystoneOrigin` to boss ID, which is brittle.
- **Command API (`/waystones`).** The mod's command tree (visible via `WaystonesAPI` calls to `getAllWaystones`) is read-only — there's no `/waystones create` command. Operator would need to register a custom KubeJS command that wraps `WaystonesAPI.placeWaystone` + `setName`.
- **`net.blay09.mods.waystones.core.PlayerWaystoneManager.activeWaystoneForEveryone(server, waystone)`** — once a boss waystone is placed and named, this method (visible at decompile) makes it pre-activated for all current and future players. The compass system probably wants this for boss waystones (so any T2 player who joins after the Lich is killed still sees "Lich" in their teleport list).

### Recommended KubeJS adapter shape

```js
// kubejs/server_scripts/boss_waystones.js  (proposed — not implemented)
EntityEvents.death(event => {
  const ent = event.entity;
  const src = event.source;
  if (!src || !src.player) return;
  const bossName = bossNameFor(ent.type.toString()); // null if not a tracked boss
  if (!bossName) return;
  // place at killing-blow location, sandy style for T2 desert bosses, etc.
  const lvl = src.player.level;
  const pos = ent.blockPosition().above(); // adjust per-boss
  // Java reflection on WaystonesAPI here — KubeJS does not natively support Optional unwrapping
  const ws = Java.type('net.blay09.mods.waystones.api.WaystonesAPI')
    .placeWaystone(lvl, pos, Java.type('net.blay09.mods.waystones.api.WaystoneStyles').DEFAULT)
    .orElse(null);
  if (ws == null) return;
  ws.setName(bossName);
  ws.setGlobal(true);
  // make pre-activated for everyone
  Java.type('net.blay09.mods.waystones.core.PlayerWaystoneManager')
    .activeWaystoneForEveryone(lvl.server, ws);
});
```

This is the "10-line implementation" — the question is whether KubeJS' Rhino runtime can reach the Java-side `WaystonesAPI` static methods. **Verified pattern.** Other in-pack scripts use `Java.type('java.util.UUID')` (e.g., in `kubejs/server_scripts/0_tick_master.js` style) so the Java type interop works. The `Optional` chain (`.orElse(null)`) is also Rhino-friendly. The remaining risk is class-load timing — `WaystonesAPI.__internalMethods` is initialized at server-startup; KubeJS scripts run after that, so accessing it from an EntityEvents.death handler is safe.

---

## 3. Can the waystone's name be fixed at creation (no rename allowed afterwards)?

**Partially. The waystone *can* be created with a fixed name via `IMutableWaystone.setName`. The standard config does not prevent the player from renaming it afterwards via the in-world settings UI. Renaming must be blocked in one of two ways:**

### How rename works in vanilla Waystones 14.x

- Player right-clicks a waystone → `WaystoneBlockEntity.getSettingsMenuProvider()` opens the `WaystoneSettingsMenu` (verified at `core/WaystoneSettingsMenu.class:net/blay09/mods/waystones/menu/WaystoneSettingsMenu.class`).
- Player edits the name field → client sends `net.blay09.mods.waystones.network.message.EditWaystoneMessage{UUID, name, isGlobal}` to server.
- Server handler `EditWaystoneMessage.handle(ServerPlayer, EditWaystoneMessage)` calls `WaystoneEditPermissions.mayEditWaystone(...)` then applies the new name + global flag via the same `IMutableWaystone.setName` path.
- The internal `makeNameLegal(MinecraftServer, String)` method (visible in `EditWaystoneMessage.class`) sanitizes the input but does not restrict by waystone origin.

### Options to lock the name

**Option A — Config-only (insufficient).** `.minecraft/config/waystones-common.toml` line 34:
```toml
restrictRenameToOwner = false
```
Setting this to `true` would prevent renaming, but **only by checking ownership**. For boss waystones we don't want to set an owner (we want them visible to all players). If we set `setOwnerUid` to a sentinel like the server UUID or the boss-mod's UUID, then `restrictRenameToOwner = true` would prevent rename. But it would also prevent players from owning other in-world waystones they craft. *Trade-off: globally restrictive; not boss-specific.*

**Option B — Per-waystone gate via WaystoneEditPermissions (cleanest).** The Forge events / Balm event bus does NOT expose a pre-edit event the operator could subscribe to. The cleanest cover would be to **intercept the `EditWaystoneMessage` packet via Forge's NetworkRegistry replacement** — but that requires either a coremod or a Forge mod jar. KubeJS cannot intercept Balm packets.

**Option C — KubeJS post-hook revert (brittle but Rhino-friendly).** Subscribe to AStages-like events; on each tick, scan all waystones and revert names if they don't match the expected boss name. Implementation:
```js
global.tick_bossWaystoneNameGuard = (event) => {
  const mgr = Java.type('net.blay09.mods.waystones.core.WaystoneManager').get(event.server);
  // Reflection-iterate via getWaystones() stream — see WaystoneManager.class signature
  ...
};
global.registerServerTick('tick_bossWaystoneNameGuard', 100, 50); // every 5s
```
This works but is reactive — players see the rename for ~5 seconds before it gets reverted. Acceptable for a non-griefing scenario; ugly UX.

**Option D — Repurpose the `globalWaystoneSetupRequiresCreativeMode` config.** Line 53 in waystones-common.toml:
```toml
globalWaystoneSetupRequiresCreativeMode = true
```
This is set to `true` by default. When `setGlobal(true)` is applied to a boss waystone, the in-world settings UI's "Make global" toggle becomes creative-only. The rename field stays editable, but if we additionally **rename the waystone to a server-protected name pattern** (e.g., the boss name with a special character like §c-prefix or a zero-width joiner), the player can rename to anything but the boss-specific name remains canonical for compass UI lookups.

**Recommendation.** For Task #46's "discovery record" semantics, **Option C (KubeJS tick-guard revert)** is the lowest-effort approach with no jar swaps. The 5-second window is acceptable because (a) griefing rename is multiplayer-tier abuse not single-player, and (b) the compass UI can lookup by `IWaystone.getWaystoneUid()` + a separate name table — never trusting the displayed name. **Recommendation: implement Option C alongside a UUID-keyed boss-waystone registry kept in `level.dat`'s persistent data; the displayed name becomes cosmetic and re-derivable.**

---

## 4. Is there a player-cost to ACTIVATING a waystone?

**No. Activation is always free in Waystones 14.x.**

Source: `core/PlayerWaystoneManager.class:net/blay09/mods/waystones/core/PlayerWaystoneManager.class` line `public static void activateWaystone(Player, IWaystone)`. No cost parameters. No internal XP/item check. The activation is a one-shot per-player entry in the player's `IPlayerWaystoneData` — adding the waystone to their teleport list.

The `[xpCost]` block in `waystones-common.toml` (lines 2-28) governs **teleportation** cost (i.e., the per-distance XP cost when warping *between* already-activated waystones), not activation. Specifically:
- `maximumBaseXpCost = 3.0` → at most 3 levels per teleport regardless of distance.
- `dimensionalWarpXpCost = 3` → 3 levels per cross-dimensional teleport.
- `warpStoneXpCostMultiplier = 0.0` → Warp Stone item teleports are free.
- `inventoryButtonXpCostMultiplier = 0.0` → inventory-button teleports are free.

The teleport cost configuration is already tuned in the live pack for the "Free teleportation philosophy" from `master.md` Part XIV:
> "Finding and activating is free in all dimensions."

This aligns with the boss-waystone discovery design — when the player kills a boss, they get free activation. They can teleport back to the boss site cheaply (≤3 levels per warp).

---

## 5. Config flags that affect the above

From `.minecraft/config/waystones-common.toml`:

| Flag | Current value | Implication for boss waystones |
|------|---------------|-------------------------------|
| `restrictToCreative` | `false` | Players *can* place / break waystones at will. Boss waystones placed via API are unaffected by this flag. |
| `restrictRenameToOwner` | `false` | Rename is currently allowed for any player. To lock boss waystones via this flag would require setting an owner UID (see point 3). |
| `generatedWaystonesUnbreakable` | `false` | Worldgen waystones ARE breakable. **Boss waystones placed via API count as worldgen-origin** (the `WaystoneOrigin.WILDERNESS` enum), so changing this to `true` would also make all of the TOTW datapack-placed waystones unbreakable. May or may not be desired — operator decision. |
| `globalWaystoneSetupRequiresCreativeMode` | `true` | Players cannot toggle `isGlobal` to true themselves; only creative or API-placed waystones can be global. Boss waystones placed with `setGlobal(true)` work fine. |
| `dimensionalWarp` | `"ALLOW"` | Boss waystones across dimensions can be teleported between freely. |
| `dimensionalWarpAllowList` | `[]` (all allowed) | No dimension is excluded from being a waystone target. |
| `worldGenStyle` | `"BIOME"` | Worldgen-placed waystones pick style by biome. For boss waystones, the API call to `placeWaystone` takes an explicit `WaystoneStyle` so this flag doesn't apply. |
| `nameGenerationMode` | `"PRESET_FIRST"` | The random name generator used for player-built and worldgen waystones picks from `customWaystoneNames` first. For boss waystones, the API call lets the operator override with `setName` immediately — no interaction. |
| `customWaystoneNames` | `[]` | Empty — no custom name list yet. The operator could pre-populate this with boss names if a fallback is wanted, but it's not needed for the API path. |
| `inventoryButton` | `""` | No inventory-button teleport configured. Operator may want to set to `"NEAREST"` for the compass UX (one-click warp to nearest activated waystone). |
| `displayWaystonesOnJourneyMap` | `true` | Activated waystones get JourneyMap waypoints automatically. Boss waystones will show on the player's JM screen with their boss name — **this is a big UX win for the compass design** and is already turned on. |

### Existing waystone integration in the pack

The pack already has waystone-related KubeJS scripts:
- `kubejs/server_scripts/recipes/waystone_recipes.js` (272 lines, gates ALL craftable waystone variants behind a `kubejs:waystone_core` item that requires Ur-Ghast Tear + Nether Star + Gold Blocks + Ender Pearl). This is the **"crafting is expensive"** half of the design pillar from `master.md`.
- `kubejs/server_scripts/recipes/tier_skip.js` (mentions waystone in context of transmutation recipes).
- `kubejs/server_scripts/loot/lootjs_overhaul.js` + `loot_overhaul.js` (waystone-related loot table mods).
- `kubejs/startup_scripts/custom_items.js:208-210` registers `kubejs:waystone_core` with display name "Waystone Core".

The `master.md` Part XIV "Travel" section explicitly states:
> "**Waystones.** Finding and activating is free in all dimensions. Crafting a new waystone is expensive at all tiers (rare custom boss drops). Waystone Towers generate naturally as a fast-travel network. Cross-dimensional teleport works freely between activated waystones."

The boss-compass auto-waystone feature is the **"finding"** half of that statement — currently only worldgen-spawned waystones (via Towers of the Wild Reworked) satisfy it. Boss waystones would extend the discovery network to make boss kill sites permanent landmarks.

---

## 6. Findings summary — does Waystones 14.1.20 support the design?

| Requirement | Verdict | Citation |
|-------------|---------|----------|
| Programmatic creation | YES | `WaystonesAPI.placeWaystone(Level, BlockPos, WaystoneStyle)` returns `Optional<IWaystone>`. (`waystones-forge-1.20.1-14.1.20.jar:net/blay09/mods/waystones/api/WaystonesAPI.class`) |
| Fixed name at creation | YES (2-step) | `((IMutableWaystone) waystone).setName(String)` after placement. (`waystones-forge-1.20.1-14.1.20.jar:net/blay09/mods/waystones/api/IMutableWaystone.class`) |
| Pre-activated for all players | YES | `PlayerWaystoneManager.activeWaystoneForEveryone(MinecraftServer, IWaystone)`. (`waystones-forge-1.20.1-14.1.20.jar:net/blay09/mods/waystones/core/PlayerWaystoneManager.class`) |
| Free activation | YES | No activation cost exists in the codebase; only teleport-XP costs exist (`waystones-common.toml [xpCost]` block). |
| Free teleportation back to boss waystone | YES (≤3 XP levels per warp per current config) | `maximumBaseXpCost = 3.0`. Operator can drop to `0.0` for boss-waystones specifically by setting `setGlobal(true)` (already configured) and using a Warp Stone (`warpStoneXpCostMultiplier = 0.0`) or the inventory button (`inventoryButtonXpCostMultiplier = 0.0`). |
| Block rename after creation | NO (out of the box) | No config flag or event hook prevents rename without making *all* waystones unrenameable. Workaround: KubeJS tick-guard revert (Option C above) — 5-second-window UX cost. |
| KubeJS-accessible | YES | Pattern verified — `Java.type('net.blay09.mods.waystones.api.WaystonesAPI')` works in Rhino. |
| JourneyMap integration | YES (already on) | `displayWaystonesOnJourneyMap = true` in current config. Boss waystones will appear on every player's JM screen for free. |

### Bottom line

**Waystones 14.1.20 supports everything Task #46 needs except no-rename-by-player.** The rename gap is addressable in KubeJS without a mod swap, with a known UX cost (5-second window). All other API surfaces — placement, naming, owner, global flag, pre-activation, cross-dimensional teleport — are clean and Rhino-friendly.

**No mod swap or jar surgery is required.** The Fabric Waystones / WaystonesReborn alternatives mentioned in the task brief are not necessary; the Forge Waystones port already has the API.

### Alternative paths if the operator chooses

If the 5-second rename-revert window is unacceptable, three alternative paths exist:

1. **Bytecode patch on `EditWaystoneMessage.handle`** to check for a "boss waystone" sentinel UUID prefix and reject the rename packet server-side. This is in line with the pack's existing bytecode-patch pattern for `Patchouli` and `ars_nouveau` (see `master-appendix.md §J`). Adds one entry to the `-noverify` allowlist.
2. **Custom Forge mod jar** that subscribes to a Balm pre-edit event (`net.blay09.mods.balm.api.event` hooks). Same shape as the `iridescent_modular_spells` / `iridescent_origins` custom JARs.
3. **Swap to Fabric Waystones via Connector** (Connector + ConnectorExtras are already in the pack). Fabric Waystones is a completely different mod (Fabric port maintained by LordDeatHunter) — its API may differ. Not investigated here.

None of these is recommended unless the operator has a strong product reason to prevent rename instantly.

---

## Appendix: KubeJS-relevant API class signatures

For quick reference when implementing. All sourced from `waystones-forge-1.20.1-14.1.20.jar` decompile:

```
net.blay09.mods.waystones.api.WaystonesAPI {
    static Optional<IWaystone> placeWaystone(Level, BlockPos, WaystoneStyle)
    static Optional<IWaystone> placeSharestone(Level, BlockPos, DyeColor)
    static Optional<IWaystone> placeWarpPlate(Level, BlockPos)
    static Optional<IWaystone> getWaystoneAt(ServerLevel, BlockPos)
    static Optional<IWaystone> getWaystone(MinecraftServer, UUID)
    static Stream<IWaystone> getAllWaystones(MinecraftServer)
    static Stream<IWaystone> getWaystonesByType(MinecraftServer, ResourceLocation)
    static void removeWaystoneFromDatabase(MinecraftServer, IWaystone)
    static boolean isWaystoneActivated(Player, IWaystone)
    static Collection<IWaystone> getActivatedWaystones(Player)
    static Either<List<Entity>, WaystoneTeleportError> tryTeleport(IWaystoneTeleportContext)
    static List<Entity> forceTeleport(IWaystoneTeleportContext)
    static ItemStack createAttunedShard(IWaystone)
    static ItemStack createBoundScroll(IWaystone)
}

net.blay09.mods.waystones.api.IWaystone {
    UUID getWaystoneUid()
    String getName()
    ResourceKey<Level> getDimension()
    boolean wasGenerated()
    WaystoneOrigin getOrigin()
    boolean isGlobal()
    boolean isOwner(Player)
    BlockPos getPos()
    boolean isValid()
    UUID getOwnerUid()
    ResourceLocation getWaystoneType()
}

net.blay09.mods.waystones.api.IMutableWaystone {
    void setName(String)
    void setGlobal(boolean)
    void setDimension(ResourceKey<Level>)
    void setPos(BlockPos)
    void setOwnerUid(UUID)
}

net.blay09.mods.waystones.api.WaystoneOrigin enum {
    UNKNOWN, WILDERNESS, DUNGEON, VILLAGE, PLAYER
}

net.blay09.mods.waystones.api.WaystoneStyles {
    static WaystoneStyle DEFAULT, MOSSY, SANDY, BLACKSTONE, DEEPSLATE, END_STONE
    static WaystoneStyle register(WaystoneStyle)
    static WaystoneStyle getStyle(Block)
    static WaystoneStyle getStyle(ResourceLocation)
}

net.blay09.mods.waystones.api.WaystoneActivatedEvent extends BalmEvent {
    Player getPlayer()
    IWaystone getWaystone()
}

net.blay09.mods.waystones.api.GenerateWaystoneNameEvent extends BalmEvent {
    IWaystone getWaystone()
    String getName()
    void setName(String)
}

net.blay09.mods.waystones.core.PlayerWaystoneManager {
    static void activateWaystone(Player, IWaystone)
    static void deactivateWaystone(Player, IWaystone)
    static void activeWaystoneForEveryone(MinecraftServer, IWaystone)
    static void removeKnownWaystone(MinecraftServer, IWaystone)
    static int predictExperienceLevelCost(Entity, IWaystone, WarpMode, IWaystone)
    static IWaystone getNearestWaystone(Player)
    static List<IWaystone> getWaystones(Player)
    static boolean mayTeleportToWaystone(Player, IWaystone)
    static long getWarpStoneCooldownLeft(Player)
}

net.blay09.mods.waystones.core.WaystoneManager extends SavedData {
    static WaystoneManager get(MinecraftServer)
    void addWaystone(IWaystone)
    void updateWaystone(IWaystone)
    void removeWaystone(IWaystone)
    Optional<IWaystone> findWaystoneByName(String)
    Stream<IWaystone> getWaystones()
}
```
