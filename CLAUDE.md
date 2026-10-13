# IridescentCraft — agent operating brief

Minecraft **1.20.1 Forge** modpack. **This repo is the source of truth:** the live client (PrismLauncher instance) and the dedicated server re-sync to **pushed `main` HEAD**, so a change isn't testable until it's committed **and pushed**.

**Planning/execution split:** if you were spawned for one scoped task, you're an **execution session** — planning happens in a separate session. Do the task, ship it, update `current-state.md`, report back (rule below). If a **design decision** surfaces (gameplay / tiering / dropping a mod / anything non-obvious), **stop and report** rather than deciding it yourself.

**Report back when done (standing rule, operator 2026-10-11):** every execution session ends by sending its close-out to the planning session with `SendMessage`. Find it with `ListAgents`; it is named **"IridescentCraft Dev"**.
- **The report covers:** what shipped (commit hashes) · what was verified and what was NOT · whether it is live on the server · decisions owed by the operator · where the in-game checks are.
- **Fallback:** if the planning session isn't listed, or the send is held or expires (sessions in different permission modes), put the same report at the top of `planning\current-state.md` (you update it anyway) and say so in your final message.
- **Stopping early** (usage limit, blocker)? Report that the same way. An unfinished chip that goes quiet is the failure this rule exists to prevent (2026-10-11: the backups chip sat half-built for five hours unnoticed).

## Standing rules (non-negotiable)
- **Push to `main` automatically right after committing** — solo, direct-to-main, no PR, no review workflow, no asking. Safety = atomic, well-described, revertable commits. Your commits must reach **`origin/main`** (the only ref the live client/server pull); if you're on a spawned worktree branch, push it straight to main. Never `--no-verify`.
- **NO `Co-Authored-By` line** on commits.
- **Push the internal repo automatically too** (path below) when you touch it.
- **Commit-first to test:** never hot-edit the PrismLauncher instance or expect an unpushed change to show in-game — the prelaunch sync overwrites it. Roll back by reverting the commit, not by patching the instance.
- **The pre-push hook is installed per clone** (`.minecraft\dev\install-hooks.ps1 -Install`; a worktree uses its clone's hook, and the installed hook is a copy of the template: re-install after the template changes). It runs `Mod-List.md`, the mod index gate, the mod intake gate, the registry snapshot check, the quest validator, the script lints with their ratchet comparison, the engine suite (`run.py fast`) and `sync-distros.ps1`; most blocks run only when the push touches their files. Blocked on a regenerated `Mod-List.md`? → `git add .minecraft/wiki/Mod-List.md`, commit, re-push. Every suite by hand: `python .minecraft\dev\engine-tests\run.py all`.
- **A third-party mod is added, updated or removed only through `.minecraft\dev\mods\intake.py`** (`add`, `update`, `remove`; procedure in `.minecraft\dev\mods\README.md`), never by copying or editing a metafile by hand: the pre-push hook and CI refuse a mod with no intake record and a new mod with an open decision. Which mods the pack carries, and every answer to a record's decision, is the operator's: report the record, do not answer it.

## Build & deploy
- **Host gradle is dead** (#39). Build custom mods via each mod's `wsl-build.sh` (WSL2 + JDK17); it deploys to all 3 distro `mods/` and runs the data preprocessors.
- `iridescent_*` jars are git-ignored artifacts **force-committed** into 3 distro `mods/` + tracked in `custom_jars_manifest.json` (regen after ANY content change, even at the same filename). **Route every jar rebuild/redeploy through the `custom-jar-release` skill** — skipping the manifest regen silently breaks delivery.
- **A custom jar released under a NEW file name** also needs, before the push: the registry snapshot refreshed from the release commit (`boot.ps1 -Ref <commit> -WriteSnapshot`, commit `dev\registry`) and its intake record moved (`intake.py update <mod> <the released jar>`). A rebuild under the same name needs neither.

## Skills (`.claude/skills/`, auto-surface by topic)
- **`custom-jar-release`** — jar build → manifest regen → commit/push; stale-jar diagnosis; version-bump lockstep.
- **`dedicated-server-triage`** — server crash-on-load, client-only-mod-on-server, the `ICRAFT_SERVICE_MODE` sync trap, re-sync + restart.
- **`mod-intake`** — add, update, remove or audit a third-party mod through `.minecraft\dev\mods\intake.py`: metafile, generated indexes, boot diff, intake record, decisions applied through the boss and dimension registries; the hook's `[mod-intake] FAIL` lines.
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
