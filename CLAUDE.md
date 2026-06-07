# IridescentCraft — agent operating brief

Minecraft **1.20.1 Forge** modpack. **This repo is the source of truth:** the live client (PrismLauncher instance) and the dedicated server re-sync to **pushed `main` HEAD**, so a change isn't testable until it's committed **and pushed**.

**Planning/execution split:** if you were spawned for one scoped task, you're an **execution session** — planning happens in a separate session. Do the task, ship it, update `current-state.md`, report back. If a **design decision** surfaces (gameplay / tiering / dropping a mod / anything non-obvious), **stop and report** rather than deciding it yourself.

## Standing rules (non-negotiable)
- **Push to `main` automatically right after committing** — solo, direct-to-main, no PR, no review workflow, no asking. Safety = atomic, well-described, revertable commits. Your commits must reach **`origin/main`** (the only ref the live client/server pull); if you're on a spawned worktree branch, push it straight to main. Never `--no-verify`.
- **NO `Co-Authored-By` line** on commits.
- **Push the internal repo automatically too** (path below) when you touch it.
- **Commit-first to test:** never hot-edit the PrismLauncher instance or expect an unpushed change to show in-game — the prelaunch sync overwrites it. Roll back by reverting the commit, not by patching the instance.
- Pre-push hook blocks on a regenerated `Mod-List.md`? → `git add .minecraft/wiki/Mod-List.md`, commit, re-push.

## Build & deploy
- **Host gradle is dead** (#39). Build custom mods via each mod's `wsl-build.sh` (WSL2 + JDK17); it deploys to all 3 distro `mods/` and runs the data preprocessors.
- `iridescent_*` jars are git-ignored artifacts **force-committed** into 3 distro `mods/` + tracked in `custom_jars_manifest.json` (regen after ANY content change, even at the same filename). **Route every jar rebuild/redeploy through the `custom-jar-release` skill** — skipping the manifest regen silently breaks delivery.

## Skills (`.claude/skills/`, auto-surface by topic)
- **`custom-jar-release`** — jar build → manifest regen → commit/push; stale-jar diagnosis; version-bump lockstep.
- **`dedicated-server-triage`** — server crash-on-load, client-only-mod-on-server, the `ICRAFT_SERVICE_MODE` sync trap, re-sync + restart.
- **`tetra-module-wiring`** — Tetra materials / modules / variants / schematics; the `**` attribute rule; the three material homes.

## Durable stores — internal repo `C:\Users\silvariazemaitis\IridescentcraftDev\IridescentCraft-internal`
Read for context; update after your commits, then push the internal repo:
- `planning\current-state.md` — live resume note. **Update after every commit and on "checkpoint."**
- `design\design-evolution.md` — design *decisions* (newest-first: Decision / Rationale / What changed / Status).
- `dev\lessons-learned.md` (Tetra work → `lessons-learned-Tetra.md`) — failures/fixes after lesson-worthy work (done by hand — no API auto-capture).
- `dev\failure-modes.md` — the canonical trap catalog (silent-failure ledger). **Consult before forming any bug theory; add a row after every burned hand, same session.**
- `dev\onboarding-first-week.md` — contributor syllabus + graduated starter tasks with ship checklists.

## Layout & testing
- 3 distros: `.minecraft\mods` · `.minecraft\server_distribution\` · `.minecraft\distribution\client\`. `sync-distros.ps1` mirrors `kubejs/{startup,server}_scripts`, `kubejs/assets`, `kubejs/data`, `config/paxi/datapacks`, the cleanup script (incl. the server-runtime seed copy), and gates manifest parity — mod configs and mods/ remain per-distro (configs legitimately differ; mods are packwiz/custom-jar managed).
- The operator runs in-game tests. When handing one off, give **paste-ready** `/give` `/summon` `/locate structure` `/tp` commands with **real IDs** looked up from the scripts/datapacks (don't guess); flag cosmetic-only breakage (e.g. a missing lang key) so they know the behavior still validates.

## Wiki
- Pages live under `.minecraft\wiki\` (a mapped subset → the public GitHub Wiki). **Public wiki = player-facing summaries; detailed dev info (script paths, line numbers, root-cause forensics, internal cleanup/deny-list patterns, local paths) stays in the private internal repo.**
- The public wiki **auto-syncs via the `sync-wiki.yml` GitHub Action** on push to `main` (runs `sync-wiki.py`, which also does pack→flat link conversion). **Do NOT manually push the `IridescentCraft.wiki` clone** — it's redundant and produces broken wiki links. Just push the modpack repo; the Action syncs the wiki.
