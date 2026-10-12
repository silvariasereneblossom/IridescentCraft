# =============================================================================
# install-hooks.ps1 - install the pre-push gate
#
# Writes a git pre-push hook that runs sync-distros.ps1 in detect-only mode
# (push fails if any watched path is out of mirror across the three distros),
# the mod index gate (dev/mods/mod_index.py check: the three mod indexes and
# the client-only skip lists are generated from .minecraft/mods/.index)
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
#   3. KubeJS script lints    - lint_kubejs_rhino.js, lint_kubejs_traps.js,
#                                lint_kubejs_scope.py; only when a pushed commit
#                                touches a kubejs script (or one of the lints)
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
