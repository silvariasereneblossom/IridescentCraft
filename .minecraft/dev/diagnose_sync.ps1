# IridescentCraft sync diagnostic - read-only - PowerShell 5.1 safe (ASCII only)
# Paste this whole block into a PowerShell window on the NEW machine.
# It CHANGES NOTHING. It prints a PASS/FAIL report; each FAIL names the hypothesis id.
# If your instance is NOT at the default APPDATA path, first run:  cd <yourInstanceFolder>
# (the folder that contains mmc-pack.json + instance.cfg + .minecraft), then paste.
$ErrorActionPreference = 'SilentlyContinue'
function Line($n){ Write-Host ('=' * $n) }
function IIf($cond,$a,$b){ if($cond){ return $a } else { return $b } }
function Result($label,$pass,$detail,$hyp){
  $tag = IIf $pass 'PASS' 'FAIL'
  $h = ''
  if($hyp -and (-not $pass)){ $h = "  [$hyp]" }
  Write-Host ("[{0}] {1}{2}" -f $tag,$label,$h)
  if($detail){ Write-Host ("       {0}" -f $detail) }
}
Line 70
Write-Host 'IridescentCraft NEW-MACHINE sync diagnostic (read-only)'
Line 70

# Locate the instance. Prefer APPDATA Prism layout; allow running from inside it.
$cands = @(
  "$env:APPDATA\PrismLauncher\instances\IridescentCraft",
  (Get-Location).Path
)
$inst = $null
foreach($c in $cands){ if($c -and (Test-Path (Join-Path $c 'mmc-pack.json'))){ $inst = (Resolve-Path $c).Path; break } }
if(-not $inst){
  foreach($c in $cands){ if($c -and (Test-Path (Join-Path $c 'instance.cfg'))){ $inst = (Resolve-Path $c).Path; break } }
}
if(-not $inst){
  Write-Host '[FAIL] Could not locate the PrismLauncher instance dir.  [FRESH-02]'
  Write-Host '       Re-run this script from inside the instance folder (the one with mmc-pack.json + instance.cfg + .minecraft).'
  return
}
$mc  = Join-Path $inst '.minecraft'
$cfg = Join-Path $inst 'instance.cfg'
Write-Host ("Instance dir : {0}" -f $inst)
Write-Host ("Game dir     : {0}" -f $mc)
Write-Host ("instance.cfg : {0}" -f $cfg)
Line 70

# ---- 1. git on PATH (FRESH-09) ----
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
$gitOK = ($gitCmd -ne $null)
$gv = IIf $gitOK 'present' 'git NOT on PATH'
if($gitOK){ $gv = (& git --version) 2>$null }
Result 'git available on PATH' $gitOK $gv 'FRESH-09'
$machGit = (([Environment]::GetEnvironmentVariable('Path','Machine')) -match 'Git')
$userGit = (([Environment]::GetEnvironmentVariable('Path','User')) -match 'Git')
Write-Host ("       Machine PATH has Git: {0} ; User PATH has Git: {1} (Prism inherits Machine+User PATH; user-only install can still fail for Prism)" -f $machGit,$userGit)

# ---- 2. instance is a git clone (PROBE-2 / FRESH-02) ----
$isClone = Test-Path (Join-Path $inst '.git')
$d2 = IIf $isClone '.git found' 'NO .git - file-copy/Import install; git sync path NEVER runs'
Result 'instance is a git clone (.git present)' $isClone $d2 'PROBE-2'

# ---- 3. instance.cfg wiring (CHAIN-01 / FRESH-03 / PROBE-3) ----
$cfgTxt = ''
if(Test-Path $cfg){
  $cfgTxt = Get-Content -Path $cfg -Raw
  $oc = ($cfgTxt -match '(?m)^OverrideCommands=true')
  $ocd = IIf $oc 'set' 'NOT true -> PreLaunchCommand is IGNORED by Prism'
  Result 'OverrideCommands=true' $oc $ocd 'FRESH-03'
  $plMatch = [regex]::Match($cfgTxt,'(?m)^PreLaunchCommand=(.*)$')
  $pl = ''
  if($plMatch.Success){ $pl = $plMatch.Groups[1].Value.Trim() }
  $plOK = ($pl -match 'prism_prelaunch\.bat')
  $plLegacy = ($pl -match 'pull.*--ff-only')
  $plZip = ($pl -match 'sync_client')
  $plHyp = 'CHAIN-01'
  if($plLegacy){ $plHyp = 'PROBE-3' } elseif($plZip){ $plHyp = 'CHAIN-02' }
  Result 'PreLaunchCommand -> prism_prelaunch.bat' $plOK ("value: [{0}]" -f $pl) $plHyp
  if($plLegacy){ Write-Host '       NOTE: legacy git-pull --ff-only seed - wedge-prone, never self-upgrades (PROBE-3/FRESH-05)' }
  if($plZip){ Write-Host '       NOTE: sync_client zip path - unauth/fail-open; wrong path for a git clone (CHAIN-02/FRESH-04)' }
}else{
  Result 'instance.cfg present' $false 'instance.cfg NOT FOUND' 'FRESH-03'
}

# ---- 4. remote URL + auth probe (FRESH-01 / PROBE-1 / CHAIN-04) ----
if($isClone -and $gitOK){
  $rurl = (& git -C $inst remote get-url origin) 2>$null
  $rurlSafe = $rurl -replace '://[^@/]+@','://<creds>@'
  Write-Host ("remote origin: {0}" -f $rurlSafe)
  $hasEmbedded = ($rurl -match '://[^@/]+@')
  Write-Host ("       embedded creds in URL: {0}" -f $hasEmbedded)
  $env:GIT_TERMINAL_PROMPT='0'
  $job = Start-Job -ScriptBlock { param($d) $o = & git -C $d ls-remote origin -h refs/heads/main 2>&1; "$o"; "EXIT=$LASTEXITCODE" } -ArgumentList $inst
  $done = Wait-Job $job -Timeout 30
  if($done){
    $out = Receive-Job $job
    $codeLine = ($out | Where-Object { $_ -match '^EXIT=' } | Select-Object -Last 1)
    $code = 1
    if($codeLine){ $code = [int]($codeLine -replace 'EXIT=','') }
    $authOK = ($code -eq 0)
    Result 'git ls-remote auth/reachability' $authOK ("ls-remote exit={0}" -f $code) 'FRESH-01'
    if(-not $authOK){ Write-Host ("       output: {0}" -f (($out | Where-Object { $_ -notmatch '^EXIT=' }) -join ' | ')) }
  }else{
    Result 'git ls-remote auth/reachability' $false 'TIMED OUT (>30s) - likely a hanging credential prompt' 'CHAIN-04'
    Stop-Job $job
  }
  Remove-Job $job -Force
}else{
  Result 'git ls-remote auth/reachability' $false 'skipped (not a clone or no git)' 'FRESH-01'
}

# ---- 5. behind-count + wedge check (CHAIN-03 / CHAIN-05 / PROBE-5) ----
if($isClone -and $gitOK){
  & git -C $inst fetch origin --prune --dry-run 2>$null
  $fetchExit = $LASTEXITCODE
  Result 'git fetch (dry-run) succeeds' ($fetchExit -eq 0) ("fetch dry-run exit={0}" -f $fetchExit) 'CHAIN-03'
  $behind = (& git -C $inst rev-list --count HEAD..origin/main) 2>$null
  if(-not $behind){ $behind = 'unknown' }
  Result 'HEAD is up to date with origin/main' ("$behind" -eq '0') ("commits behind origin/main: {0}" -f $behind) 'CHAIN-03'
  & git -C $inst merge-base --is-ancestor f525babc3 HEAD 2>$null
  $hasFix = ($LASTEXITCODE -eq 0)
  $fd = IIf $hasFix 'has reset --hard force-sync' 'WEDGED: HEAD predates f525bab - manual reset needed'
  Result 'force-sync prelaunch fix present (f525bab in history)' $hasFix $fd 'CHAIN-05'
  $dirty = (& git -C $inst status --porcelain) 2>$null
  $dirtyTracked = @($dirty | Where-Object { $_ -and ($_ -notmatch '^\?\?') })
  Result 'no dirty TRACKED files' ($dirtyTracked.Count -eq 0) ("dirty tracked: {0}" -f $dirtyTracked.Count) 'CHAIN-05'
  if($dirtyTracked.Count -gt 0){ $dirtyTracked | Select-Object -First 8 | ForEach-Object { Write-Host ("         {0}" -f $_) } }
}

# ---- 6. ExecutionPolicy (FRESH-08 - informational, ruled out) ----
$ep = Get-ExecutionPolicy
Write-Host ("[INFO] ExecutionPolicy={0} (not load-bearing - hooks use -ExecutionPolicy Bypass -File) [FRESH-08]" -f $ep)

# ---- 7. .icraft markers + Phase-2 scripts (CHAIN-03/CHAIN-06) ----
# Hardened scripts write .icraft_sync_status.json ({"ok":true/false,...}); pre-hardening
# builds wrote .icraft_sync_failed. Check the new sentinel first, then the legacy one.
$statusFile = Join-Path $mc '.icraft_sync_status.json'
if(Test-Path $statusFile){
  $sd = ((Get-Content $statusFile -Raw) -replace "`r`n",' ')
  if($sd -match '"ok"\s*:\s*true'){
    Result 'last sync reported ok (.icraft_sync_status.json)' $true $sd ''
  }else{
    Result 'last sync reported ok (.icraft_sync_status.json)' $false ("status: {0}" -f $sd) 'CHAIN-03'
  }
}else{
  Write-Host '[INFO] .icraft_sync_status.json: not present (hardening not yet deployed or hook never ran)'
}
$legacySentinel = Join-Path $mc '.icraft_sync_failed'
if(Test-Path $legacySentinel){
  $sd = ((Get-Content $legacySentinel -Raw) -replace "`r`n",' ')
  Result 'no legacy .icraft_sync_failed sentinel' $false ("present: {0}" -f $sd) 'CHAIN-03'
}
$lastSha = Join-Path $mc '.icraft_last_sha'
if(Test-Path $lastSha){ Write-Host ("[INFO] .icraft_last_sha = {0}" -f ((Get-Content $lastSha -Raw).Trim())) }
foreach($s in 'reconcile_client_index.ps1','cleanup_stale_jars.ps1','download_mods.ps1','wire_instance_cfg.ps1'){
  $p = Join-Path $mc ("distribution\client\{0}" -f $s)
  $ex = Test-Path $p
  $ed = IIf $ex 'ok' 'missing -> step silently skipped'
  Result ("Phase-2 script present: {0}" -f $s) $ex $ed 'CHAIN-06'
}
$batOK = Test-Path (Join-Path $mc 'prism_prelaunch.bat')
Result 'prism_prelaunch.bat present in .minecraft' $batOK '' 'CHAIN-01'

Line 70
Write-Host 'End of report. Any [FAIL] line names the matching hypothesis id in brackets.'
Line 70