# =============================================================================
# install-hooks.ps1 - install the pre-push gate
#
# Writes a git pre-push hook that runs sync-distros.ps1 in detect-only mode
# (push fails if any watched path is out of mirror across the three distros),
# the mod index gate (dev/mods/mod_index.py check: the three mod indexes and
# the client-only skip lists are generated from .minecraft/mods/.index),
# the mod intake gate (dev/mods/intake.py check: every mod has an intake record
# and a new mod owes no decision)
# and, when a pushed commit touches a kubejs script, the three script lints
# (lint_kubejs_rhino.js, lint_kubejs_traps.js, lint_kubejs_scope.py; any flag
# blocks). Re-run with -Install after this template changes: the installed
# hook is a copy, it does not follow the repo.
# Bypass for emergencies: git push --no-verify.
#
# Run once after cloning the IridescentCraft repo on a new host:
#   pwsh .minecraft\dev\install-hooks.ps1
# =============================================================================

[CmdletBinding()]
param(
    # Explicit opt-in. Without -Install we only print what would happen.
    # Reason: this gate can be noisy on a tree with pre-existing divergence;
    # the user should run sync-distros.ps1 manually first, tune
    # sync-distros.config.json, and only then commit to the hook.
    [switch]$Install
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# .minecraft/dev/install-hooks.ps1 -> repo root is two levels up
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
# Ask git where hooks live: in a linked worktree .git is a file, and the hooks
# (shared by every worktree) sit in the main checkout's .git\hooks.
$HooksDir = Join-Path $RepoRoot ".git\hooks"
$gitHooks = "$(& git -C $RepoRoot rev-parse --git-path hooks 2>$null)".Trim()
if ($LASTEXITCODE -eq 0 -and $gitHooks) {
    if ([System.IO.Path]::IsPathRooted($gitHooks)) { $HooksDir = $gitHooks } else { $HooksDir = Join-Path $RepoRoot $gitHooks }
}

if (-not (Test-Path $HooksDir)) {
    Write-Error "[install-hooks] $HooksDir not found. Are you inside a git checkout?"
    exit 1
}

$PrePushPath = Join-Path $HooksDir "pre-push"
$hookContent = @'
#!/usr/bin/env bash
# IridescentCraft pre-push gate. Five checks, in order:
#   1. generate_modlist.ps1   - regenerate wiki/Mod-List.md from packwiz state
#   2. mirror-wiki.ps1        - propagate pack-side wiki/ -> ../IridescentCraft.wiki/
#   +  mods/mod_index.py check - the mod index gate (its own block, after step 2)
#   +  mods/intake.py check  - the mod intake gate: every mod of the index has an intake record,
#                                a new mod owes no decision (its own block, after the index gate)
#   +  boot/registry_current.py - is dev/registry still a snapshot of this pack's mods (its own
#                                block; only when a pushed commit touches the mod set or the snapshot)
#   +  validate_heracles_quests.py - the quest validator (its own block; only when a
#                                pushed commit touches config/heracles/ in any distro)
#   3. KubeJS script lints    - lint_kubejs_rhino.js, lint_kubejs_traps.js,
#                                lint_kubejs_scope.py; only when a pushed commit
#                                touches a kubejs script (or one of the lints)
#   +  lint_kubejs_traps.js --ratchet-base - the grandfathered counts of the commit being
#                                pushed against the commit it is based on (its own block)
#   3b. engine test suite     - dev/engine-tests/run.py fast + the method-ref
#                                validator; only when a script, a test or a
#                                pinned engine jar changed (blocking)
#   4. sync-distros.ps1       - verify the three distros stayed in sync
#   5. lessons-pre-push.ps1   - track commits-since-last-scan + optionally
#                                auto-invoke scan-lessons.ps1 / qa-lessons.ps1
# If steps 1-2 produce uncommitted changes, push is BLOCKED so author commits.
# Step 3 blocks on any flag, and on a lint that could not run (no node / python):
# these are script patterns that load without an error and never work in game.
# Step 4 fails on divergence. Step 5 never blocks (best-effort instrumentation).
# Bypass for emergencies: git push --no-verify.

# git feeds "<local ref> <local sha> <remote ref> <remote sha>" per pushed ref on
# stdin. Read it first: any later command could swallow it. (Run by hand from a
# terminal there is nothing to read, and `cat` would wait for the keyboard.)
PUSHED=""
if [ ! -t 0 ]; then PUSHED="$(cat)"; fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
DEV="$REPO_ROOT/.minecraft/dev"

# Prefer pwsh (PowerShell 7); fall back to Windows PowerShell 5.1.
if command -v pwsh >/dev/null 2>&1; then
    PWSH=(pwsh -NoProfile -ExecutionPolicy Bypass)
else
    PWSH=(powershell.exe -NoProfile -ExecutionPolicy Bypass)
fi

# --- Step 1: regenerate Mod-List.md ---
if [ -f "$DEV/generate_modlist.ps1" ]; then
    "${PWSH[@]}" -File "$DEV/generate_modlist.ps1"
fi

# --- Step 2: mirror pack-side wiki to GitHub Wiki repo ---
if [ -f "$DEV/mirror-wiki.ps1" ]; then
    "${PWSH[@]}" -File "$DEV/mirror-wiki.ps1"
fi

# --- Step 1+2 check: did anything change in the main repo? If so, block ---
if ! git diff --quiet -- .minecraft/wiki/Mod-List.md 2>/dev/null; then
    echo ""
    echo "[pre-push] Mod-List.md regenerated and differs from HEAD."
    echo "  Run: git add .minecraft/wiki/Mod-List.md && git commit -m 'modlist: refresh'"
    echo "  Then re-push. Bypass: git push --no-verify"
    exit 1
fi

# --- Mod index gate (blocking; one self-contained block) ---
# .minecraft/mods/.index is the ONE source of the pack's mods. The server index, the
# client distribution's index, client_only_mods.txt and the skip lists inside the
# server scripts are generated from it by dev/mods/mod_index.py. `check` fails when
#   - a metafile does not parse, has no hash, or its side is not both / client / server
#   - two metafiles describe one jar, or one upstream project
#   - a generated file is stale or was edited by hand (a mod in one index only, a
#     side label that differs between distros)
#   - a skip pattern would hide a jar the server index says the server gets
# About a second, so it runs on every push. Where it cannot run (no python, or a
# python older than 3.11) it blocks only a push that touches the index or its tools.
MODIDX="$DEV/mods/mod_index.py"
if [ -f "$MODIDX" ]; then
    MODIDX_RC=2
    if command -v python >/dev/null 2>&1; then
        python -I "$MODIDX" check
        MODIDX_RC=$?
    fi
    if [ $MODIDX_RC -eq 1 ]; then
        echo ""
        echo "[pre-push] mod index gate FAILED. Edit the source (.minecraft/mods/.index), then:"
        echo "    python .minecraft/dev/mods/mod_index.py generate"
        echo "  commit what it wrote and re-push. Bypass: git push --no-verify"
        exit 1
    fi
    if [ $MODIDX_RC -ne 0 ]; then
        MODIDX_TOUCHED=0
        [ -z "$PUSHED" ] && MODIDX_TOUCHED=1
        while read -r _lref lsha _rref rsha; do
            [ -z "$lsha" ] && continue
            [ "$lsha" = "0000000000000000000000000000000000000000" ] && continue
            if [ "$rsha" != "0000000000000000000000000000000000000000" ] && git cat-file -e "$rsha^{commit}" 2>/dev/null; then
                base="$rsha"
            else
                base="$(git merge-base "$lsha" origin/main 2>/dev/null)"
            fi
            if [ -z "$base" ]; then MODIDX_TOUCHED=1; break; fi
            if git diff --name-only "$base" "$lsha" 2>/dev/null \
                | grep -Eq 'mods/\.index/|^\.minecraft/dev/mods/mod_index|client_only_mods\.txt$'; then
                MODIDX_TOUCHED=1; break
            fi
        done <<EOF
$PUSHED
EOF
        if [ $MODIDX_TOUCHED -eq 1 ]; then
            echo "[pre-push] the mod index gate could NOT run (needs python 3.11+ on PATH) and this push touches the mod index."
            echo "  Bypass: git push --no-verify"
            exit 1
        fi
        echo "[pre-push] WARN: mod index gate skipped (needs python 3.11+ on PATH); this push does not touch the mod index."
    fi
fi

# --- Mod intake gate (blocking; one self-contained block) ---
# Every mod of the index has an INTAKE RECORD under .minecraft/dev/mods/records: the surfaces
# it touches, what its content does by default, and the decision each needs (side, the tier of
# a dimension, boss or mob, what its chests roll, ...). dev/mods/intake.py check fails when
#   - a mod of the index has no record, or its record was made from another jar than the index
#     names (a mod added or updated by hand instead of with intake.py add / intake.py update)
#   - a NEW mod has a decision that is owed, or one that is decided and not yet applied to the
#     boss or dimension registry. New = not listed in dev/mods/intake_baseline.json
#   - a record belongs to no mod of the index, or does not parse
# It does NOT fail on the owed decisions of the grandfathered mods (the pack as it was at the
# first audit): that backlog is one count in the OK line; `intake.py audit` lists it by priority.
# It reads the repo only (no jar, no boot), in under a second, so it runs on every push. Where it
# cannot run (no python, or a python older than 3.11) it blocks only a push that touches the
# index, the records, the registries or the tool.
# Self-contained: its own variables (MI_*), nothing from the other steps but PUSHED and DEV.
MI_TOOL="$DEV/mods/intake.py"
if [ -f "$MI_TOOL" ]; then
    MI_RC=2
    if command -v python >/dev/null 2>&1; then
        python -I "$MI_TOOL" check
        MI_RC=$?
    fi
    if [ $MI_RC -eq 1 ]; then
        echo ""
        echo "[pre-push] mod intake gate FAILED (the FAIL lines above name the mod and the command)."
        echo "  A mod is added with      python -I .minecraft/dev/mods/intake.py add <jar> --side ..."
        echo "  updated with             python -I .minecraft/dev/mods/intake.py update <mod> <new jar>"
        echo "  removed with             python -I .minecraft/dev/mods/intake.py remove <mod> --apply"
        echo "  and a decision answered  python -I .minecraft/dev/mods/intake.py decide <mod> <key> <answer>"
        echo "  The procedure: .minecraft/dev/mods/README.md. Bypass: git push --no-verify"
        exit 1
    fi
    if [ $MI_RC -ne 0 ]; then
        MI_ZERO=0000000000000000000000000000000000000000
        MI_TOUCHED=0
        [ -z "$PUSHED" ] && MI_TOUCHED=1
        while read -r _mi_lref mi_lsha _mi_rref mi_rsha; do
            [ -z "$mi_lsha" ] && continue
            [ "$mi_lsha" = "$MI_ZERO" ] && continue
            if [ "$mi_rsha" != "$MI_ZERO" ] && git cat-file -e "$mi_rsha^{commit}" 2>/dev/null; then
                mi_base="$mi_rsha"
            else
                mi_base="$(git merge-base "$mi_lsha" origin/main 2>/dev/null)"
            fi
            if [ -z "$mi_base" ]; then MI_TOUCHED=1; break; fi
            if git diff --name-only "$mi_base" "$mi_lsha" 2>/dev/null \
                | grep -Eq 'mods/\.index/|^\.minecraft/dev/mods/(intake|records/)|^\.minecraft/kubejs/config/icraft/registry/'; then
                MI_TOUCHED=1; break
            fi
        done <<EOF
$PUSHED
EOF
        if [ $MI_TOUCHED -eq 1 ]; then
            echo "[pre-push] the mod intake gate could NOT run (needs python 3.11+ on PATH) and this push touches the mod index, the intake records or the registries."
            echo "  Bypass: git push --no-verify"
            exit 1
        fi
        echo "[pre-push] WARN: mod intake gate skipped (needs python 3.11+ on PATH); this push touches neither the mod index nor the intake records."
    fi
fi

# --- Registry snapshot currency (one self-contained block) ---
# .minecraft/dev/registry holds the ids a full-pack server boot registered; validators read
# them as the truth (quests, the boss and dimension registries, the loot audit, the Codex).
# dev/boot/registry_current.py compares the server mod set of this tree, computed with the
# boot tool's own function, with the jars the snapshot was taken with. No jar is opened,
# nothing boots; under a second. Two answers:
#   STALE   (blocks)  a jar was added, removed, or replaced by another file: the id lists are
#                     wrong for certain. Commit the mod change, refresh from that commit with
#                     boot.ps1 -Ref <commit> -WriteSnapshot, commit dev/registry, push both.
#   CHANGED (printed, does not block) the same jars, another recorded hash: a custom jar
#                     rebuilt under its name. Its ids MAY have changed; the lines name the jars.
# Runs when a pushed commit touches what the mod set is computed from (the server mod index
# and the jars committed next to it, the custom-jar manifest, the launcher's filter), the
# snapshot, or the tool. Self-contained: its own variables (RS_*), nothing but PUSHED and DEV.
RS_TOOL="$DEV/boot/registry_current.py"
if [ -f "$RS_TOOL" ]; then
    RS_ZERO=0000000000000000000000000000000000000000
    RS_RUN=0
    [ -z "$PUSHED" ] && RS_RUN=1
    while read -r _rs_lref rs_lsha _rs_rref rs_rsha; do
        [ -z "$rs_lsha" ] && continue
        [ "$rs_lsha" = "$RS_ZERO" ] && continue
        if [ "$rs_rsha" != "$RS_ZERO" ] && git cat-file -e "$rs_rsha^{commit}" 2>/dev/null; then
            rs_base="$rs_rsha"
        else
            rs_base="$(git merge-base "$rs_lsha" origin/main 2>/dev/null)"
        fi
        if [ -z "$rs_base" ]; then RS_RUN=1; break; fi
        if git diff --name-only "$rs_base" "$rs_lsha" 2>/dev/null \
            | grep -Eq '^\.minecraft/server_distribution/(mods/|custom_jars_manifest\.json$)|^iridescent-launcher/icraft-core/src/(packwiz|config)\.rs$|^\.minecraft/dev/registry/|^\.minecraft/dev/boot/(icboot|registry_current)'; then
            RS_RUN=1; break
        fi
    done <<EOF
$PUSHED
EOF
    if [ $RS_RUN -eq 1 ]; then
        RS_RC=2
        if command -v python >/dev/null 2>&1; then
            python -I "$RS_TOOL"
            RS_RC=$?
        else
            echo "[pre-push] python not found: the registry snapshot check could NOT run"
        fi
        if [ $RS_RC -ne 0 ]; then
            echo ""
            if [ $RS_RC -eq 1 ]; then
                echo "[pre-push] the registry snapshot is STALE for the mods this push carries (lines above)."
            else
                echo "[pre-push] the registry snapshot check could NOT run, and this push touches the mod set or the snapshot."
            fi
            echo "  Bypass: git push --no-verify"
            exit 1
        fi
    fi
fi

# --- Heracles quest validator (blocking; one self-contained block) ---
# tools/validate_heracles_quests.py holds every quest file to the shape Heracles really
# decodes. One task that does not decode empties the WHOLE quest, without a log line: 51
# kill tasks written "entity": "<id>" (Heracles reads { "type": "<id>" }) left 21 quests
# that could never be completed, and reached main because nothing ran the validator
# (2026-10-13). Runs when a pushed commit changes a file under any distro's
# config/heracles/, the validator, or the entity list it checks ids against
# (dev/registry/entity_types.txt); all three quest trees, under a second each.
# Self-contained: its own variables (HQ_*), nothing from the other steps but PUSHED and REPO_ROOT.
HQ_TOOL="$REPO_ROOT/.minecraft/tools/validate_heracles_quests.py"
if [ -f "$HQ_TOOL" ]; then
    HQ_ZERO=0000000000000000000000000000000000000000
    HQ_RUN=0
    [ -z "$PUSHED" ] && HQ_RUN=1
    while read -r _hq_lref hq_lsha _hq_rref hq_rsha; do
        [ -z "$hq_lsha" ] && continue
        [ "$hq_lsha" = "$HQ_ZERO" ] && continue
        if [ "$hq_rsha" != "$HQ_ZERO" ] && git cat-file -e "$hq_rsha^{commit}" 2>/dev/null; then
            hq_base="$hq_rsha"
        else
            hq_base="$(git merge-base "$hq_lsha" origin/main 2>/dev/null)"
        fi
        if [ -z "$hq_base" ]; then HQ_RUN=1; break; fi
        if git diff --name-only "$hq_base" "$hq_lsha" 2>/dev/null \
            | grep -Eq '(^|/)config/heracles/|^\.minecraft/tools/validate_heracles_quests|^\.minecraft/dev/registry/entity_types\.txt$'; then
            HQ_RUN=1; break
        fi
    done <<EOF
$PUSHED
EOF
    if [ $HQ_RUN -eq 1 ]; then
        echo "[pre-push] quest files changed: running the Heracles quest validator"
        HQ_FAIL=0
        if command -v python >/dev/null 2>&1; then
            for hq_root in ".minecraft/config/heracles/quests" \
                           ".minecraft/server_distribution/config/heracles/quests" \
                           ".minecraft/distribution/client/config/heracles/quests"; do
                [ -d "$REPO_ROOT/$hq_root" ] || continue
                hq_out="$(cd "$REPO_ROOT" && python -I "$HQ_TOOL" "$hq_root" --require-entity-list 2>&1)"
                hq_rc=$?
                if [ $hq_rc -eq 0 ]; then
                    echo "  ok    $hq_root: $(printf '%s\n' "$hq_out" | grep -E '^--- (ERRORS|OWED|WARNINGS)' | tr -d '\r' | tr '\n' ' ')"
                else
                    printf '%s\n' "$hq_out"
                    echo "  FAIL  $hq_root (exit $hq_rc)"
                    HQ_FAIL=1
                fi
            done
        else
            echo "[pre-push] python not found: the Heracles quest validator could NOT run"
            HQ_FAIL=1
        fi
        if [ $HQ_FAIL -ne 0 ]; then
            echo ""
            echo "[pre-push] Heracles quest validator FAILED (or could not run). Each ERROR names the"
            echo "  quest file and the field; the shape is in .minecraft/wiki/design/heracles-json-shape.md."
            echo "  Fix the quest in all three trees and re-push. Bypass: git push --no-verify"
            exit 1
        fi
    fi
fi

# --- Step 3: KubeJS script lints (blocking) ---
# Run when a pushed commit changes a kubejs script in any distro, or a lint itself.
# No ref lines on stdin (the hook run by hand) or an unknown base: run them anyway.
ZERO=0000000000000000000000000000000000000000
KJS_RUN=0
[ -z "$PUSHED" ] && KJS_RUN=1
while read -r _lref lsha _rref rsha; do
    [ -z "$lsha" ] && continue
    [ "$lsha" = "$ZERO" ] && continue    # a branch deletion pushes no content
    if [ "$rsha" != "$ZERO" ] && git cat-file -e "$rsha^{commit}" 2>/dev/null; then
        base="$rsha"
    else
        base="$(git merge-base "$lsha" origin/main 2>/dev/null)"
    fi
    if [ -z "$base" ]; then KJS_RUN=1; break; fi
    if git diff --name-only "$base" "$lsha" 2>/dev/null \
        | grep -Eq 'kubejs/(server|startup|client)_scripts/.*\.js$|^\.minecraft/dev/lint_kubejs_'; then
        KJS_RUN=1; break
    fi
done <<EOF
$PUSHED
EOF
if [ $KJS_RUN -eq 1 ] && [ -f "$DEV/lint_kubejs_traps.js" ]; then
    echo "[pre-push] kubejs scripts changed: running the script lints"
    LINT_FAIL=0
    if command -v node >/dev/null 2>&1; then
        node --expose-internals "$DEV/lint_kubejs_rhino.js" || LINT_FAIL=1
        node --expose-internals "$DEV/lint_kubejs_traps.js" || LINT_FAIL=1
    else
        echo "[pre-push] node not found: lint_kubejs_rhino.js and lint_kubejs_traps.js could NOT run"
        LINT_FAIL=1
    fi
    if command -v python >/dev/null 2>&1; then
        python -I "$DEV/lint_kubejs_scope.py" || LINT_FAIL=1
    else
        echo "[pre-push] python not found: lint_kubejs_scope.py could NOT run"
        LINT_FAIL=1
    fi
    if [ $LINT_FAIL -ne 0 ]; then
        echo ""
        echo "[pre-push] KubeJS script lints FAILED (or could not run). Each flag names the"
        echo "  file, the line and the rule; the header of the lint explains the rule."
        echo "  Fix the script and re-push. Bypass: git push --no-verify"
        exit 1
    fi
fi

# --- Lint ratchets against the base commit (blocking; one self-contained block) ---
# Step 3 holds the scripts to the grandfathered counts OF THE SAME TREE
# (lint_kubejs_traps.silent_catches.json: so many silent catches per file and no more).
# A session that raised a count, or deleted the file and took a new snapshot, passed its own
# lint (decision sheet G20). This compares the counts file of the commit being pushed with
# the one of the commit the push is based on (the remote's tip): a count that went up, or a
# file that appeared with a count, blocks. A count that went down, and a script that moved
# with its count, pass. Nothing is linted here; about 0.3 s.
# Runs when a pushed commit touches the lint, its counts files, its test or its fixtures
# (a push that changes none of them cannot change a count); the lint's own test then runs
# too (about 10 s). Self-contained: its own variables (RB_*), nothing but PUSHED and DEV.
RB_LINT="$DEV/lint_kubejs_traps.js"
if [ -f "$RB_LINT" ] && grep -q -- '--ratchet-base' "$RB_LINT"; then
    RB_ZERO=0000000000000000000000000000000000000000
    RB_FAIL=0
    RB_TEST=0
    if [ -z "$PUSHED" ]; then
        # run by hand: the working tree against origin/main
        RB_TEST=1
        if command -v node >/dev/null 2>&1; then
            node --expose-internals "$RB_LINT" --ratchet-base=origin/main < /dev/null || RB_FAIL=1
        else
            echo "[pre-push] node not found: the ratchet comparison could NOT run"; RB_FAIL=1
        fi
    fi
    while read -r _rb_lref rb_lsha _rb_rref rb_rsha; do
        [ -z "$rb_lsha" ] && continue
        [ "$rb_lsha" = "$RB_ZERO" ] && continue
        if [ "$rb_rsha" != "$RB_ZERO" ] && git cat-file -e "$rb_rsha^{commit}" 2>/dev/null; then
            rb_base="$rb_rsha"
        else
            rb_base="$(git merge-base "$rb_lsha" origin/main 2>/dev/null)"
        fi
        [ -z "$rb_base" ] && continue    # no common history with main: nothing to compare with
        if git diff --name-only "$rb_base" "$rb_lsha" 2>/dev/null \
            | grep -Eq '^\.minecraft/dev/(lint_kubejs_traps|lint-fixtures/)'; then
            RB_TEST=1
            if command -v node >/dev/null 2>&1; then
                node --expose-internals "$RB_LINT" --ratchet-base="$rb_base" --ratchet-head="$rb_lsha" < /dev/null || RB_FAIL=1
            else
                echo "[pre-push] node not found: the ratchet comparison could NOT run"; RB_FAIL=1
            fi
        fi
    done <<EOF
$PUSHED
EOF
    if [ $RB_TEST -eq 1 ] && [ $RB_FAIL -eq 0 ] && [ -f "$DEV/lint_kubejs_traps.test.js" ]; then
        echo "[pre-push] the trap lint changed: running its own test"
        # The exit code is taken from node itself, not from a pipeline: `node .. | grep -v .. || true` lost it
        # whenever grep printed nothing, so a test that crashed before its summary line left this block green
        # (2026-10-13, the first run from a real hook). The test starts its own git children without GIT_DIR.
        rb_out="$(node "$DEV/lint_kubejs_traps.test.js" < /dev/null 2>&1)"
        rb_rc=$?
        printf '%s\n' "$rb_out" | grep -Ev '^ok ' || true
        if [ $rb_rc -ne 0 ]; then
            echo "[pre-push] lint_kubejs_traps.test.js exited with $rb_rc"
            RB_FAIL=1
        fi
    fi
    if [ $RB_FAIL -ne 0 ]; then
        echo ""
        echo "[pre-push] the lint ratchet FAILED: a grandfathered count rose against the base commit, or"
        echo "  the lint's own test failed (lines above). Counts only go down: report the error or mark"
        echo "  the catch // swallow-ok: <reason>, and put the count back. Bypass: git push --no-verify"
        exit 1
    fi
fi

# --- Step 3b: engine test suite + method-ref validator (blocking) ---
# The pack's scripts on the production Rhino jar, over mocks that are held to the real
# classes (.minecraft/dev/engine-tests/README.md), and the bare-method-reference check
# that CI otherwise only runs after the push. Runs when a pushed commit changes a kubejs
# script, a test or mock, the pinned KubeJS / Rhino / Architectury jars, or the boss and
# dimension registries (kubejs/config/icraft/registry, their tools in dev/rosters, the game's
# registry dump in dev/registry: suite registry-data is their validator); about 10 s.
# Also the liveness files (dev/loud: the generator, the hand-kept lines, the generated
# manifest; kubejs/config/icraft/live/expected.json): suite liveness-manifest runs
# `gen_liveness.js --check` and FAILS when a script registers, names or reports something
# the committed files do not have. Regenerate and commit:
#   node --expose-internals .minecraft/dev/loud/gen_liveness.js
# Self-contained: its own variables (ET_*), nothing from the other steps but PUSHED and DEV.
# Not run here (it needs the whole instance and about 30 s more): the loot audit, i.e.
#   python .minecraft/dev/engine-tests/run.py          (every suite)
ET_ZERO=0000000000000000000000000000000000000000
ET_RUN=0
[ -z "$PUSHED" ] && ET_RUN=1
while read -r _et_lref et_lsha _et_rref et_rsha; do
    [ -z "$et_lsha" ] && continue
    [ "$et_lsha" = "$ET_ZERO" ] && continue
    if [ "$et_rsha" != "$ET_ZERO" ] && git cat-file -e "$et_rsha^{commit}" 2>/dev/null; then
        et_base="$et_rsha"
    else
        et_base="$(git merge-base "$et_lsha" origin/main 2>/dev/null)"
    fi
    if [ -z "$et_base" ]; then ET_RUN=1; break; fi
    if git diff --name-only "$et_base" "$et_lsha" 2>/dev/null \
        | grep -Eq 'kubejs/(server|startup|client)_scripts/.*\.js$|^\.minecraft/dev/(engine-tests|rhino_parse|rosters|registry|loud)/|^\.minecraft/kubejs/config/icraft/|^\.minecraft/tools/check_kubejs_method_refs\.sh$|^\.minecraft/mods/\.index/(kubejs|rhino|architectury-api)\.pw\.toml$'; then
        ET_RUN=1; break
    fi
done <<EOF
$PUSHED
EOF
if [ $ET_RUN -eq 1 ] && [ -f "$DEV/engine-tests/run.py" ]; then
    echo "[pre-push] kubejs scripts or engine tests changed: running the engine test suite"
    ET_FAIL=0
    if [ -f "$REPO_ROOT/.minecraft/tools/check_kubejs_method_refs.sh" ]; then
        # by RELATIVE path: called as C:/.../check_kubejs_method_refs.sh its comment filter breaks on
        # the colon of the drive letter and every comment that names a method is reported
        ( cd "$REPO_ROOT" && bash .minecraft/tools/check_kubejs_method_refs.sh ) || ET_FAIL=1
    fi
    if command -v python >/dev/null 2>&1; then
        # --fetch-dir: on a machine without the PrismLauncher instance the Rhino jar is
        # downloaded from the URL in its packwiz metafile (hash-verified either way)
        python -I -B "$DEV/engine-tests/run.py" fast --fetch-dir "$DEV/engine-tests/.out/jars" || ET_FAIL=1
    else
        echo "[pre-push] python not found: the engine test suite could NOT run"
        ET_FAIL=1
    fi
    if [ $ET_FAIL -ne 0 ]; then
        echo ""
        echo "[pre-push] engine test suite FAILED (or could not run: no JDK 17+, no python, a jar"
        echo "  with the wrong hash). Each FAIL line names the check; for the full output of one"
        echo "  suite: python .minecraft/dev/engine-tests/run.py suite <name>"
        echo "  Fix the script (or the test, if the behaviour change is intended) and re-push."
        echo "  Bypass: git push --no-verify"
        exit 1
    fi
fi

# --- Step 4: three-distro sync gate ---
SCRIPT="$DEV/sync-distros.ps1"
if [ ! -f "$SCRIPT" ]; then
    echo "[pre-push] WARN: sync-distros.ps1 not found at $SCRIPT - skipping gate"
    exit 0
fi
"${PWSH[@]}" -File "$SCRIPT"
RESULT=$?
if [ $RESULT -ne 0 ]; then
    echo ""
    echo "[pre-push] three-distro sync FAILED. Fix with:"
    echo "    pwsh .minecraft/dev/sync-distros.ps1 -Fix"
    echo "  then re-stage and re-push. Bypass: git push --no-verify"
    exit 1
fi

# --- Step 5: lessons-learned tracker (best-effort, NEVER blocks push) ---
# Tracks commits-since-last-scan + push-count-since-last-QA. If thresholds
# are crossed AND ANTHROPIC_API_KEY is set in env, spawns scan-lessons.ps1
# (and/or qa-lessons.ps1) as a detached background process. The push
# returns immediately; lessons capture finishes asynchronously and writes
# to ../IridescentCraft-internal/dev/lessons-learned*.md.
if [ -f "$DEV/lessons-pre-push.ps1" ]; then
    "${PWSH[@]}" -File "$DEV/lessons-pre-push.ps1" || true  # never block
fi
'@

if (-not $Install) {
    Write-Host "[install-hooks] DRY RUN. Re-run with -Install to commit the hook."
    Write-Host "[install-hooks] would write the following to $PrePushPath :"
    Write-Host ""
    Write-Host "----- hook content -----"
    Write-Host $hookContent
    Write-Host "----- end -----"
    Write-Host ""
    Write-Host "[install-hooks] Before installing, run sync-distros.ps1 once and tune"
    Write-Host "[install-hooks] sync-distros.config.json until detect-only mode returns 0."
    Write-Host "[install-hooks] Otherwise the hook will block every push until baseline drift is resolved."
    exit 0
}

# LF only: this .ps1 is checked out with CRLF, the here-string inherits it, and bash
# reads a trailing CR as part of every command.
$hookContent = ($hookContent -replace "`r`n", "`n") + "`n"
# UTF-8 without BOM (msys bash mis-reads BOM-prefixed shebangs as garbage)
[System.IO.File]::WriteAllText($PrePushPath, $hookContent, (New-Object System.Text.UTF8Encoding $false))

Write-Host "[install-hooks] wrote $PrePushPath"
Write-Host "[install-hooks] verify by running:  pwsh .minecraft\dev\sync-distros.ps1"
Write-Host "[install-hooks] (returns 0 if all 3 distros in sync, 1 otherwise)"
