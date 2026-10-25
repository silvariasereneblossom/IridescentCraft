# IridescentCraft: Client Distribution

## Installation
Run `iridescentcraft.bat` (Windows) or `iridescentcraft.sh` (Linux) from this folder; the
[Tester Installation Guide](https://iridescentcraft.sereneblossom.gay/)
has the steps. On Windows the installer creates the PrismLauncher instance (downloading a portable PrismLauncher if
it finds none) and sets the pre-launch sync; on Linux the script builds a Modrinth pack for PrismLauncher to import.

Importing or copying this folder by hand does not work: `mods/` holds only the pack's own jars and the mod index
(`mods/.index/`), and PrismLauncher does not read that index. The third-party mods come from the installer and the
pre-launch sync.

## Requirements
- Minecraft 1.20.1
- Forge 47.4.6+
- Java 17
- 8-12GB RAM recommended (JVM args: -Xms4G -Xmx10G)

## What is IridescentCraft?
A 458-mod, progression-focused, expert-lite modpack with:
- 4-tier progression system (Bronze Age → God-Killer → Space)
- 13 RPG classes, 11 races, 13 Origins
- 29 custom enchantments, 88 Apotheosis affixes
- 27 Tetra modded materials
- 5 Ad Astra planets (post-endgame)
- A custom food and hunger system that rewards varied cooking
- An inverted End (explore first, fight the dragon last)
