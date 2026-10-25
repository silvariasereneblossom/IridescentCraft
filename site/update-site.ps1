# Fetches the published IridescentCraft site (branch site-build) into the web root.
# Meant for a Windows scheduled task running as SYSTEM every 15 minutes.
# Git data lives OUTSIDE the web root, so no .git folder is ever served.
param(
    [string]$Url     = 'https://github.com/silvariasereneblossom/IridescentCraft.git',
    [string]$GitDir  = 'C:\ProgramData\IridescentCraftSite\site.git',   # git data (not served)
    [string]$WebRoot = 'C:\inetpub\iridescentcraft'                     # folder the web server serves
)
$git = 'C:\Program Files\Git\cmd\git.exe'
$env:GIT_TERMINAL_PROMPT = '0'      # never prompt for credentials
$env:GCM_INTERACTIVE     = 'never'  # Git Credential Manager: no UI
# Anonymous, no credential helper, files byte-identical to the build, no ownership check trouble as SYSTEM.
$g = @('-c', 'credential.helper=', '-c', 'core.autocrlf=false', '-c', 'safe.directory=*',
       '--git-dir', $GitDir, '--work-tree', $WebRoot)

if (-not (Test-Path (Join-Path $GitDir 'HEAD'))) {
    & $git init --quiet --bare $GitDir
    if ($LASTEXITCODE -ne 0) { exit 1 }
}
New-Item -ItemType Directory -Force -Path $WebRoot | Out-Null

# Shallow fetch of the single commit; '+' accepts the force-push of an unrelated commit.
& $git @g fetch --quiet --depth 1 --no-tags $Url '+refs/heads/site-build:refs/remotes/origin/site-build'
if ($LASTEXITCODE -ne 0) { exit 1 }   # offline or GitHub down: keep serving the current files

$new = (& $git @g rev-parse 'refs/remotes/origin/site-build^{commit}').Trim()
$cur = (& $git @g rev-parse --verify --quiet 'HEAD^{commit}' 2>$null)
if ($cur -and $cur.Trim() -eq $new) { exit 0 }   # already up to date

# Updates the web root to the new commit: changed files are rewritten and files the
# previous build had but this one does not are deleted. Files git never tracked
# (a web.config, say) are left alone.
& $git @g checkout --quiet --force --detach $new
if ($LASTEXITCODE -ne 0) { exit 1 }

# Drop the previous build's objects (the branch has no history to keep).
& $git @g gc --quiet --prune=now
exit 0
