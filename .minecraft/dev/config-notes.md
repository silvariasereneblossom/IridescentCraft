# Config notes

The pack's own notes on mod config files. A Forge config (`*.toml` built from a mod's `ForgeConfigSpec`) keeps
only the comments the mod's spec carries: at every load Forge compares each comment with the spec, and when one
differs it logs `Configuration file ... is not correct. Correcting` and writes the file again, comments from the
spec, values kept. On the server that happens at every deploy, since the sync puts the repo copy back. So a note
of the pack's own goes here, never into the `.toml`, and the three repo copies of such a file (`config/`,
`server_distribution/config/`, `distribution/client/config/`) are kept byte for byte as Forge writes them.

To see what Forge writes: boot the pack on the rig with `-Keep`
(`powershell -ExecutionPolicy Bypass -File .minecraft\dev\boot\boot.ps1 -Ref <commit> -Keep`) and read the file under
`/dev/shm/icraft-boot-<user>/run/config/` (WSL); `logs/debug.log` there names each key whose comment did not
match ("The comment on key ... does not match the spec").

## `config/everydayxp/rpgseteffects/rpgseteffects.toml` (RPG Set Effects, inside Class Artifacts)

`[gui] showInventoryButton = true` stays on. Class Artifacts builds its "Sets" button at (guiLeft+90, guiTop+60),
on top of the recipe-book button; `iridescent_tetra_expansion` (`SetsButtonAnchor`) re-anchors it every frame to
(guiLeft+126, guiTop+64), just right of the recipe-book button. It is the only GUI entry point to the Set Equipment
screen, where the artifact and relic slots live (keybind: Alt+Y; also `/icraftsets`).

This note stood in the `.toml` above `showInventoryButton` until 2026-10-15; Forge stripped it at every boot.

## `config/iridescent_difficulty-common.toml` (the pack's own difficulty mod)

The comments of this file are the mod's (`iridescent-difficulty-mod`, `DifficultyConfig.java`): to change one,
change the spec and release the jar (`custom-jar-release`), then copy what Forge writes into the three repo copies.
Until 2026-10-15 the repo copies carried a shortened `damageMultiplierPct` comment and Forge rewrote the file at
every boot.
