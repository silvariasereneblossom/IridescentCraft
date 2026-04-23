# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## What This Is

IridescentCraft is a 420-mod Minecraft 1.20.1 Forge modpack with RPG progression systems. This wiki is the living documentation for all design systems, implementation status, and known issues. It is maintained as markdown files in the repo and synced via git.

## Repository Structure

- `wiki/home.md` — Wiki homepage with section index and implementation status
- `wiki/design/master.md` — **Master design document** (canonical source of truth for all systems)
- `wiki/design/changelog.md` — Log of all design changes made across sessions
- `wiki/progression/overview.md` — Tier system, dimension gates, quest structure
- `wiki/classes/overview.md` — 10 classes, 11 races, 13 origins, glass cannon mechanics
- `wiki/systems/overview.md` — Death penalty, scaling, enchantments, affixes, skills, loot
- `wiki/kubejs/overview.md` — Script reference, event compatibility, datapack loading
- `wiki/mods/overview.md` — Key mods by tier, config changes
- `wiki/known-issues/tracker.md` — Active bugs, verification needed, resolved issues
- `wiki/roadmap/planned.md` — Planned future changes, improvements, technical debt
- `wiki/meta/style-guide.md` — Writing conventions
- `wiki/protocols/` — Maintenance workflows

## Key Domain Context

- **Minecraft 1.20.1 Forge** — All mods target this version
- **KubeJS 6.x (2001.6.5-build.16)** — Primary scripting system. Scripts in `kubejs/server_scripts/`, `kubejs/startup_scripts/`, `kubejs/client_scripts/`
- **Paxi 4.0 Forge** — Loads datapacks from `global_packs/required_data/` as **ZIP files only** (not folders)
- **AStages** — Per-player tier gating for items, dimensions, recipes
- **Pufferfish's Skills** — Skill point investment trees (6 trees, command rewards)
- **Origins** — Race/class selection. Layers in separate namespaces create separate prompts (not overrides)
- **Patchouli** — In-game guidebook. Books discovered from `data/<namespace>/patchouli_books/` in datapacks
- **Apotheosis** — Enchanting overhaul, affix system, gem sockets, boss scaling

## File Paths

- Modpack root: `/root/IridescentCraft/minecraft/`
- KubeJS scripts: `kubejs/server_scripts/`, `kubejs/startup_scripts/`, `kubejs/client_scripts/`
- Configs: `config/`
- Datapacks: `global_packs/required_data/*.zip`
- Design docs: `designdocs/`
- Wiki: `wiki/`

## KubeJS Event Compatibility (1.20.1 Forge)

Working events:
- `PlayerEvents.loggedIn`, `PlayerEvents.inventoryChanged`
- `ServerEvents.recipes`, `ServerEvents.tick`
- `EntityEvents.spawned`, `EntityEvents.death`
- `LootJS.modifiers`

NOT available (will crash):
- `PlayerEvents.pickedUpItem`, `PlayerEvents.death`, `PlayerEvents.changeDimension`
- `AStagesEvents` (use command-based approach instead)
- `MoreJS` (not installed)

## Workflow

- Work on `main` branch (single developer, no PR workflow needed)
- Always commit AND push changes — the repo syncs to a Windows gaming PC via GitHub Desktop
- Changes not pushed will not reach the game

## Design Document Protocol

The master design document lives at `wiki/design/master.md`. When any design changes are made during a session:
1. Update the relevant section in `wiki/design/master.md`
2. Add an entry to `wiki/design/changelog.md` with date, what changed, and why
3. Commit the wiki changes along with the implementation

## Development Rules

### Shell Script Testing
When modifying any `.sh` script, always run `bash -n <script>` on the Linux host to syntax-check before committing. The user does not have a Linux terminal — Claude's host is the only place to validate.

### Trans Flag Color Scheme
Any 5-line title banner (`===`, title, version, edition, `===`) in scripts MUST use trans flag colors:
- Line 1 & 5 (`===`): Blue `#5BCEFA` / ANSI `38;2;91;206;250`
- Line 2 & 4 (title/edition): Pink `#F5A9B8` / ANSI `38;2;245;169;184`
- Line 3 (version): White `#FFFFFF` / ANSI `38;2;255;255;255`

Windows: `[Console]::Write()` with VT processing enabled via P/Invoke.
Linux: Standard `\033[38;2;R;G;Bm` ANSI codes.
PS1 files: No banners — the bat handles display.

### Custom Bundled JARs
Some mods are built from source or manually bundled — they don't have `.pw.toml` entries and are NOT managed by packwiz. These JARs are committed directly to the repo and must be added to the **custom JAR allowlist** in the stale cleanup logic in both `iridescentserver.bat` and `sync_from_repo.bat`, or the self-updater will delete them.

Current custom JARs:
- `iridescent_codex_data.jar` — Patchouli Codex book, shipped as a **javafml content mod** with a minimal compiled `@Mod` class. **modId MUST be `"icraft"`** to match the book.json path at `data/icraft/patchouli_books/iridescent_codex/book.json` — Patchouli's `BookRegistry.init()` scans `data/{modId}/patchouli_books/`, so a modId mismatch means the book is silently never registered (confirmed 2026-04-19: earlier attempts using modId `iridescent_codex_data` produced "Invalid book" tooltips because Patchouli was looking in `data/iridescent_codex_data/patchouli_books/` which doesn't exist in our jar). Build pipeline in `datapack_sources/iridescent_codex/`: `src/com/iridescentcraft/codex/IridescentCodex.java` is the `@Mod("icraft")` entrypoint, `stub/net/minecraftforge/fml/common/Mod.java` is an annotation stub so javac can compile without the Forge jar on classpath (only `IridescentCodex.class` ends up in the jar). `build_codex.sh` compiles + packs + deploys to all 3 distros; jar FILENAME remains `iridescent_codex_data.jar` so the custom-JAR allowlists don't need updating. KubeJS `data/` + `assets/` copies are kept as a harmless fallback.
- `iridescent_origins-1.0.0.jar` — Origins/races/classes (built from `iridescent-origins-mod/`)
- `iridescent_biomes-1.0.0.jar` — Custom TerraBlender region registration for iridescent_biomes:cherry_river_valley + iridescent_biomes:cherry_mountains. TerraBlender 3.x on 1.20.1 needs Java-side region registration via explicit Climate.ParameterPoints; datapacks alone can't assign parameter points. Built from `iridescent-biomes-mod/` via `./gradlew build` (ForgeGradle toolchain). Biome JSONs + `is_overworld` + `is_mountain` tags + en_us lang entries ship inside the jar under `data/iridescent_biomes/...` (biome namespace MUST match modId — see lessons-learned 2026-04-23). **If you delete this jar, the custom biomes will stop spawning** (but stay registered — Nature's Compass will show them with empty Dimension). Bumping biome content or parameter points requires a rebuild.
- `mek_walkable_cables-1.0.1.jar` — Mekanism cable coremod
- `offlineskins-1.20.1-v1.jar` — Offline skin support
- `zeta_racefix-1.0.0.jar` — Race selection fix
- `Patchouli-1.20.1-85-FORGE.jar` — Bytecode patched: athrow→pop in Book.class (disables use_resource_pack enforcement)
- `ars_nouveau-1.20.1-4.12.7-all.jar` — Bytecode patched: doApply→immediate return in DungeonLootEnhancerModifier.class (disables chest loot injection)

### JVM Requirement: -noverify
Both bytecode-patched JARs (Patchouli, Ars Nouveau) create dead code paths that the JVM verifier rejects. The `-noverify` flag is REQUIRED on both client and server:
- **Server:** Already in `iridescentserver.bat` JVM args
- **Client:** Must be added manually in PrismLauncher: Instance → Settings → Java → JVM arguments → `-noverify`
This flag is deprecated in Java 17 but functional. It prints a warning but does not affect gameplay.

When adding a new custom JAR:
1. Add the JAR to `mods/` in all three distributions
2. Add the filename to the `$customJars` array in `iridescentserver.bat` (stale cleanup section)
3. Add the filename to the `$customJars` array in `sync_from_repo.bat` (stale cleanup section)
4. Add the filename to `CUSTOM_JARS` in `update_mods.sh`

### Distribution Sync
All changes to kubejs, configs, datapacks, or lang files must be synced to all three distributions: main instance, server_distribution, distribution/client.

### Mod Index Side Labels
The `side` field in `.pw.toml` files has DIFFERENT meanings per distribution:
- **Server distribution** (`server_distribution/mods/.index/`): `side = 'client'` mods are SKIPPED (rendering, UI mods not needed on dedicated server)
- **Client distribution** (`distribution/client/mods/.index/`): `side = 'server'` mods are SKIPPED (the installer doesn't download them)
- Almost ALL mods should be `side = 'both'` in the client distribution. Only true server-admin tools should be `side = 'server'`.
- When copying `.index/` between distributions, verify `side` labels are correct for each context.

### Server Mod Compatibility Audit
When adding new mods or after batch updates, audit mods for dedicated server compatibility. Mods that reference client-only classes (`Screen`, `MouseHandler`, `Minecraft`, rendering classes) will crash the dedicated server. For each new mod:
1. Check if the mod explicitly supports dedicated servers (CurseForge/Modrinth page)
2. If uncertain, check the mod's mixins/code for client class references
3. Client-only mods must be: marked `side = 'client'` in server `.pw.toml`, added to `strip_client_mods.bat/.sh`, and added to force-skip lists in `server_install.ps1`, `update_mods.ps1`, `update_mods.sh`

Known server-incompatible mods (crash on dedicated server):
- MCA Social Expansion (references `Screen` in network registration)
- Embeddium, Oculus, ImmediatelyFast (rendering engines)
- KubeJS Offline, Light Overlay, Equipment Compare, Chat Heads (client GUI)
- ProbeJS (dev tool), Iron's Spells JS addon (client class refs)
- Better Animations, Transmog (client cosmetic)

### Script Parity (.bat ↔ .sh)
Every `.bat` script in server_distribution/ and distribution/client/ must have a matching `.sh` with identical logic. When modifying a `.bat`, always update the `.sh` counterpart (and vice versa). Run `bash -n` on the `.sh` to syntax-check.

### Wiki Updates (MANDATORY after every major change)
After every major change (new features, balance changes, new items/origins/classes, system reworks, mod additions/removals, config changes, bug fixes), update ALL of the following before the session ends:
1. **Changelog** (`wiki/design/changelog.md`) — dated entry with what changed and why. DO NOT defer this.
2. **Known issues** (`wiki/known-issues/tracker.md`) — add new issues, mark resolved ones
3. **Internal wiki** (`wiki/` directory) — relevant overview pages (mods, systems, classes, etc.)
4. **Design doc** (`wiki/design/master.md`) — update affected sections when initial design is modified
5. **Public GitHub wiki** — clone `https://github.com/silvariasereneblossom/IridescentCraft.wiki.git` to `/tmp/icraft-wiki`, update matching pages, commit and push. Uses `[[Page Name]]` link syntax (not file paths). Sidebar is `_Sidebar.md`.

**Internal-only pages (do NOT mirror to the public wiki):**
- `wiki/dev/lessons-learned.md` — postmortem log for stalled/failed implementations. Contains candid retro notes that belong in the engineering log, not on the user-facing wiki.
- `wiki/dev/deployment-and-utility-guide.md` — internal deployment reference (phase0_sync internals, custom-jar allowlist, utility scripts). Names private paths/network shares.
- `wiki/dev/code-review-2026-04-23.md` — full-codebase code review findings; names internal issues and followups.

When mirroring, skip any page whose top includes the HTML comment `<!-- INTERNAL ONLY -->` or is listed above.

This is a blocking requirement — changelogs must be updated in the same session as the changes, not deferred to later.

### Memory Updates
After significant design changes, update relevant memory files in `/root/.claude/projects/-root/memory/` so future sessions have accurate context.

## Protocols

| Protocol | Description | File |
|----------|-------------|------|
| 1 | Full harmonization pass | `protocols/1-harmonize.md` |
| 2 | Random-sample spot-check | `protocols/2-spot-check.md` |
| 6 | Homepage coverage check | `protocols/6-homepage-coverage.md` |
| 7 | World pre-generation (Chunky) | `protocols/7-pregen.md` |
| 8 | PrismLauncher pre-launch client sync | `protocols/8-client-sync.md` |
