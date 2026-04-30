# IridescentCraft

A 420-mod progression-focused Forge 1.20.1 modpack. Currently in **alpha** — being playtested by a small group.

[**Wiki / design docs**](https://github.com/silvariasereneblossom/IridescentCraft/wiki) · [Known issues](https://github.com/silvariasereneblossom/IridescentCraft/blob/main/.minecraft/wiki/known-issues/tracker.md) · [Changelog](https://github.com/silvariasereneblossom/IridescentCraft/blob/main/.minecraft/wiki/design/changelog.md)

## Install (testers — easiest)

1. Right-click → Save link as → save **[`iridescentcraft.bat`](https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/distribution/client/iridescentcraft.bat)** to a folder of your choice (Desktop, Downloads, anywhere).
2. Double-click the bat. It will:
   - Download and install PrismLauncher if you don't have it
   - Create the IridescentCraft instance with all 420+ mods
   - Configure the per-launch sync hook so your pack stays current automatically
   - Set the required JVM flags
3. Open PrismLauncher → click IridescentCraft → Launch.

If you ran the installer before today's bat update, **re-running it once** will pick up the new auto-sync wiring.

## Install (manual / advanced)

1. Install Forge 1.20.1-47.4.6 + Java 17.
2. Clone or download the repo.
3. Copy the `.minecraft/mods/`, `.minecraft/config/`, `.minecraft/defaultconfigs/`, `.minecraft/kubejs/`, `.minecraft/global_packs/` folders into your instance's `.minecraft`.
4. Launch with JVM args including `-noverify` (required for the bytecode-patched Patchouli + Ars Nouveau jars).

## What's in it

- **4-tier progression** (Bronze Age → God-Killer → Space) with stage-gated recipes and dimensions
- **10 RPG classes, 11 custom races, 13 Origins** — three-prompt character creation on first join
- **Custom skill system** (Pufferfish's Skills + Iridescent Aptitudes) with 28 hand-tuned skill nodes across 8 aptitudes
- **Modular armor (Iridescent Reforging)** — Tetra-style modular armor framework that preserves specialized armor identity through reforging. ~42 specialty armor sets covered (ISS robes, Aether, Twilight Forest, Cataclysm, Aquaculture, Botania, etc.)
- **Modular spellbooks (Iridescent Modular Spells)** — Tetra-modular Iron's Spellbooks + Ars Nouveau books with 5-level honing per slot
- **Death penalty** — armor and tools go inert (not destroyed) on durability zero; salvageable
- **Inverted End** — explore first, fight the dragon last
- **5 Ad Astra planets** as post-endgame
- **Apotheosis** affix system, 88 affixes across the loot pool
- **29 custom enchantments** with proper tooltips
- **Custom food/hunger** rewarding diverse cooking

## Requirements

- Minecraft 1.20.1
- Forge 47.4.6+
- Java 17 (Adoptium recommended)
- 8-12 GB RAM (default JVM args: `-Xms4G -Xmx10G -noverify`)

## Status

Alpha. Active development. Bugs expected — please report via Discord (or GitHub issues if you have access). Save backups before updates; data formats can change between cycles.

The pack auto-syncs on launch via a per-instance pre-launch hook (set up by the installer). New tester instances pick up updates automatically; no manual re-installs needed for routine pack changes.

## License / credits

All mod licenses retained per their original mods. Custom code in `iridescent-*-mod/` directories is the author's. See individual mod credits via the in-game `Iridescent Codex` Patchouli book.
