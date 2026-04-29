# Iridescent Aptitudes — Fork Status

Forked from [Senior-S/JustLeveling-Fork](https://github.com/Senior-S/JustLeveling-Fork) on 2026-04-29 (commit at fork point: master HEAD).

## Why fork?

The pack's redesigned MAG aptitude line (Mana Spark / Conservation of Magic /
Mana Blaze / dynamic Mystic Ward / Mana Inferno) was layered on top of JLFork
via KubeJS — but JLFork's hardcoded passives (Magic Resist, Beneficial Effect
on MAG) and hardcoded skill effects (Life Eater, Wormhole Storage, Safe Port
firing alongside our re-labeled "Mystic Ward" / "Mana Inferno" / "Arcane
Efficiency" overrides) caused the in-game UI and behavior to diverge from
the design. Patching upstream via mixin coremod would scale poorly across
JLFork updates; forking gives us full control of:

- Passive → aptitude mapping (move Magic Resist off MAG, etc.)
- Native skill effects (strip them; KubeJS handles gameplay)
- Level thresholds (5/10/15/20/30 instead of upstream's 8/16/24)
- Future skill slot expansion

## Status

| Phase | State |
|---|---|
| Source clone + gradle simplification | done |
| NOTICE / attribution per Apache 2.0 | done |
| Branding (display name, version, authors) | done |
| Strip unneeded integrations (gun mods, KubeJS plugin, BetterCombat, L2Tabs) | done |
| **Build environment fully wired** | **done** — l2library + yacl in libs/; quilt repo added; clean build |
| Passive remap (Magic Resist off MAG, etc.) | not started |
| Native skill effect stripping | not started |
| 5/10/15/20/30 threshold change | not started |
| Replace upstream JLFork in mods/ | not started |
| Codex entry + changelog + allowlist updates | not started |

**Build verified 2026-04-29:** `./gradlew build` produces
`build/libs/justlevelingfork-1.2.1-iridescent.1.jar` (~463 KB, 285 files)
without errors. Foundation is now compile-ready for customization.

## Build dependencies (in libs/)

All required jars are in `libs/`:
- `curios-forge-5.14.1-1.20.1.jar`
- `irons_spellbooks-1.20.1-3.15.5.1.jar`
- `tetra-1.20.1-6.12.0.jar`
- `mutil-1.20.1-6.3.0.jar`
- `l2library-2.4.28.jar` (from modrinth.com/mod/l2library)
- `yet_another_config_lib_v3-3.6.6+1.20.1-forge.jar` (from biomes-mod cache)

L2Tabs was stripped entirely from the source (no Modrinth/CurseForge
release for 1.20.1 Forge that we could find). The aptitude tab UI in the
inventory is now driven directly by JLFork's own `DrawTabs` rendering;
players access aptitudes via the Y keybind.

`build/libs/justlevelingfork-1.2.1-iridescent.1.jar` is the deployable
artifact (built via `./gradlew build`).

## What's NOT in the fork (stripped from upstream)

- Gun-mod integrations (TacZ, Crayfish, Scorched Guns 2, BetterCombat,
  PointBlank). Source files removed; JustLevelingFork.java event-bus
  registrations stripped; build.gradle deps removed.
- KubeJS plugin subpackage (`com/seniors/justlevelingfork/kubejs/`).
  IridescentCraft's KubeJS scripts read aptitude NBT directly via
  `ForgeData.justlevelingfork.aptitude.<name>` — no plugin event bus needed.
  KubeJSIntegration.java retained (uses Class.forName so compiles without
  KubeJS classpath presence).
- ParchmentMC mappings — switched to `mappings channel: 'official'` for
  build simplicity; integrations resolved from `libs/` flatDir.
- Modrinth + CurseForge publishing tasks (we deploy locally via
  build_mod.sh, no need to publish).

## Next session checklist

1. Acquire l2library + l2tabs + yacl jars, drop into `libs/`.
2. Try `./gradlew build` — chase down any remaining compile errors.
3. Once clean: customize `RegistryPassives.java` (passive reassignment).
4. Strip native skill effect bodies in `registry/skills/*.java` so they're
   no-ops (or only fire when KubeJS hasn't already handled them).
5. Adjust `Aptitude.java` thresholds from 8/16/24 to 5/10/15/20/30.
6. Build → drop in mods/ → playtest → iterate.
7. When stable: replace `justlevelingfork-1.2.1.jar` everywhere, update
   custom-JAR allowlists in 7+ files, codex entry, changelog.
