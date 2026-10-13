# =============================================================================
# generate_expected_state_test.ps1 - does the manifest freshness gate still tell
# a fresh manifest from a stale one?
# =============================================================================
# Builds a small pack-shaped tree in a temp folder (two distros, the three
# managed roots, one volatile config), generates its manifests with the real
# generate_expected_state.ps1 (-RepoRoot) and then runs -Check after one change
# at a time. Two directions, because the gate has failed in both:
#
#   FRESH   nothing changed but generated_from (HEAD moved: every checkout that
#           is not the commit the manifest was written at). Until 2026-10-13 this
#           read STALE, so every session regenerated after its last commit.
#   STALE   a file's content changed, a file was added, a file was removed, an
#           entry's sha256 was edited by hand, a path was renamed in the manifest,
#           a volatile flag was dropped, the manifest is missing.
#
# Also: a plain run leaves a manifest untouched (same bytes) when only
# generated_from would change, and rewrites it when the file list changed.
#
# Nothing in the real tree is touched. Windows PowerShell 5.1 and pwsh 7.
#   powershell -File .minecraft\dev\generate_expected_state_test.ps1
# Exit 0 when every case behaves, 1 otherwise.
# =============================================================================

[CmdletBinding()]
param([switch]$Keep)

$ErrorActionPreference = 'Stop'
$Gen = Join-Path $PSScriptRoot 'generate_expected_state.ps1'
$Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('es-test-' + [System.Guid]::NewGuid().ToString('N').Substring(0, 8))
$Distros = @('server_distribution', 'distribution/client')
$enc = New-Object System.Text.UTF8Encoding($false)

function Write-File {
    param([string]$Rel, [string]$Text)
    $p = Join-Path $Tmp $Rel
    $dir = Split-Path -Parent $p
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    [System.IO.File]::WriteAllText($p, $Text, $enc)
}

function New-Tree {
    if (Test-Path -LiteralPath $Tmp) { Remove-Item -LiteralPath $Tmp -Recurse -Force }
    foreach ($d in $Distros) {
        Write-File ".minecraft/$d/kubejs/server_scripts/a.js" "console.log('a')`n"
        Write-File ".minecraft/$d/kubejs/server_scripts/sub/b.js" "console.log('b')`n"
        Write-File ".minecraft/$d/config/some-mod.toml" "x = 1`n"
        Write-File ".minecraft/$d/config/apocalypse-common.toml" "rewritten = 'at runtime'`n"
        Write-File ".minecraft/$d/mods/.index/some-mod.pw.toml" "filename = 'some-mod.jar'`n"
        # outside the managed roots, and a volatile dir: neither may ever be listed
        Write-File ".minecraft/$d/server.properties" "motd=x`n"
        Write-File ".minecraft/$d/kubejs/exported/dump.txt" "runtime`n"
    }
}

function Invoke-Gen {
    param([switch]$Check)
    # a child process: the generator ends with `exit`, and its colours and lines are not this test's output
    $exe = (Get-Process -Id $PID).Path
    $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $Gen, '-RepoRoot', $Tmp)
    if ($Check) { $a += '-Check' }
    $out = & $exe @a 2>&1 | Out-String
    return [pscustomobject]@{ Code = $LASTEXITCODE; Out = $out }
}

function Get-ManifestPath { param([string]$Distro) return (Join-Path $Tmp ".minecraft/$Distro/expected_state.json") }

$script:bad = 0
$script:n = 0
function Assert-Case {
    param([string]$Name, [bool]$Ok, [string]$Detail)
    $script:n++
    if ($Ok) { Write-Host "ok    $Name" } else { $script:bad++; Write-Host "FAIL  $Name" -ForegroundColor Red; if ($Detail) { Write-Host ("      " + ($Detail.Trim() -replace "`r?`n", "`n      ")) } }
}

# One case: a fresh tree with fresh manifests, one change, then -Check.
function Test-Check {
    param([string]$Name, [scriptblock]$Change, [int]$Want, [string]$WantText)
    New-Tree
    $g = Invoke-Gen
    if ($g.Code -ne 0) { Assert-Case $Name $false ("the generator failed before the case: " + $g.Out); return }
    & $Change
    $c = Invoke-Gen -Check
    $ok = ($c.Code -eq $Want) -and ((-not $WantText) -or ($c.Out -match [regex]::Escape($WantText)))
    Assert-Case ("$Name -> exit $($c.Code)") $ok ("wanted exit $Want" + $(if ($WantText) { " and the text '$WantText'" } else { '' }) + "`n" + $c.Out)
}

function Edit-Manifest {
    param([string]$Distro, [scriptblock]$Edit)
    $p = Get-ManifestPath $Distro
    $t = [System.IO.File]::ReadAllText($p)
    $new = & $Edit $t
    if ($new -ceq $t) { throw "the test's own edit changed nothing in $p" }
    [System.IO.File]::WriteAllText($p, $new, $enc)
}

try {
    # ---- the manifest itself -------------------------------------------------
    New-Tree
    $g = Invoke-Gen
    $m = [System.IO.File]::ReadAllText((Get-ManifestPath 'server_distribution'))
    Assert-Case 'the generator lists the managed roots and nothing else' (
        $g.Code -eq 0 -and $m -match '"kubejs/server_scripts/sub/b\.js"' -and $m -match '"mods/\.index/some-mod\.pw\.toml"' -and
        $m -notmatch 'server\.properties' -and $m -notmatch 'kubejs/exported' -and ([regex]::Matches($m, '"sha256"')).Count -eq 5 -and
        ([regex]::Matches($m, '"volatile"')).Count -eq 1) $m

    # ---- FRESH ---------------------------------------------------------------
    Test-Check 'FRESH: nothing changed' { } 0 'all manifests fresh'
    Test-Check 'FRESH: only generated_from differs (HEAD moved since the manifest was written)' {
        foreach ($d in $Distros) { Edit-Manifest $d { param($t) $t -replace '("generated_from":\s*)"[^"]*"', '$1"0123abcd"' } }
    } 0 'all manifests fresh'
    Test-Check 'FRESH: the manifest has CRLF line endings (a checkout that converted it)' {
        Edit-Manifest 'server_distribution' { param($t) ($t -replace "`r`n", "`n") -replace "`n", "`r`n" }
    } 0 'all manifests fresh'

    # ---- STALE ---------------------------------------------------------------
    Test-Check 'STALE: a script changed' { Write-File '.minecraft/server_distribution/kubejs/server_scripts/a.js' "console.log('changed')`n" } 1 '[STALE] server_distribution'
    Test-Check 'STALE: a script changed, same size' { Write-File '.minecraft/distribution/client/kubejs/server_scripts/a.js' "console.log('b')`n" } 1 '[STALE] distribution/client'
    Test-Check 'STALE: a file was added' { Write-File '.minecraft/server_distribution/config/new-mod.toml' "y = 2`n" } 1 '[STALE] server_distribution'
    Test-Check 'STALE: a file was removed' { Remove-Item -LiteralPath (Join-Path $Tmp '.minecraft/server_distribution/kubejs/server_scripts/sub/b.js') -Force } 1 '[STALE] server_distribution'
    Test-Check 'STALE: a mod index entry changed' { Write-File '.minecraft/server_distribution/mods/.index/some-mod.pw.toml' "filename = 'some-mod-2.jar'`n" } 1 '[STALE] server_distribution'
    Test-Check 'STALE: a sha256 edited in the manifest' {
        Edit-Manifest 'server_distribution' { param($t) $rx = New-Object regex('("sha256":\s*")[0-9a-f]{4}'); $rx.Replace($t, '${1}ffff', 1) }
    } 1 '[STALE] server_distribution'
    Test-Check 'STALE: a path renamed in the manifest' {
        Edit-Manifest 'server_distribution' { param($t) $t.Replace('"kubejs/server_scripts/a.js"', '"kubejs/server_scripts/z.js"') }
    } 1 '[STALE] server_distribution'
    Test-Check 'STALE: the volatile flag removed from an entry' {
        Edit-Manifest 'server_distribution' { param($t) $t -replace ',\s*"volatile":\s*true', '' }
    } 1 '[STALE] server_distribution'
    Test-Check 'STALE: generated_from differs AND a file changed' {
        Edit-Manifest 'server_distribution' { param($t) $t -replace '("generated_from":\s*)"[^"]*"', '$1"0123abcd"' }
        Write-File '.minecraft/server_distribution/config/some-mod.toml' "x = 2`n"
    } 1 '[STALE] server_distribution'
    Test-Check 'STALE: a file path that holds the text generated_from is still compared' {
        Write-File '.minecraft/server_distribution/config/generated_from.toml' "k = 1`n"
    } 1 '[STALE] server_distribution'
    Test-Check 'STALE: the manifest is missing' { Remove-Item -LiteralPath (Get-ManifestPath 'distribution/client') -Force } 1 '[STALE] distribution/client'

    # ---- a plain run ---------------------------------------------------------
    New-Tree
    $null = Invoke-Gen
    foreach ($d in $Distros) { Edit-Manifest $d { param($t) $t -replace '("generated_from":\s*)"[^"]*"', '$1"0123abcd"' } }
    $before = [System.IO.File]::ReadAllBytes((Get-ManifestPath 'server_distribution'))
    $g = Invoke-Gen
    $after = [System.IO.File]::ReadAllBytes((Get-ManifestPath 'server_distribution'))
    Assert-Case 'a plain run leaves a manifest untouched when only generated_from would change' (
        $g.Code -eq 0 -and [System.Convert]::ToBase64String($before) -ceq [System.Convert]::ToBase64String($after) -and $g.Out -match 'nothing written') $g.Out

    Write-File '.minecraft/server_distribution/config/new-mod.toml' "y = 2`n"
    $g = Invoke-Gen
    $t = [System.IO.File]::ReadAllText((Get-ManifestPath 'server_distribution'))
    $c = Invoke-Gen -Check
    Assert-Case 'a plain run rewrites the manifest whose file list changed, and only that one' (
        $g.Code -eq 0 -and $t -match '"config/new-mod\.toml"' -and $t -notmatch '0123abcd' -and $g.Out -match 'wrote 1 manifest' -and
        ([System.IO.File]::ReadAllText((Get-ManifestPath 'distribution/client')) -match '0123abcd') -and $c.Code -eq 0) ($g.Out + $c.Out)
}
finally {
    if (-not $Keep -and (Test-Path -LiteralPath $Tmp)) { Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Host ""
Write-Host ("[expected-state test] {0} case(s), {1} failed (PowerShell {2})" -f $script:n, $script:bad, $PSVersionTable.PSVersion)
if ($script:bad -gt 0) { exit 1 }
exit 0
