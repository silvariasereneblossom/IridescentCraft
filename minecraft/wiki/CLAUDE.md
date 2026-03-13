# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## What This Is

IridescentCraft is a 420-mod Minecraft 1.20.1 Forge modpack with RPG progression systems. This wiki is the living documentation for all design systems, implementation status, and known issues. It is maintained as markdown files in the repo and synced via git.

## Repository Structure

- `wiki/home.md` — Wiki homepage with section index and implementation status
- `wiki/design/master.md` — **Master design document** (canonical source of truth for all systems)
- `wiki/design/changelog.md` — Log of all design changes made across sessions
- `wiki/progression/overview.md` — Tier system, dimension gates, quest structure
- `wiki/classes/overview.md` — 10 classes, 7+ races, glass cannon mechanics
- `wiki/systems/overview.md` — Death penalty, scaling, enchantments, affixes, skills, loot
- `wiki/kubejs/overview.md` — Script reference, event compatibility, datapack loading
- `wiki/mods/overview.md` — Key mods by tier, config changes
- `wiki/known-issues/tracker.md` — Active bugs, verification needed, resolved issues
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

## Protocols

| Protocol | Description | File |
|----------|-------------|------|
| 1 | Full harmonization pass | `protocols/1-harmonize.md` |
| 2 | Random-sample spot-check | `protocols/2-spot-check.md` |
| 6 | Homepage coverage check | `protocols/6-homepage-coverage.md` |
