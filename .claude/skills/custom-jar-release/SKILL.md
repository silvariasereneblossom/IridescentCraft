---
name: custom-jar-release
description: >-
  Build, deploy, and release an IridescentCraft custom mod jar (the in-house
  iridescent_* mods + managed forks like justlevelingfork) the correct,
  footgun-free way: wsl-build -> regen the custom_jars manifest -> commit the 3
  deployed jars + 3 manifests -> push. Also DIAGNOSES "stale jar" situations and
  handles the version-bump lockstep. USE THIS SKILL whenever the user wants to
  rebuild, redeploy, or ship a custom jar; bump a custom mod's version; or asks
  why a custom jar shows up as "stale", got removed, or isn't reaching the
  instance/server — even if they only say "rebuild the relics mod" or "redeploy
  iridescent_tetra_expansion" without mentioning the manifest. Skipping the
  manifest regen or the version lockstep SILENTLY breaks deployment, so always
  route these through here.
---

# Custom-jar release (IridescentCraft)

## Why this is error-prone (read first)

The in-house mods (`iridescent_*`) and a few managed forks (`justlevelingfork-*`, etc.) are **git-ignored as build artifacts but force-committed as deployed jars**. They do NOT reach the live instance/server via packwiz download — their `.pw.toml` has an empty `url`, it's only a *presence marker*. They transport via **two coupled things**:

1. the deployed jar committed into each of the **3 distro `mods/` folders**, and
2. **`custom_jars_manifest.json`** (SHA-256 + size), which the tester's/server's `cleanup_stale_jars.ps1` hash-verifies.

So a rebuild that changes jar **content** but keeps the same **filename** will NOT propagate unless the manifest is regenerated — the single most common miss, and the cause of every "why does it show stale / why didn't my change reach the server" confusion. This skill encodes the cycle so that never happens.

## Paths (this pack)

- Mod source / build: `…\IridescentcraftDev\IridescentCraft\<iridescent-X-mod>\` → build via that mod's `wsl-build.sh`.
- Repo root (commits): `…\IridescentcraftDev\IridescentCraft\` (call it `<repo>`).
- 3 distro mods dirs: `.minecraft/mods`, `.minecraft/server_distribution/mods`, `.minecraft/distribution/client/mods`.
- 3 manifests: `.minecraft/custom_jars_manifest.json` + the same file under `server_distribution/` and `distribution/client/`.
- Tooling: `.minecraft/dev/regen_custom_jars_manifest.ps1`, `.minecraft/dev/sync-distros.ps1`.
- Allowlist: `cleanup_stale_jars.ps1` ships in `server_distribution/` AND `distribution/client/`; its `$customJars` list must contain the jar.
- compileOnly build-dep cache (auto-staged into the mod's `libs/`): the PrismLauncher instance mods, `…\AppData\Roaming\PrismLauncher\instances\IridescentCraft\.minecraft\mods`.

## Build via WSL (native gradle is dead here)

Native Windows gradle fails on this host (task #39 — AF_UNIX EINVAL, JDK17/Win11). Every custom mod builds via its `wsl-build.sh` (WSL2 + JDK17, gradle 8.7). From PowerShell:

```
wsl bash -lc "cd /mnt/c/Users/silvariazemaitis/IridescentcraftDev/IridescentCraft/<mod> && ./wsl-build.sh"
```
Flags: *(none)* = build + deploy to all 3 distro `mods/`; `--no-deploy` = compile-verify only; `--clean` = gradle clean first. `wsl-build.sh` also auto-stages compileOnly libs (curios/relics/octolib/…) into the mod's `libs/` from the instance mods.

## Scenario A — same-version rebuild (the common case)

Content changed, filename/version unchanged (a data tweak or small fix at the same version, e.g. `1.0.0`):

1. **Build + deploy:** `wsl bash -lc "cd /mnt/c/.../<mod> && ./wsl-build.sh"`. Confirm `BUILD SUCCESSFUL` and the three `-> …/mods/<jar>` deploy lines.
2. **Regen the manifest:** `& '<repo>\.minecraft\dev\regen_custom_jars_manifest.ps1'`. It re-hashes every allowlisted custom jar and rewrites all 3 manifests. Confirm the jar's NEW sha/size prints.
3. **Sync distros ONLY if you also changed kubejs:** `sync-distros.ps1 -Fix` mirrors `kubejs/{startup,server}_scripts` — NOT mods or datapacks. For a pure jar rebuild it's a no-op; run it only if this change also touched a server/startup script.
4. **Stage explicitly (jars are tracked), commit, push:**
```
git -C <repo> add <mod-dir>
git -C <repo> add .minecraft/custom_jars_manifest.json .minecraft/server_distribution/custom_jars_manifest.json .minecraft/distribution/client/custom_jars_manifest.json
git -C <repo> add .minecraft/mods/<jar> .minecraft/server_distribution/mods/<jar> .minecraft/distribution/client/mods/<jar>
git -C <repo> commit -m "<mod>: <what changed>"
git -C <repo> push origin main
```
The pre-push hook regenerates `Mod-List.md`; if it blocks the push, `git add .minecraft/wiki/Mod-List.md` + commit + re-push. Never `--no-verify`. (CRLF warnings are normal — the repo's `.gitattributes` normalizes them.)

## Scenario B — version bump (filename changes): the lockstep

Bumping the version (e.g. `1.0.0 → 1.1.0`) changes the jar **filename**, and these must move **together** or the deploy silently breaks — a missed allowlist entry purges the new jar as "not allowlisted"; a missed manifest entry hash-fails it:

1. **`<mod>/gradle.properties`** → `mod_version` (drives the output filename).
2. **`<mod>/wsl-build.sh`** → `JAR_NAME` (deploy target + the stale-old-jar cleanup pattern).
3. **`.minecraft/dev/regen_custom_jars_manifest.ps1`** → `$customJars` (replace old filename → new), then run it.
4. **`cleanup_stale_jars.ps1`** → `$customJars` allowlist — replace the filename. **Edit BOTH copies** (`server_distribution/` + `distribution/client/`).
5. **`<mod>.pw.toml`** in `mods/.index/` → `filename`; mirror to both distro `.index/` folders.

Then run Scenario A (build + regen + commit). `git rm` the old-named jar from the 3 mods dirs and `git add` the new one.

## Diagnosing "this custom jar shows stale" / "it got removed"

`cleanup_stale_jars.ps1` runs two relevant layers: **HASH-VERIFY** (removes a custom jar whose on-disk SHA ≠ the manifest SHA → next sync re-fetches the canonical one) and **ALLOWLIST-or-PURGE** (removes jars in no `mods/.index/*.pw.toml` and not in `$customJars`).

- **"X-1.0.0.jar is stale" right after you rebuilt it = WORKING AS DESIGNED.** Same filename, new content → the consumer's older copy's SHA ≠ the freshly-regenerated manifest → removed so it re-fetches. The *name* didn't change; the *SHA* did. The fix is on the consumer side: relaunch the instance / restart the server to re-sync.
- **Jar vanished from the instance/server entirely** = the hash-verify removed the old copy and the re-deploy hasn't run yet. Relaunch the instance (its pre-launch `sync_client` re-copies the current jar from the repo) or restart the server.
- **Self-consistency check (repo must be internally clean):** `(Get-FileHash '<repo>\.minecraft\mods\<jar>' -Algorithm SHA256).Hash.ToLower()` should equal the `sha256` for that jar in `custom_jars_manifest.json` — and all 3 deployed copies + all 3 manifests should agree. If they don't, you forgot step 2 (regen) after a rebuild.

## Footguns (each cost at least one session)

- **Forgetting the manifest regen** after a same-version rebuild → the new content never reaches testers/server (silent). Always regen after any build whose content changed.
- **Version bump without the full lockstep** → silent stale-delete (allowlist miss) or hash-fail (manifest miss). All five places, every time; the two `cleanup_stale_jars.ps1` copies are the easiest to forget.
- **Committing `libs/`** — those are compileOnly deps `wsl-build.sh` re-stages from the instance mods; they belong in the mod's `.gitignore`, never the commit.
- **Assuming `sync-distros.ps1 -Fix` deploys the jar** — it does NOT; it only mirrors kubejs scripts. The jar is deployed by `wsl-build.sh` to all 3 mods dirs.
- **The pre-push `Mod-List.md` gate** — a mod/side change makes the hook regenerate it and reject the push; commit the regenerated `Mod-List.md` and re-push.

## Worked example — same-version rebuild of iridescent_relics

```
wsl bash -lc "cd /mnt/c/Users/silvariazemaitis/IridescentcraftDev/IridescentCraft/iridescent-relics-mod && ./wsl-build.sh"
#   -> BUILD SUCCESSFUL; deployed to 3 mods/
& 'C:\Users\silvariazemaitis\IridescentcraftDev\IridescentCraft\.minecraft\dev\regen_custom_jars_manifest.ps1'
#   -> prints the new sha for iridescent_relics-1.0.0.jar across all 3 manifests
$r = 'C:\Users\silvariazemaitis\IridescentcraftDev\IridescentCraft'
git -C $r add iridescent-relics-mod `
  .minecraft/custom_jars_manifest.json .minecraft/server_distribution/custom_jars_manifest.json .minecraft/distribution/client/custom_jars_manifest.json `
  .minecraft/mods/iridescent_relics-1.0.0.jar .minecraft/server_distribution/mods/iridescent_relics-1.0.0.jar .minecraft/distribution/client/mods/iridescent_relics-1.0.0.jar
git -C $r commit -m "iridescent_relics: <what changed>"
git -C $r push origin main   # if the hook rejects: git add .minecraft/wiki/Mod-List.md, commit, re-push
```
