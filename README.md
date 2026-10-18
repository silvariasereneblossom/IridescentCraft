# IridescentCraft

A 420-mod progression-focused Forge 1.20.1 modpack. It is in alpha and is being playtested by a small group.

[Wiki / design docs](https://github.com/silvariasereneblossom/IridescentCraft/wiki) · [Known issues](https://github.com/silvariasereneblossom/IridescentCraft/blob/main/.minecraft/wiki/known-issues/tracker.md) · [Changelog](https://github.com/silvariasereneblossom/IridescentCraft/blob/main/.minecraft/wiki/design/changelog.md)

## Install (testers, easiest)

1. Right-click **[`iridescentcraft.bat`](https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/distribution/client/iridescentcraft.bat)**, choose *Save link as*, and save it to any folder you like (Desktop, Downloads, anywhere).
2. Double-click the bat. It will:
   - Download and install PrismLauncher if you don't have it
   - Create the IridescentCraft instance with all 420+ mods
   - Configure the per-launch sync hook so your pack stays current automatically
   - Set the required JVM flags
3. Open PrismLauncher, click IridescentCraft, then click Launch.

If you ran the installer before today's bat update, run it **once more** to pick up the new auto-sync wiring.

### Joining the test server

The test server has a whitelist. Before your first join, send the server operator your **exact in-game name**, capitals included, and wait for them to confirm you were added.

- **"You are not white-listed on this server!"** means your name is not on the list yet, or it was entered with different capitals. Send the operator the name exactly as the game shows it.
- If you change your in-game name, you have to be added again under the new one.

## Install (manual / advanced)

1. Install Forge 1.20.1-47.4.6 + Java 17.
2. Clone or download the repo.
3. Copy the `.minecraft/mods/`, `.minecraft/config/`, `.minecraft/defaultconfigs/`, `.minecraft/kubejs/`, `.minecraft/global_packs/` folders into your instance's `.minecraft`.
4. Launch with JVM args including `-noverify` (required for the bytecode-patched Patchouli + Ars Nouveau jars).

## What's in it

- 4-tier progression (Bronze Age → God-Killer → Space) with stage-gated recipes and dimensions
- 10 RPG classes, 11 custom races and 13 Origins, chosen in three prompts on first join
- A custom skill system (Pufferfish's Skills + Iridescent Aptitudes) with 28 hand-tuned skill nodes across 8 aptitudes
- Modular armor (Iridescent Reforging): a Tetra-style modular armor framework that keeps a specialized armor's identity through reforging. It covers ~42 specialty armor sets (ISS robes, Aether, Twilight Forest, Cataclysm, Aquaculture, Botania, etc.)
- Modular spellbooks (Iridescent Modular Spells): Tetra-modular Iron's Spellbooks and Ars Nouveau books with 5-level honing per slot
- Death penalty: armor and tools go inert at zero durability instead of being destroyed, and can be salvaged
- Inverted End: explore first, fight the dragon last
- 5 Ad Astra planets as post-endgame
- The Apotheosis affix system, with 88 affixes across the loot pool
- 29 custom enchantments with proper tooltips
- Custom food and hunger rules that reward varied cooking

## Requirements

- Minecraft 1.20.1
- Forge 47.4.6+
- Java 17 (Adoptium recommended)
- 8-12 GB RAM (default JVM args: `-Xms4G -Xmx10G -noverify`)

## Status

The pack is in alpha and under active development, so expect bugs. Please report them on Discord (or as GitHub issues if you have access). Back up your saves before updates, because data formats can change between cycles.

The pack syncs itself on every launch through a per-instance pre-launch hook that the installer sets up. New tester instances pick up updates automatically, so routine pack changes need no manual reinstall.

## License / credits

All mod licenses retained per their original mods. Custom code in `iridescent-*-mod/` directories is the author's. See individual mod credits via the in-game `Iridescent Codex` Patchouli book.
