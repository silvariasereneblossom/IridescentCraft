# Boss Waystone Rename-Blocking — Strategy Comparison

> **Purpose.** Decision doc for Task #46 (unified boss compass + auto-waystone). Boss-spawned waystones must have a fixed name set at creation (e.g., "Naga Court", "Hydra Lair", "Ur-Ghast Tower") that the player cannot edit — they are a *discovery record*, not a user-customizable label. Player-crafted waystones (via `kubejs:waystone_core`, see [`waystone_recipes.js`](../../kubejs/server_scripts/recipes/waystone_recipes.js)) remain freely renameable.
>
> **Inputs.** Verified against [`waystones-api-audit.md`](waystones-api-audit.md) and direct bytecode inspection of `waystones-forge-1.20.1-14.1.20.jar` (Blay's Forge port, in-pack). Also references [`boss-catalog.md`](boss-catalog.md) for the ~106-boss target count and [`master-appendix.md §J`](master-appendix.md#j-bytecode-patches) for prior bytecode-patch precedent.
>
> **Scope.** Compares five strategies (the four named in the audit + one config-only escape hatch surfaced during this review). Each strategy is scored independently. Final section recommends one, but the operator may pick any.

---

## Key bytecode finding (used by every strategy)

`net.blay09.mods.waystones.network.message.EditWaystoneMessage.handle(ServerPlayer, EditWaystoneMessage)` is the **single chokepoint** for all rename packets. Its decision tree, decompiled:

```
WaystoneProxy proxy = new WaystoneProxy(server, msg.waystoneUid);
WaystoneEditPermissions perm = PlayerWaystoneManager.mayEditWaystone(player, level, proxy);
if (perm != ALLOW) return;            // ← bytecode: bipush 33, return
// ... apply makeNameLegal(server, msg.name) → IMutableWaystone.setName(...)
// ... apply msg.isGlobal           → IMutableWaystone.setGlobal(...)
// ... WaystoneManager.get(server).updateWaystone(proxy)  → sync packet
```

`PlayerWaystoneManager.mayEditWaystone` itself reads three config-driven gates in order:

1. `restrictToCreative` → `NOT_CREATIVE` if true and player not in creative.
2. `restrictRenameToOwner` → `NOT_THE_OWNER` if true and `IWaystone.isOwner(player)` returns false.
3. **`isGlobal()` AND not creative AND `globalWaystoneSetupRequiresCreativeMode`** → `GET_CREATIVE`.
4. Otherwise → `ALLOW`.

The third branch is the load-bearing one for this design — see Strategy 5.

**No cancellable pre-edit event is exposed by the Waystones API.** Decompiled API event list: `WaystoneActivatedEvent`, `WaystoneUpdateReceivedEvent`, `GenerateWaystoneNameEvent`, `WaystoneTeleportEvent.Pre/Post`. None fires before `setName(...)` on a player edit. Strategy 3 (custom mod) and Strategy 2 (mixin) both have to inject a new interception point.

---

## Strategy 1 — KubeJS 5-second tick-guard revert

**One-line.** Run a server tick scanning all boss-flagged waystones; if `getName()` doesn't match the expected boss name, call `setName(original)` to revert.

### How it works

A persistent registry (kept in a KubeJS `level.dat`-attached PersistentData map keyed by `IWaystone.getWaystoneUid()` → boss name) records every boss-spawned waystone. A scheduled tick (every 100 ticks = 5 s) iterates over the registry, fetches each waystone via `WaystonesAPI.getWaystone(server, uid)`, and if `getName()` diverges from the expected value, calls `((IMutableWaystone) ws).setName(expected)` followed by `WaystoneManager.get(server).updateWaystone(ws)` to broadcast the correction.

Code sketch (pseudo-code, **not a complete script**):

```js
// kubejs/server_scripts/boss_waystone_name_guard.js — PSEUDO-CODE
const WaystonesAPI         = Java.loadClass('net.blay09.mods.waystones.api.WaystonesAPI')
const WaystoneManager      = Java.loadClass('net.blay09.mods.waystones.core.WaystoneManager')

// Registry: persisted in level.dat customData under 'icraft_boss_waystones'
// Populated by EntityEvents.death handler when a boss is killed.
function loadRegistry(server) {
  const root = server.overworld().persistentData
  return root.getCompound('icraft_boss_waystones')  // { uid_str: 'Naga Court', ... }
}

ServerEvents.tick(event => {
  if (event.server.tickCount % 100 !== 0) return       // every 5 s
  const reg = loadRegistry(event.server)
  for (const uidStr of reg.keys) {
    const expectedName = reg.getString(uidStr)
    const uid = java.util.UUID.fromString(uidStr)
    const ws = WaystonesAPI.getWaystone(event.server, uid).orElse(null)
    if (ws == null) continue
    if (ws.name === expectedName) continue
    ws.setName(expectedName)                            // IMutableWaystone
    WaystoneManager.get(event.server).updateWaystone(ws)
  }
})
```

### Implementation cost

**~1 session (2–4 h)** including: registry plumbing, tick handler, EntityEvents.death wire-up to populate the registry, smoke test with one boss. KubeJS / Rhino interop with `WaystonesAPI` is verified clean per the audit doc.

### Maintenance cost

- **Waystones bump:** Survives most minor bumps — `WaystonesAPI.getWaystone`, `IMutableWaystone.setName`, `WaystoneManager.updateWaystone` are public API and stable across 14.x. Will break only if Blay renames/relocates `WaystoneManager` (already moved once between `core/` and api in past versions).
- **Forge bump:** Unaffected (no Forge internals touched).
- **Upgrade path:** Re-check `Java.loadClass` strings on jar swap; otherwise drop-in.

### Robustness

| Threat | Resilience |
|--------|-----------|
| (a) Player renames via UI | **Partial.** Rename succeeds for up to 5 seconds (worst case ~99 ticks of UI display, ~5 s of JourneyMap waypoint label, ~5 s for a sharestone receiver to see the wrong label). Revert is guaranteed on next tick window. |
| (b) Rename UI changes in future Waystones | **High.** The strategy doesn't inspect the UI — it polls model state. Any UI-side change is irrelevant. |
| (c) Third-party rename mod / NBT editor | **Medium.** A direct NBT edit to `WaystoneManager` SavedData on save will be reverted on next tick after load — but only if the registry is intact. NBT editor on the registry data itself bypasses the system. |
| (d) Save/reload | **High** if registry is in `level.dat` PersistentData. **Zero** if registry is in a transient script-side `global.*` map (lost on restart — the operator must commit to persistence). |

### Side effects

- 5-second **wrong-name window** is visible in UI, JourneyMap, sharestone receiver text. The audit doc deems this acceptable for SP / co-op pack scope.
- Tick overhead: ~106 lookups every 5 s — trivial (`WaystonesAPI.getWaystone` is a hash lookup).
- Compass/UI code that lookups by `IWaystone.getWaystoneUid()` rather than name is unaffected and remains the recommended path even with this strategy active (defense-in-depth).
- Does **not** invalidate Waystones-side achievements, since the UI rename succeeds initially and only reverts after.
- Does **not** require any jar edits, JVM flags, or operator-side install steps beyond a normal KubeJS script.

### Pros

- Lowest implementation cost.
- Pure KubeJS — no jar surgery, no `-noverify` flag, no resource-pack-side coordination.
- Maintainable by anyone fluent in the existing KubeJS authoring style (`waystone_recipes.js`, `loot_overhaul.js`).
- Cleanly removable / switchable to another strategy later.

### Cons

- The 5-second window is real UX leakage — player who renames will see "OK" → then a quiet revert. Mildly confusing.
- Tick-driven means correctness depends on tick continuity (server lag spike = longer window).
- Registry must be reliably persisted; one bug here = boss waystones drift to whatever player typed.

---

## Strategy 2 — Mixin / bytecode patch on `EditWaystoneMessage.handle`

**One-line.** Inject an early-return into `EditWaystoneMessage.handle` (or `PlayerWaystoneManager.mayEditWaystone`) that denies the edit when the target waystone is flagged as boss-spawned.

### How it works

Either (a) ship a Mixin via a tiny companion mod targeting `net.blay09.mods.waystones.network.message.EditWaystoneMessage`, intercepting `handle` and short-circuiting if `proxy.getWaystoneUid()` is in the boss-flagged set; or (b) follow the existing pack pattern from [`master-appendix.md §J`](master-appendix.md#j-bytecode-patches) — directly patch the `.class` bytecode in the Waystones jar to insert a check before the existing permission gate, requiring `-noverify`.

Code sketch (pseudo-Mixin, **not a deployable patch**):

```java
// In a companion mod's mixin package:
@Mixin(value = EditWaystoneMessage.class, remap = false)
public abstract class MixinEditWaystoneMessage {

    @Inject(method = "handle", at = @At("HEAD"), cancellable = true)
    private static void icraft$blockBossWaystoneRename(
            ServerPlayer player, EditWaystoneMessage msg, CallbackInfo ci) {
        // BossWaystoneRegistry is a SavedData on the overworld; UUID set.
        if (BossWaystoneRegistry.get(player.server).contains(msg.getWaystoneUid())) {
            // Optional: send a localized refusal message to the client.
            player.sendSystemMessage(Component.translatable("message.icraft.boss_waystone_locked"));
            ci.cancel();
        }
    }
}
```

A bytecode-only variant (no Mixin, à la the Patchouli `athrow → pop` patch) would replace the first instruction of `handle` with a comparable check via a synthetic helper class — practical but harder to author.

### Implementation cost

**~1–2 sessions (4–8 h)** assuming the operator already has a Forge mod dev environment for the `iridescent_*` jars. Includes: scaffolding a new tiny mod (or extending `iridescent_durability_clamp` or another already-shipped jar to absorb this), authoring the mixin, wiring `BossWaystoneRegistry` (SavedData), packaging, jar manifest entry, and live-pack install. The `-noverify` allowlist is already set.

If approached as pure bytecode patch (no Mixin, classfile rewrite): **~1 session (4–6 h)** but more fragile.

### Maintenance cost

- **Waystones bump:** Re-validate the `EditWaystoneMessage.handle` signature on every Waystones update; the pack's [protocol checklist](../protocols/8-client-sync.md) (referenced in §J) already includes "re-apply bytecode patches after mod updates", so the operational muscle exists. Realistically: 15–30 min per Waystones bump to verify + re-apply.
- **Forge bump:** Mixin variant survives MC version changes within the same Mixin major. Bytecode-direct variant breaks on any structural reshuffle.
- **Upgrade path:** Same as the existing Patchouli + ars_nouveau patches — re-apply per `wiki/protocols/8-client-sync.md`.

### Robustness

| Threat | Resilience |
|--------|-----------|
| (a) Player renames via UI | **High.** The edit is rejected server-side at packet receive. Player sees the UI close (or stay open, depending on which return path is hit) and no rename occurs. |
| (b) Rename UI changes | **Medium.** If a future Waystones version replaces the packet class or splits the handler, the mixin target is invalid and silently no-ops (Mixin) or crashes (raw bytecode). Caught by the bump-checklist. |
| (c) Third-party rename mod / NBT editor | **Medium-high.** Server-side rejection blocks any normal mod that sends the same packet. A bespoke mod that writes directly to `Waystone.name` field via reflection bypasses it; NBT editor on save data bypasses it. Recovery requires periodic name-audit (Strategy 1 in defense-in-depth). |
| (d) Save/reload | **High.** Registry as SavedData persists; mixin always loads at startup. |

### Side effects

- Adds one more entry to the [`§J Bytecode Patches`](master-appendix.md#j-bytecode-patches) table — operator commits to maintaining a fourth patched/custom-modified package.
- Mixin variant requires a new (small) jar in the build pipeline — adds it to `custom_jars_manifest.json` and the `cleanup_stale_jars.ps1` allowlist.
- Bytecode-direct variant requires `-noverify` on the Waystones jar — already in the existing JVM args, so no new operator-side action.
- No tick overhead. No UI flicker.
- Side-channel correctness: Waystones-internal achievements / advancements tied to renaming would not fire on boss waystones — none exist in 14.1.20 inspection, so neutral.

### Pros

- Hardest server-side enforcement — no race window.
- Aligns with the established §J pattern (operator already does this for Patchouli + ars_nouveau).
- Easy to communicate: "rename packet → check → reject" is a one-line description.

### Cons

- Requires Forge mod authoring and a JVM tool / dev environment on Windows. The pack ships 6+ custom jars but each requires manual gradle build + sign + drop.
- Couples to a specific Waystones internal class name — tighter than the API-only KubeJS path.
- Adds a fourth checklist entry to the mod-update flow.

---

## Strategy 3 — Custom Forge mod (separate jar, API-only)

**One-line.** Ship a standalone tiny Forge mod that subscribes to a Balm `WaystoneUpdateReceivedEvent` (or Forge `PlayerInteractEvent.RightClickBlock` on the Waystone block) and pre-empts the rename packet before `EditWaystoneMessage.handle` runs.

### How it works

Unlike Strategy 2 (which targets an internal class), this strategy uses **only the public Waystones / Balm event API**. The custom mod listens for `WaystoneUpdateReceivedEvent` (which fires after a name update is processed — same shape as Strategy 1's tick-guard but event-driven instead of polled) and reverts. Alternatively, it can register a Forge `PacketRegistry` interceptor at higher priority than Waystones for the same packet ID — this is effectively the same shape as the Mixin but stays within Balm public API.

The most robust event-based approach is to **register a NetworkPacket interceptor on the Balm side that runs before Waystones' own handler**. Balm exposes `BalmNetworking.registerServerboundPacket(ResourceLocation, …)` with priority semantics; the companion mod registers a higher-priority handler for the rename packet ID and short-circuits.

Code sketch (pseudo, **not deployable**):

```java
// In CompanionMod.java
@Mod.EventBusSubscriber(modid = "icraft_waystone_guard", bus = Bus.MOD)
public class IcraftWaystoneGuard {
    @SubscribeEvent
    public static void onSetup(FMLCommonSetupEvent ev) {
        // Subscribe to Balm's post-update event for revert-style guard:
        Balm.getEvents().onEvent(WaystoneUpdateReceivedEvent.class, evt -> {
            IWaystone ws = evt.getWaystone();
            BossWaystoneRegistry reg = BossWaystoneRegistry.get(...);
            String expected = reg.getExpectedName(ws.getWaystoneUid());
            if (expected != null && !expected.equals(ws.getName())) {
                ((IMutableWaystone) ws).setName(expected);
                WaystoneManager.get(server).updateWaystone(ws);
            }
        });
    }
}
```

A **pre-event** version (rejecting before `setName`) is **only** achievable with Strategy 2 (mixin) because Waystones' Balm event surface does not expose a cancellable pre-edit hook (verified — see §3 of `waystones-api-audit.md`).

### Implementation cost

**~2 sessions (6–10 h)** including: new mod scaffold (Forge MDK setup, even if shared with iridescent_durability_clamp), Balm dependency declaration, event subscription, registry SavedData, gradle build, packaging, jar manifest update, install.

If the operator absorbs the logic into an existing custom jar (e.g., `iridescent_difficulty-0.1.0.jar` already implements scripted boss-tier behavior) the cost drops to **~1 session (3–5 h)**.

### Maintenance cost

- **Waystones bump:** Low — API surface (`WaystoneUpdateReceivedEvent`, `IMutableWaystone`, `WaystonesAPI.getWaystone`) is the most stable part of the mod. Same risk profile as Strategy 1's KubeJS path.
- **Forge bump:** Standard MC version bump cost; rebuild against the new MDK.
- **Upgrade path:** Adds the jar to `custom_jars_manifest.json` rehash. No `-noverify` impact.

### Robustness

| Threat | Resilience |
|--------|-----------|
| (a) Player renames via UI | **Medium-high.** Event-driven revert — fires within the same tick that the packet was processed. Visible window is ~1 tick (~50 ms) vs. Strategy 1's 5 s. |
| (b) Rename UI changes | **High.** Uses public API events; UI changes irrelevant. |
| (c) Third-party rename mod / NBT editor | **Medium.** Other mods that route through Balm fire the same event; NBT editing bypasses. |
| (d) Save/reload | **High.** SavedData registry persists; mod loads at startup. |

### Side effects

- One more custom jar in the pipeline. The pack already ships 6 — operator cost is incremental, not net-new.
- No `-noverify` impact.
- Does **not** require Mixin (lighter dev dependency than Strategy 2).
- Does **not** introduce tick overhead — purely event-driven.

### Pros

- Cleanest separation: no Waystones internals coupling.
- Survives Waystones version bumps better than Strategy 2.
- Idiomatic in the pack's existing custom-jar pattern.

### Cons

- Strictly post-fact revert (not pre-rejection) since no pre-edit event exists. The ~1-tick window is much smaller than Strategy 1's 5 s but still nonzero.
- Higher implementation overhead than Strategy 1 (Forge mod authoring vs. KubeJS).
- Adds another jar to manage (rebuild, sign, ship).

---

## Strategy 4 — Mod swap (replace Waystones with a different variant)

**One-line.** Replace `waystones-forge-1.20.1-14.1.20.jar` with a Fabric / different-Forge fork (e.g., Fabric Waystones via Connector, or WaystonesReborn) that natively supports per-waystone immutable names.

### How it works

Survey alternatives:
- **Fabric Waystones (LordDeatHunter).** Loaded via Connector (already in the pack). Has a separate code path for "structure waystones" with locked names — but configuration vocabulary, recipe IDs, block IDs all differ from Blay's port. Migration cost: every reference in [`waystone_recipes.js`](../../kubejs/server_scripts/recipes/waystone_recipes.js) (35 ID references), every loot table reference, every quest reference, every config flag.
- **WaystonesReborn.** Different recipe layout, different block model, no known compatibility with `paxi/datapacks/Towers_Of_The_Wild_Reworked_v4.2.1_Waystone.zip`.
- **Roll-your-own** companion mod that wraps a different waystone block and reuses `kubejs:waystone_core`. Effectively Strategy 3 at greater scope.

Verifying any of these supports the *exact* shape ("place via API + lock name + global + free activation") requires running the migration to see.

### Implementation cost

**~6–12 sessions (20–40 h)** — the audit doc estimates this as "big surgery, possibly recipe-incompatible". Includes:
- Choose target fork.
- Pull and read the target's `.jar`, decompile API.
- Rewrite [`waystone_recipes.js`](../../kubejs/server_scripts/recipes/waystone_recipes.js) (272 lines, 35 IDs) for new namespace.
- Update `kubejs:waystone_core` recipe outputs (~6 block variants, ~16 sharestone colors, ~7 utility items).
- Re-test the entire crafting chain end-to-end.
- Re-test the `Towers_Of_The_Wild_Reworked_v4.2.1_Waystone.zip` datapack's structure spawns (may break — TOTW expects `waystones:waystone` block ID specifically).
- Re-test JourneyMap waypoint integration.
- Re-test the boss-compass system that this work supports.

### Maintenance cost

- **Per-bump:** New mod ecosystem to track. Fabric Waystones in particular has a different release cadence than Blay's port.
- **Compatibility:** TOTW datapack and any Curios / JourneyMap / dedicated-server companion mod that integrates with Waystones must be re-validated.
- **Upgrade path:** Comparable to introducing any major new mod — recipe audits, loot-table audits, quest audits all need an extra pass per upgrade.

### Robustness

| Threat | Resilience |
|--------|-----------|
| (a) Player renames via UI | Depends on fork. Fabric Waystones (last checked, 1.20.x) does support immutable structure waystones natively but the operator has to verify on the specific build. |
| (b) Rename UI changes | High (native feature). |
| (c) Third-party rename mod / NBT editor | Same as any mod. |
| (d) Save/reload | High. |

### Side effects

- **Existing waystones in player saves become invalid** (different block ID). Anyone with a save mid-playthrough loses every placed waystone. The audit doc notes no public release yet, so this is reversible — but only because of project phase.
- Breaks `Towers_Of_The_Wild_Reworked_v4.2.1_Waystone.zip` worldgen (datapack hardcodes `waystones:waystone`). Operator would need to fork or replace the datapack.
- `waystone_recipes.js` becomes 272 lines of churn.
- Connector-loaded Fabric Waystones is a separate compatibility surface — any Connector incompatibility (rare but not zero) is a new failure mode.

### Pros

- "Natively supported" is the cleanest correctness story.
- No KubeJS revert tricks; no bytecode patches.

### Cons

- Largest implementation cost of any strategy, by ~5×.
- Knock-on breakage scope (recipes, loot, worldgen, JourneyMap, sharestone player networks) is high.
- The "different recipe layout" risk means the project's "waystone is a tier-2 milestone gated behind boss drops" pillar must be re-derived in a new mod's idiom.
- Operator-facing: any future mod author who reads `master.md`'s "Waystones" section now has to know which fork.

---

## Strategy 5 — Config-only via `globalWaystoneSetupRequiresCreativeMode`

**One-line.** Set boss waystones global via `IMutableWaystone.setGlobal(true)` (which the audit already recommends for pre-activation purposes). With the existing config flag `globalWaystoneSetupRequiresCreativeMode = true`, the vanilla permission check rejects renames by survival players — for free, no code.

### How it works

Refer to the bytecode finding above: `PlayerWaystoneManager.mayEditWaystone` returns `GET_CREATIVE` if (waystone is global) AND (player not creative) AND (config flag true). `EditWaystoneMessage.handle` then bails before calling `setName`. The pack already has `globalWaystoneSetupRequiresCreativeMode = true` in [`config/waystones-common.toml`](../../config/waystones-common.toml). And the audit's Step 3 recommends boss waystones be placed with `setGlobal(true)` regardless (for pre-activation behavior).

So the boss-spawn path becomes:

```js
// kubejs/server_scripts/boss_waystones.js — PSEUDO-CODE
EntityEvents.death(event => {
  // ... boss check, position calc ...
  const ws = WaystonesAPI.placeWaystone(level, pos, WaystoneStyles.DEFAULT).orElse(null);
  if (ws == null) return;
  ws.setName('Naga Court');
  ws.setGlobal(true);                                                    // ← critical line
  PlayerWaystoneManager.activeWaystoneForEveryone(level.server, ws);
});
```

That's the entire mechanism. The `setGlobal(true)` simultaneously:
- Enables `activeWaystoneForEveryone` semantics.
- Triggers the `mayEditWaystone` global-creative-check that rejects survival-player renames.
- Marks the waystone as visible across players' lists.

### Implementation cost

**~0 h.** It's a side effect of the recommended boss-waystone shape. If the operator already plans to use `setGlobal(true)` per the audit's §2 recommendation, the rename block is free.

### Maintenance cost

- **Waystones bump:** Survives any bump that keeps the `mayEditWaystone` decision tree. The third branch has been stable across 14.x. Risk if Blay refactors the gate logic — re-verify on bump, but no jar surgery.
- **Forge bump:** Unaffected.
- **Config drift:** The flag `globalWaystoneSetupRequiresCreativeMode` must stay `true`. Operator must not invert it for any other reason without rethinking this strategy.

### Robustness

| Threat | Resilience |
|--------|-----------|
| (a) Player renames via UI | **High.** Server-side rejection at the `if_acmpeq` check inside `EditWaystoneMessage.handle`. Same enforcement strength as Strategy 2's mixin — using *the mod's own* permission gate. |
| (b) Rename UI changes | **High.** Decision happens on server packet receive, not in UI. |
| (c) Third-party rename mod / NBT editor | **Medium.** Same as Strategy 2 — any mod sending the standard `EditWaystoneMessage` is blocked. Direct NBT writes bypass. |
| (d) Save/reload | **High.** No state to persist beyond the waystone's own `isGlobal` flag, which is already in `WaystoneManager` SavedData. |

### Side effects

- **All boss waystones become global**, i.e., visible in every player's teleport list as soon as activated (anywhere). This is exactly the desired discovery-record semantics for Task #46 — but the operator should verify they're OK with cross-player visibility for *every* boss waystone. (For SP-focused pack scope, this is neutral.)
- **Cross-dimensional teleport is enabled by global** per the existing config (`dimensionalWarp = "ALLOW"`). Already the design intent.
- Creative-mode players (op, dev) can still rename boss waystones. Not a bug — they are by definition trusted.
- Does **not** prevent the player from breaking the waystone block (config `generatedWaystonesUnbreakable` is `false`). Rename block ≠ destroy block. If destroy-blocking is also required, that's a separate config conversation.
- Does **not** distinguish boss waystones from any *other* global waystone — there is no per-waystone toggle, so all global waystones are rename-locked. If the design ever wants a player-owned global waystone that can be renamed, this strategy is too coarse.

### Pros

- Zero implementation cost. Zero new code. Zero new jar.
- Survives every mod bump.
- Uses Waystones' own permission gate — operator never has to re-justify a workaround.
- Stacks with Strategy 1 (defense-in-depth) for free.

### Cons

- All global waystones in the world become creative-only-renameable, not just boss waystones. (Currently this aligns — `globalWaystoneSetupRequiresCreativeMode = true` already means survival players can't *make* anything global, so they can't trigger this gate on their own waystones. But if the design ever exposes a player path to global waystones, this side effect leaks.)
- "Block destruction" still possible (orthogonal — separate decision).
- Operator must place every boss waystone with `setGlobal(true)`; if a boss path forgets, that waystone becomes player-renameable.

---

## Comparison matrix

| Strategy | Impl Cost | Maint Cost | Robustness | Side Effects | Operator-friendly? |
|---|---|---|---|---|---|
| 1. KubeJS tick-guard | 1 session (2–4 h). Pure KubeJS. | Low. Survives most bumps. | Medium. 5-second wrong-name window before revert. Survives reload if registry persisted. | Tick overhead trivial. No jar changes. Compass should key on UID not name anyway. | Yes — script-only, fits existing KubeJS authoring. |
| 2. Mixin / bytecode patch | 1–2 sessions (4–8 h). Needs Forge MDK + Mixin. | Medium. Re-verify on every Waystones bump. Follows existing §J pattern. | High. Server-side packet rejection. ~0 race window. | Adds 4th entry to `§J Bytecode Patches`. Adds custom jar (or extends existing one). | Mixed — pack already ships 6 custom jars and `-noverify`; muscle exists. |
| 3. Custom Forge mod (API only) | 2 sessions (6–10 h), 1 session if absorbed into existing custom jar. | Low–medium. Public API is stable. | Medium-high. Post-fact revert, ~1 tick window. | Adds custom jar. No `-noverify` impact. | Yes — idiomatic with the pack's existing custom-jar pattern. |
| 4. Mod swap | 6–12 sessions (20–40 h). Recipe + worldgen + JourneyMap re-derivation. | High. New ecosystem to track. | High (depending on fork). | Existing saves' waystones invalidated. Breaks TOTW datapack. 272-line `waystone_recipes.js` churn. | No — biggest blast radius. |
| 5. `setGlobal(true)` (config) | 0 h. Free byproduct of recommended boss-waystone shape. | Very low. Decision gate stable across 14.x. | High. Uses Waystones' own permission gate. Same strength as Strategy 2. | All global waystones become creative-only-renameable. Block-destroy not blocked (orthogonal). | Yes — no new artifacts. |

---

## Recommendation

**Strategy 5 (`setGlobal(true)` exploit of the existing config gate), with Strategy 1 (KubeJS tick-guard) as defense-in-depth.** Strategy 5 alone gives server-side rename rejection at zero implementation cost, using the mod's own permission check — and it's a natural side effect of the `setGlobal(true)` call the audit already recommends for boss-waystone pre-activation. The only realistic failure mode is an NBT-level edit or a future Waystones refactor of `mayEditWaystone`; Strategy 1 layered on top covers both with another ~3 hours of work and a UID-keyed registry that the compass UI will want anyway. This combination keeps everything in KubeJS and config, leaves zero new jars in the build pipeline, doesn't touch `-noverify`, and remains trivially swappable to Strategy 2 or 3 later if the operator finds a case where the global-flag semantics conflict with another design goal. Strategy 4 is reserved for "we discovered Waystones is being abandoned by Blay" — not a current concern.

> **Caveat.** Strategy 5 assumes the operator wants every boss waystone to be `isGlobal = true` (visible in every player's teleport list and freely cross-dimensional). This is consistent with `master.md` Part XIV's "discovery is free" pillar and with the audit's Step 2 recommendation, but the operator should confirm before committing.
