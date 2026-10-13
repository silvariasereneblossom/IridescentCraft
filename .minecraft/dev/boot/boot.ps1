# =============================================================================
# boot.ps1 - the full-pack offline server boot, as one command
# =============================================================================
# Boots the pack's dedicated server offline in WSL (the server's ~430 mods, the
# launcher's JVM flags, a fresh world from a pinned seed, loopback only), then
# reports: did it reach Done, how long, idle TPS, memory, what the game really
# registered, which mixins applied, which loot tables it rejected, and what the
# boot-log checker (dev\loud\loud-check.ps1) says. README.md next to this file
# has the prerequisites, the first-time setup, the traps and how to read it.
#
# BOOT
#   boot.ps1                           this checkout as it is on disk (uncommitted work included)
#   boot.ps1 -Tree <checkout>          another checkout as it is on disk
#   boot.ps1 -Ref origin/main          a commit (fetched first when it is origin/...); the result
#                                      is kept under its hash and reused until -Fresh
#   boot.ps1 -Compare origin/main      boot this checkout and diff it against that commit
#                                      (which is booted first when no result of it exists)
#
# A/B FOR A CHANGE (before a push)
#   powershell -File .minecraft\dev\boot\boot.ps1 -Ref origin/main
#   powershell -File .minecraft\dev\boot\boot.ps1 -Compare origin/main
#
# OTHER
#   boot.ps1 -Setup                    first time: install Forge into the WSL home (network, once)
#   boot.ps1 -ModSet [-Ref x]          only compute the server's mod set and verify the jars (no boot)
#   boot.ps1 -ModSet -ExpectList f     ... and compare it with a listing of a server's mods folder
#   boot.ps1 -Diff <base>,<new>        diff two saved results (names, folders or commits)
#   boot.ps1 -Ref origin/main -WriteSnapshot    refresh .minecraft\dev\registry from that commit
#   boot.ps1 -List                     the saved results
#
# OPTIONS
#   -Name <n>          name of the result folder (default: the commit hash, or tree-<folder name>)
#   -Heap 8G           -Xmx of the server (default 8G; -HeapMin defaults to half of it)
#   -Seed <n>          world seed (default 20261012)
#   -IdleSeconds <n>   how long the server idles after Done before TPS and memory are read (default 45)
#   -JvmArg <a>,<b>    extra JVM arguments, after the launcher's
#   -ConsoleFile <f>   a text file of server console commands, one per line (# starts a comment): each is sent
#                      after the idle measurements, two seconds apart; what they print is in the captured logs
#   -ChunkFile <f>     more chunks to generate after the measurements, on top of one new chunk per dimension: a text
#                      file, one target per line (block coordinates, radius in chunks, # starts a comment):
#                        <dimension> <x> <z> [radius]
#                        <dimension> structure <structure id> [radius] [<x> <z> to search from]
#   -NoChunks          generate no chunk (the feature order of every dimension is still read and judged)
#   -ForceChunks       ask for chunks also in a dimension whose feature order has a cycle: shows what a player
#                      entering it would meet (every chunk fails); never for a result to compare with
#   -JarCache <dir>,.. folders that hold the mod jars (default: $env:ICRAFT_BOOT_JAR_CACHE, else the
#                      PrismLauncher instance IridescentCraft under %APPDATA%)
#   -IndexDir <dir>    a mod index directory other than <tree>\.minecraft\server_distribution\mods\.index
#   -ResultsRoot <dir> where results are kept (default: $env:ICRAFT_BOOT_RESULTS, else %USERPROFILE%\icraft-boot\results)
#   -WslHome <path>    the rig's folder in WSL (default: $ICRAFT_BOOT_WSL_HOME there, else ~/icraft-boot)
#   -Distro <name>     WSL distribution (default: the default one)
#   -LockWaitMinutes   how long to wait for another boot to finish (default 30): one full-pack server per host
#   -Fresh             boot a commit again although a result of it exists
#   -Keep              keep the run folder (it sits in memory and holds a generated world)
#   -NoCheck           skip the boot-log checker
#   -NoFetch           do not fetch before resolving an origin/... ref
#
# EXIT CODE
#   0  booted, stopped cleanly, nothing new found (and, with -Compare / -Diff, no regression)
#   1  findings: the checker reports something that is not a known defect, or the diff shows a regression
#   2  could not run: a prerequisite, a missing or wrong-hash jar, the lock, bad arguments
#   3  the server did not boot or did not stop cleanly
#
# Never touches the live server, a world backup or player data. ASCII only:
# Windows PowerShell 5.1 reads a BOM-less script as ANSI.
# =============================================================================

[CmdletBinding()]
param(
    [string]$Ref,
    [string]$Tree,
    [string]$Compare,
    [string]$Name,
    [string]$Heap = '8G',
    [string]$HeapMin,
    [string]$Seed = '20261012',
    [int]$IdleSeconds = 45,
    [string[]]$JvmArg,
    [string]$ConsoleFile,
    [string]$ChunkFile,
    [switch]$NoChunks,
    [switch]$ForceChunks,
    [string[]]$JarCache,
    [string]$IndexDir,
    [string]$ResultsRoot,
    [string]$WslHome,
    [string]$Distro,
    [int]$LockWaitMinutes = 30,
    [switch]$Fresh,
    [switch]$Keep,
    [switch]$NoCheck,
    [switch]$NoFetch,
    [switch]$Setup,
    [switch]$ModSet,
    [string]$ExpectList,
    [string[]]$Diff,
    [switch]$WriteSnapshot,
    [switch]$List
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = (Resolve-Path -LiteralPath (Join-Path $ScriptDir '..\..\..')).ProviderPath
$Engine    = Join-Path $ScriptDir 'icboot.py'
$LoudCheck = Join-Path $ScriptDir '..\loud\loud-check.ps1'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$ExitOk = 0; $ExitFindings = 1; $ExitCannot = 2; $ExitBoot = 3

function Say { param([string]$Text) Write-Host "[boot] $Text" }
function Stop-Cannot { param([string]$Text) Write-Host "[boot] CANNOT RUN: $Text" -ForegroundColor Red; exit $ExitCannot }
function Get-FullPath { param([string]$Path) return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path) }

if (-not $ResultsRoot) { $ResultsRoot = $env:ICRAFT_BOOT_RESULTS }
if (-not $ResultsRoot) { $ResultsRoot = Join-Path $env:USERPROFILE 'icraft-boot\results' }
$ResultsRoot = Get-FullPath $ResultsRoot
if (-not $JarCache -and $env:ICRAFT_BOOT_JAR_CACHE) { $JarCache = @($env:ICRAFT_BOOT_JAR_CACHE -split ';' | Where-Object { $_ }) }
if (-not $JarCache) { $JarCache = @(Join-Path $env:APPDATA 'PrismLauncher\instances\IridescentCraft\.minecraft\mods') }
$JarCache = @($JarCache | ForEach-Object { Get-FullPath $_ })

# ---- WSL ---------------------------------------------------------------------
$WslArgs = @()
if ($Distro) { $WslArgs = @('-d', $Distro) }
function ConvertTo-WslPath {
    param([string]$Path)
    $u = $null
    try { $u = (& wsl.exe @WslArgs -e wslpath -a -u ($Path -replace '\\', '/')) } catch { $u = $null }
    if ($LASTEXITCODE -eq 0 -and $u) { return ([string]$u).Trim() }
    if ($Path -match '^([A-Za-z]):[\\/](.*)$') { return '/mnt/' + $Matches[1].ToLower() + '/' + ($Matches[2] -replace '\\', '/') }
    return $Path
}
function Invoke-Engine {
    # one engine call: the parameters go through a JSON file, never through a shell's quoting
    param([string]$Command, [hashtable]$Request)
    $reqDir = Join-Path $ResultsRoot '.requests'
    if (-not (Test-Path -LiteralPath $reqDir)) { [void](New-Item -ItemType Directory -Force -Path $reqDir) }
    $reqPath = Join-Path $reqDir ("$Command-$PID-" + [Guid]::NewGuid().ToString('N').Substring(0, 8) + '.json')
    if ($WslHome) { $Request['wsl_home'] = $WslHome }
    [System.IO.File]::WriteAllText($reqPath, ($Request | ConvertTo-Json -Depth 8), $Utf8NoBom)
    try {
        & wsl.exe @WslArgs -e python3 (ConvertTo-WslPath $Engine) $Command --request (ConvertTo-WslPath $reqPath) | Out-Host
        return $LASTEXITCODE
    } finally {
        Remove-Item -LiteralPath $reqPath -Force -ErrorAction SilentlyContinue
    }
}
if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) { Stop-Cannot 'wsl.exe not found: the boot runs in WSL 2 (wsl --install), with a JDK 17 and python3 inside' }
$probe = $null
try { $probe = (& wsl.exe @WslArgs -e python3 -c 'import sys; print(sys.version_info >= (3, 11))') } catch { $probe = $null }
if ("$probe".Trim() -ne 'True') { Stop-Cannot 'python3 3.11 or newer was not found in WSL (sudo apt install python3). README.md lists the prerequisites' }

# ---- git ---------------------------------------------------------------------
function Invoke-Git {
    param([string]$Repo, [string[]]$GitArgs)
    $out = & git.exe -C $Repo @GitArgs
    if ($LASTEXITCODE -ne 0) { return $null }
    if ($null -eq $out) { return '' }
    return (@($out) -join "`n")
}
$ToolVersion = 0
$m = [regex]::Match([System.IO.File]::ReadAllText($Engine), '(?m)^TOOL_VERSION = (\d+)')
if ($m.Success) { $ToolVersion = [int]$m.Groups[1].Value }

$ArchivePaths = @(
    '.minecraft/server_distribution/mods',
    '.minecraft/server_distribution/config',
    '.minecraft/server_distribution/defaultconfigs',
    '.minecraft/server_distribution/kubejs',
    '.minecraft/server_distribution/server.properties',
    '.minecraft/server_distribution/custom_jars_manifest.json',
    '.minecraft/server_distribution/expected_state.json',
    'iridescent-launcher/icraft-core/src/packwiz.rs',
    'iridescent-launcher/icraft-core/src/config.rs',
    '.minecraft/dev/loud/baseline.json',
    '.minecraft/dev/loud/liveness_manifest.json'
)
function Resolve-Commit {
    param([string]$CommitIsh)
    if (-not $NoFetch -and $CommitIsh -match '^origin/(.+)$') {
        [void](Invoke-Git $RepoRoot @('fetch', '--quiet', 'origin', $Matches[1]))
        if ($LASTEXITCODE -ne 0) { Say "note: could not fetch origin/$($Matches[1]); using the ref as it is here" }
    }
    $sha = Invoke-Git $RepoRoot @('rev-parse', '--verify', '--quiet', ($CommitIsh + '^{commit}'))
    if (-not $sha) { return $null }
    return $sha.Trim()
}
function New-RefSource {
    # a commit, packed with git archive: the engine unpacks it inside WSL
    param([string]$CommitIsh, [string]$Sha)
    $have = @()
    foreach ($p in $ArchivePaths) {
        [void](Invoke-Git $RepoRoot @('cat-file', '-e', ($Sha + ':' + $p)))
        if ($LASTEXITCODE -eq 0) { $have += $p }
    }
    $tmp = Join-Path $ResultsRoot '.requests'
    if (-not (Test-Path -LiteralPath $tmp)) { [void](New-Item -ItemType Directory -Force -Path $tmp) }
    $tar = Join-Path $tmp ("src-" + $Sha.Substring(0, 12) + "-$PID.tar")
    $gitArgs = @('archive', '--format=tar', '-o', $tar, $Sha, '--') + $have
    [void](Invoke-Git $RepoRoot $gitArgs)
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $tar)) { Stop-Cannot "git archive of $Sha failed" }
    $label = $Sha.Substring(0, 12)
    if ($CommitIsh -ne $Sha) { $label = "$CommitIsh @$($Sha.Substring(0, 12))" }
    return @{ kind = 'ref'; ref = $CommitIsh; sha = $Sha; archive = $tar; label = $label }
}
function New-TreeSource {
    param([string]$Path)
    $full = (Resolve-Path -LiteralPath $Path).ProviderPath
    if (-not (Test-Path -LiteralPath (Join-Path $full '.minecraft\server_distribution') -PathType Container)) { Stop-Cannot "not a pack checkout: $full" }
    $head = Invoke-Git $full @('rev-parse', 'HEAD')
    $dirty = 0
    $st = Invoke-Git $full @('status', '--porcelain')
    if ($st) { $dirty = @($st -split "`n" | Where-Object { $_ }).Count }
    $leaf = Split-Path -Leaf $full
    $label = "tree $leaf"
    if ($head) { $label += ' @' + $head.Trim().Substring(0, 12) }
    if ($dirty -gt 0) { $label += " + $dirty changed file(s)" }
    $src = @{ kind = 'tree'; path = $full; label = $label; dirty = $dirty; leaf = $leaf }
    if ($head) { $src['sha'] = $head.Trim() }
    return $src
}
function Get-ResultDir { param([string]$ResultName) return (Join-Path $ResultsRoot $ResultName) }
function Read-Result {
    # summary.json: the flat digest the engine writes with the verdict (result.json is for people and for the diff)
    param([string]$Dir)
    $p = Join-Path $Dir 'summary.json'
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { return $null }
    try { return ([System.IO.File]::ReadAllText($p) | ConvertFrom-Json) } catch { return $null }
}
function Test-Reusable {
    # a commit's result is reused when the same tool made it with the same heap and seed, and it carries a verdict
    param([string]$Dir)
    $r = Read-Result $Dir
    if ($null -eq $r) { return $false }
    if ([int]$r.tool_version -ne $ToolVersion) { return $false }
    if ([string]$r.heap -ne $Heap -or [string]$r.seed -ne $Seed) { return $false }
    # a result without the chunk generation is half a result, unless that is what was asked for now
    if (-not $NoChunks -and -not $r.chunks) { return $false }
    if ($r.forced) { return $false }
    return $true
}

# ---- one boot: run, check, verdict -------------------------------------------
function Invoke-Boot {
    param([hashtable]$Source, [string]$ResultName)
    $dir = Get-ResultDir $ResultName
    $req = @{
        name = $ResultName; source = $Source; result_dir = $dir; jar_cache = $JarCache
        heap = $Heap; seed = $Seed; idle_seconds = $IdleSeconds; lock_wait = ($LockWaitMinutes * 60)
        keep = [bool]$Keep; jvm_extra = @($JvmArg | Where-Object { $_ })
    }
    if ($HeapMin)  { $req['heap_min'] = $HeapMin }
    if ($ConsoleFile) {
        $req['console'] = @([System.IO.File]::ReadAllLines((Get-FullPath $ConsoleFile)) | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') })
    }
    if ($ChunkFile) {
        $req['chunks'] = @([System.IO.File]::ReadAllLines((Get-FullPath $ChunkFile)) | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') })
    }
    if ($NoChunks) { $req['no_chunks'] = $true }
    if ($ForceChunks) { $req['force_chunks'] = $true }
    if ($IndexDir) { $req['index_dir'] = (Get-FullPath $IndexDir) }
    $rc = Invoke-Engine 'run' $req
    if ($rc -eq $ExitCannot -or -not (Test-Path -LiteralPath (Join-Path $dir 'result.json'))) { return $ExitCannot }
    $logs = Join-Path $dir 'logs'
    if (-not $NoCheck -and (Test-Path -LiteralPath (Join-Path $logs 'latest.log'))) {
        $shaArg = 'tree'
        if ($Source.ContainsKey('sha')) { $shaArg = [string]$Source['sha'] }
        $hostExe = (Get-Process -Id $PID).Path
        $out = & $hostExe -NoProfile -ExecutionPolicy Bypass -File $LoudCheck -LogsDir $logs `
            -Manifest (Join-Path $dir 'check\liveness_manifest.json') -ExpectedState (Join-Path $dir 'check\expected_state.json') `
            -Baseline (Join-Path $dir 'check\baseline.json') -Sha $shaArg -MaxShow 400
        [System.IO.File]::WriteAllLines((Join-Path $dir 'loud-check.txt'), [string[]]@($out), $Utf8NoBom)
    }
    return (Invoke-Engine 'finish' @{ result_dir = $dir; no_check = [bool]$NoCheck })
}
function Resolve-ResultOrBoot {
    # a result folder, a result name, or a commit (booted when there is no usable result of it)
    param([string]$What)
    if ($What -match '[\\/]' -and (Test-Path -LiteralPath (Join-Path $What 'result.json'))) { return @{ dir = (Resolve-Path -LiteralPath $What).ProviderPath; rc = $ExitOk } }
    $named = Get-ResultDir $What
    if ($What -notmatch '[\\/]' -and (Test-Path -LiteralPath (Join-Path $named 'result.json'))) { return @{ dir = $named; rc = $ExitOk } }
    $sha = Resolve-Commit $What
    if (-not $sha) { Stop-Cannot "'$What' is neither a result folder, a saved result name (see -List) nor a commit" }
    $name12 = $sha.Substring(0, 12)
    $dir = Get-ResultDir $name12
    if (-not $Fresh -and (Test-Reusable $dir)) {
        Say "$What = $name12 : using the saved result ($dir); -Fresh boots it again"
        return @{ dir = $dir; rc = $ExitOk }
    }
    Say "$What = $name12 : booting it"
    $rc = Invoke-Boot (New-RefSource $What $sha) $name12
    return @{ dir = $dir; rc = $rc }
}
function Get-Worst {
    param([int[]]$Codes)
    if ($Codes -contains $ExitCannot) { return $ExitCannot }
    if ($Codes -contains $ExitBoot) { return $ExitBoot }
    if ($Codes -contains $ExitFindings) { return $ExitFindings }
    return $ExitOk
}

# ---- modes -------------------------------------------------------------------
if ($List) {
    if (-not (Test-Path -LiteralPath $ResultsRoot)) { Say "no results yet under $ResultsRoot"; exit $ExitOk }
    Say "results under $ResultsRoot"
    foreach ($d in @(Get-ChildItem -LiteralPath $ResultsRoot -Directory | Where-Object { $_.Name -notlike '.*' } | Sort-Object LastWriteTime -Descending)) {
        $r = Read-Result $d.FullName
        if ($null -eq $r) { continue }
        Write-Host ('  {0,-28} {1,-12} {2}  {3}' -f $d.Name, [string]$r.verdict, $d.LastWriteTime.ToString('yyyy-MM-dd HH:mm'), [string]$r.label)
    }
    exit $ExitOk
}

if ($Diff) {
    $pair = @($Diff | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
    if ($pair.Count -ne 2) { Stop-Cannot '-Diff takes two results: -Diff <base>,<new>' }
    $a = Resolve-ResultOrBoot $pair[0]
    $b = Resolve-ResultOrBoot $pair[1]
    $rc = Invoke-Engine 'diff' @{ base_dir = $a.dir; new_dir = $b.dir }
    exit (Get-Worst @($a.rc, $b.rc, $rc))
}

if ($Ref -and $Tree) { Stop-Cannot 'give -Ref (a commit) or -Tree (a checkout as it is on disk), not both' }
$source = $null
$resultName = $Name
if ($Ref) {
    $sha = Resolve-Commit $Ref
    if (-not $sha) { Stop-Cannot "'$Ref' is not a commit here (fetch it first?)" }
    if (-not $resultName) { $resultName = $sha.Substring(0, 12) }
} else {
    if (-not $Tree) { $Tree = $RepoRoot }
    $source = New-TreeSource $Tree
    if (-not $resultName) { $resultName = 'tree-' + ($source['leaf'] -replace '[^A-Za-z0-9._-]', '_') }
}
if ($resultName -match '[\\/:*?"<>|]' -or $resultName.StartsWith('.')) { Stop-Cannot "-Name '$resultName' is not usable as a folder name" }

if ($Setup -or $ModSet) {
    if ($Ref) { $source = New-RefSource $Ref $sha }
    $req = @{ source = $source; jar_cache = $JarCache }
    if ($IndexDir) { $req['index_dir'] = (Get-FullPath $IndexDir) }
    if ($Setup) { exit (Invoke-Engine 'setup' $req) }
    if ($ExpectList) { $req['expect_list'] = (Get-FullPath $ExpectList) }
    exit (Invoke-Engine 'modset' $req)
}

$codes = @()
$baseDir = $null
if ($Compare) {
    # the base first: when it has to be booted, the two boots run one after the other
    $base = Resolve-ResultOrBoot $Compare
    $baseDir = $base.dir
    if ($base.rc -eq $ExitCannot) { exit $ExitCannot }
}
$dir = Get-ResultDir $resultName
if ($Ref -and -not $Fresh -and (Test-Reusable $dir)) {
    Say "$Ref = $resultName : using the saved result ($dir); -Fresh boots it again"
    $codes += [int](Read-Result $dir).exit_code
    [void](Invoke-Engine 'finish' @{ result_dir = $dir; no_check = [bool]$NoCheck })
} else {
    if ($Ref) { $source = New-RefSource $Ref $sha }
    $codes += (Invoke-Boot $source $resultName)
}
if ($baseDir -and $codes[0] -ne $ExitCannot) {
    $codes += (Invoke-Engine 'diff' @{ base_dir = $baseDir; new_dir = $dir })
}
if ($WriteSnapshot) {
    if (-not $Ref) { Stop-Cannot '-WriteSnapshot needs -Ref <commit>: the snapshot describes a commit, not a working tree' }
    $codes += (Invoke-Engine 'snapshot' @{ result_dir = $dir; out_dir = (Join-Path $RepoRoot '.minecraft\dev\registry') })
}
$final = Get-Worst $codes
$word = @{ 0 = 'PASS'; 1 = 'FINDINGS'; 2 = 'COULD NOT RUN'; 3 = 'BOOT FAILED' }[$final]
Say "$word (exit $final)"
exit $final
