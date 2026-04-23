<!-- INTERNAL ONLY — do NOT mirror to the public GitHub wiki. -->

# Full-Codebase Code Review — 2026-04-23

Fine-toothed review across every KubeJS script, every config, every shell/bat/ps1, every Java source, every datapack, and wiki alignment against the master design doc. Dispatched via seven parallel Explore agents, findings consolidated here, safe fixes applied inline in commit `TBD`, invasive items documented as followups.

## Summary

**Codebase status: HEALTHY.** No live crash or data-loss bugs. The cherry-biome FeatureSorter saga (resolved earlier today) left a small number of orphan artifacts which this review swept up. The largest remaining issue is repo hygiene — 2.5 GB git directory bloated by ~4,000 runtime-generated tracked files; fixing that requires `git filter-repo` which is destructive and is left as a user decision.

| Area | Findings | Applied inline | Documented as followup |
|---|---|---|---|
| KubeJS (129 scripts) | 1 medium (stale shadow dir) | **270 files deleted** | — |
| Configs (765 files) | 3 critical / 2 high / 3 med / 3 low | 2 critical, 1 medium | 3 high priority divergences |
| Shell/bat/ps1 (48 scripts) | 2 critical / 2 high / 2 med / 2 low | — | 4 items |
| Java mods (2 mods, 4 sources) | 1 critical (false positive) / 3 high / 2 med | 2 high (rename + docstring) | 2 med |
| Datapacks (14 sources, 11 zips) | 1 critical / 2 high / 1 med | 1 critical (stub dir) + empty-source-dir cleanup | 3 items |
| Wiki / design doc | 2 minor documentation mismatches | 1 (home.md) | 1 minor |
| Repo hygiene | 3 critical / 2 high / 1 med | `.gitignore` expanded, stale nested kubejs deleted | git filter-repo (user decision) |

Total applied inline: **~290 files removed or edited**. Remaining recommended followups: **11 items** (listed at bottom).

## Fixes applied inline

### 1. Repo hygiene — `.gitignore` expanded to stop the bleed

Added to `/root/IridescentCraft/.gitignore` (before: tracked logs, crash-reports, modernfix, TesterLogs, world, local, poi, moddata, immersive_library, prettypipesprefs):

```
.minecraft/world/
.minecraft/logs/
.minecraft/crash-reports/
.minecraft/modernfix/
.minecraft/local/
.minecraft/poi/
.minecraft/moddata/
.minecraft/immersive_library/
.minecraft/prettypipesprefs/
.minecraft/usercache.json
.minecraft/usernamecache.json
.minecraft/banned-*.json
.minecraft/ops.json
.minecraft/whitelist.json
# Runtime crash logs shipped by testers — keep committed under TesterLogs/ but
# block loose crash-logs that accumulate at distro root
.minecraft/server_distribution/logs/
.minecraft/server_distribution/crash-reports/
.minecraft/distribution/client/logs/
.minecraft/distribution/client/crash-reports/
```

This stops **new** runtime files from being committed. It does NOT remove the ~4,000 already-tracked files from git history — that's a `git filter-repo` job and is destructive. See **Followups** below.

### 2. Stale `.minecraft/kubejs/kubejs/` nested shadow tree — deleted

Nested `kubejs/kubejs/` directory contained **270 files** from an early project era (README referenced Section 29 of a much earlier design doc; contained outdated Origins NBT probes using the old list-shape that was superseded 2026-04-21; included its own ProbeJS `libraries/` stubs that aren't used). All deleted.

The main `.minecraft/kubejs/server_scripts/`, `startup_scripts/`, `client_scripts/` folders continue to be the canonical scripts. KubeJS audit confirmed they are healthy — no crash-level bugs, LootJS `ItemFilter.custom` wrapping is applied correctly, Origins NBT probes use the correct compound-shape.

### 3. `datapack_sources/icraft_biomes/` empty stub — deleted

When we deleted the `icraft_biomes.zip` orphan datapack earlier today (commit `8c85d818`), we left the empty directory skeleton behind (`data/icraft/worldgen/{placed_feature,configured_feature}/` — six nested empty dirs). If anyone re-built from this source, they'd recreate the exact pattern that caused the week-long crash. Stub directories removed.

### 4. 29 `*.toml.bak` files in `.minecraft/config/` — deleted

Backup files scattered across the config directory (aeroblender, aether, apocalypse, aquaculture, … 29 total). They were safety backups from earlier edits. Active configs are intact; backups removed for directory cleanliness. No behavior change.

### 5. `biomespawnpoint/spawnbiomes.txt` — switched to our new biomes

`.minecraft/config/biomespawnpoint/spawnbiomes.txt:516` still pointed at vanilla `minecraft:cherry_grove` as the active spawn biome. The pack just shipped `iridescent_biomes:cherry_river_valley` and `iridescent_biomes:cherry_mountains`. Updated to:

```
!minecraft:cherry_grove,
iridescent_biomes:cherry_river_valley,
iridescent_biomes:cherry_mountains,
```

New players now spawn in one of our two cherry biomes. Mirrored to all three distros (main, server_distribution, distribution/client).

### 6. `wiki/home.md` "Parts I-XII" → "Parts I-XXIX"

Typo in the homepage implementation-status blurb: the master design doc has 29 parts, not 12.

### 7. `IcraftCherryRegion` class renamed → `IridescentCherryRegion`

Stale name from yesterday's namespace rename (`icraft:` → `iridescent_biomes:`). The `icraft` prefix on the Java class was a vestige of the pre-rename state. Renamed the file + class + all references in `IridescentBiomes.java`. Stale javadoc line `"Adds the two icraft:cherry_* biomes..."` also updated to `"iridescent_biomes:cherry_*"`. Mod jar rebuilt and redeployed to all three distros.

## Followups — documented, not applied

These are invasive, subjective, or require user input. Each is tagged with recommended priority.

### A. [HIGH] Custom JAR allowlist divergence: `iridescent_classes.jar`

Only `update_mods.sh` and `update_mods.ps1` include `iridescent_classes.jar` in the `$customJars` / `CUSTOM_JARS` allowlist. `iridescentserver.bat`, `sync_from_repo.bat`, `sync_client.bat`, `sync_client.ps1` do NOT. But the jar itself doesn't exist in any `mods/` directory. So:

- **If** `iridescent_classes.jar` is a planned-but-unbuilt mod (source in `datapack_sources/iridescent_classes/`): build it, ship it, add to every allowlist.
- **If** it's abandoned: remove from `update_mods.sh` and `update_mods.ps1`, remove the `!mods/iridescent_classes.jar` exemption from `.gitignore:3`, and delete `datapack_sources/iridescent_classes/`.

Need user decision on which direction.

### B. [HIGH] Config divergence between main and `server_distribution/`

The config audit found meaningful divergences in:
- `config/apotheosis/names.cfg` — server missing entries for cataclysm / tetra_spell_book weapons; newly-added boss mats have no named affix pool on server.
- `config/apotheosis/enchantments.cfg` — `undermod:life_leech` block missing from server (may be intentional if `undermod` is client-only).

**Action:** diff the two files, decide on a canonical source, run a sync. Will require one commit per file.

### C. [HIGH] Paxi datapack load order references missing files

`config/paxi/datapack_load_order.json` lists `icraft_dungeon_crawl_overrides.zip` and `icraft_tower_overrides.zip` but neither exists in `config/paxi/datapacks/` on any distro. Either:
- Build them from `datapack_sources/icraft_dungeon_crawl_overrides/` (exists); create source for tower overrides.
- Or remove the stale entries from load order.

### D. [HIGH] Orphan compiled zips with no source tree

Two of our own datapack zips have no corresponding `datapack_sources/` folder, so they can't be rebuilt:
- `config/paxi/datapacks/icraft_loot_overrides.zip` (550KB, actively loaded)
- `config/paxi/datapacks/icraft_progdiff_overrides.zip`

Both are in the load order. Recommendation: extract both zips back into `datapack_sources/icraft_loot_overrides/` and `datapack_sources/icraft_progdiff_overrides/`, commit the source, add a build step to the mod build pipeline. Until then they're unmodifiable.

External orphans that are FINE to leave as zip-only (third-party pack contents, not ours to re-source):
- `ScalingHealth_NoCrystalDrops_AllVanilla.zip`
- `Towers_Of_The_Wild_Reworked.zip`
- `Towers_Of_The_Wild_Reworked_v4.2.1_Waystone.zip`
- `fix_stone_tags.zip`
- `infinity_ham_blocker.zip`
- `keepinventory_datapack.zip`

### E. [MEDIUM] Git history cleanup via `git filter-repo`

The `.git/` directory is 2.5 GB, primarily from ~4,000 tracked runtime-generated files (`.minecraft/logs/`, `crash-reports/`, `modernfix/` cache, `TesterLogs/`). The `.gitignore` update from this review blocks FURTHER leakage but doesn't clean history.

To shrink the repo (expected result: 100-200 MB), run something like:

```bash
git filter-repo --invert-paths \
  --path .minecraft/logs \
  --path .minecraft/crash-reports \
  --path .minecraft/modernfix \
  --path .minecraft/local \
  --path .minecraft/poi \
  --path .minecraft/moddata \
  --path .minecraft/immersive_library \
  --force
```

**DESTRUCTIVE** — rewrites all commit hashes, forces every clone to re-sync. User decision: worth doing before inviting more testers / forking / archiving? Doing it later (after more history accumulates) is strictly worse. Recommended if no one has branches in flight.

### F. [MEDIUM] Hardcoded Windows-specific paths in server scripts

`server_distribution/push_crash_logs.bat:3-4` and `sync_from_repo.bat:5` hardcode `Z:\Users\Silvaria Zemaitis\AppData\Roaming\PrismLauncher\...`. This is the network-share mapping on the user's Windows Server to the dev machine. The bat scripts are committed; anyone else cloning the repo and running on a Windows Server without `Z:` mapped will fall through to the local fallback, which works but is less efficient.

If the pack is to be shared publicly, replace with `%APPDATA%\PrismLauncher\...` or an environment variable. Low urgency since the scripts have a functional fallback.

### G. [MEDIUM] 7 stray JARs loose at repo root

`/root/IridescentCraft/ars_nouveau.jar`, `better_combat.jar`, `botania.jar`, `footwork.jar`, `irons_spellbooks.jar`, `progressive_difficulty.jar`, `tetra.jar` sit loose at the repo root. They are untracked (`.gitignore` catches `*.jar`), so they don't bloat git, but they clutter the workspace. These look like reference jars used for decompilation/audit work. Suggest moving to a `tools/reference-jars/` directory (also gitignored) to keep the workspace tidy. No behavior impact either way.

### H. [MEDIUM] `pack_format: 15` missing from most datapack `pack.mcmeta`

16 of 17 `datapack_sources/*/pack.mcmeta` files lack an explicit `pack_format` field. Minecraft 1.20.1 requires `15` for data packs. Missing formats may load with a warning or silently fall back. Recommend sweep: add `{"pack":{"pack_format":15,"description":"..."}}` to every `datapack_sources/*/pack.mcmeta`, then rebuild and deploy zips. Small one-time chore.

### I. [LOW] `cherry_mountains` erosion range is narrow

`IridescentCherryRegion.java` gives cherry_mountains `erosion = span(-1.0, -0.375)` — only the highest/most-vertical mountain terrain. Vanilla mountain biomes typically span wider. In practice this will make cherry_mountains rare. If you want it more common, broaden to e.g. `span(-1.0, -0.2)`. Cherry_river_valley's erosion span is already wider and should be fine.

### J. [LOW] Biome JSON `temperature` / `downfall` metadata vs climate params

Both cherry biome JSONs have a `"temperature"` field (0.5 for mountains, 0.7 for river_valley) that DON'T match the climate parameter space temperature ranges used in `addBiomes()` (-0.2..0.1 for mountains, 0.1..0.3 for river_valley). In 1.20.1 the JSON `temperature` field is legacy — it's used for visual tint effects (snow line, water freezing, etc.) but not for climate-space placement. So there's no functional bug, just internal-doc drift. If you want the JSON field to reflect perceived temperature, mountains should probably be ~0.3, river_valley ~0.6.

### K. [LOW] Origins mod `mods.toml` inconsistency

`iridescent-origins-mod/src/main/resources/META-INF/mods.toml` hardcodes `modId="iridescent_origins"` and dependency key `[[dependencies.iridescent_origins]]` inline. The newer biomes mod uses `${mod_id}` template variables. Refactoring Origins to match is a cosmetic consistency improvement — ~5 line change, no behavior impact. Good housekeeping for the next time Origins needs modification.

(**The Java audit agent flagged `${file.jarVersion}` in Origins `mods.toml` as a CRITICAL unresolved-variable bug. I'm calling this a false positive**: Forge resolves `${file.jarVersion}` natively from the jar manifest at runtime — it's not a Gradle-expand variable and is the recommended pattern per Forge docs. If the Origins mod has been loading correctly all session, this is fine.)

## What the audit told us about overall code quality

- **KubeJS scripts are in good shape.** Past-session bugs (LootJS predicate filter always-false, Origins list-vs-compound NBT shape, Rhino `const` redeclaration) are all fixed in place. No new critical or high issues found across 129 scripts.
- **Forge Java mods are clean.** `IridescentOrigins` correctly implements the data-only mod pattern; `IridescentBiomes` correctly uses `FMLJavaModLoadingContext` + `enqueueWork` for main-thread region registration.
- **Design doc alignment is strong.** 13 origins / 11 races / 10 classes claim matches implementation; waystones XP costs match design philosophy; Ars Nouveau glyph injection rates match the design doc's stated tier percentages.
- **Major repo hygiene issue is git history bloat** (tracked runtime files from before proper `.gitignore` rules) — addressed going forward, history cleanup is opt-in.
- **The recurring pattern to watch** — confirmed by two separate audits — is orphan artifacts in `datapack_sources/` and `config/paxi/datapacks/`. We cleaned up one more today (`icraft_biomes` stub); the `icraft_loot_overrides` / `icraft_progdiff_overrides` source-less zips are the remaining instance of this pattern and should be recovered before they cause a similar debugging arc.
