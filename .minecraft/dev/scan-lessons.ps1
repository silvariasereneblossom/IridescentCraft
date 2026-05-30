# =============================================================================
# scan-lessons.ps1 -- auto-capture lessons-learned worker.
#
# Reads recent commit range, packages it into a prompt, calls the Anthropic
# API directly, writes the response into the canonical lessons docs in
# IridescentCraft-internal, commits + pushes.
#
# Triggered by lessons-pre-push.ps1 when commits-since-last-scan crosses
# threshold. Can also be invoked manually:
#   pwsh .minecraft\dev\scan-lessons.ps1 -SinceSha <sha>
#
# Requires:
#   ANTHROPIC_API_KEY env var (write the API key here; the script reads it)
#   git on PATH, the IridescentCraft-internal repo cloned alongside
#
# Failure modes: silent. Any error is logged to .lessons-scan.log and the
# script exits 0. Lessons capture must never break operator workflows.
# =============================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$SinceSha = "",       # if empty, defaults to HEAD~5
    [string]$Model = "claude-opus-4-7",
    [int]$MaxTokens = 8192
)

$ErrorActionPreference = 'Continue'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$InternalRepo = Resolve-Path (Join-Path $RepoRoot "..\IridescentCraft-internal") -ErrorAction SilentlyContinue
$LogFile = Join-Path $ScriptDir ".lessons-scan.log"

function LogLine([string]$msg) {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$stamp] $msg" | Add-Content $LogFile -Encoding UTF8
}

LogLine "scan started; SinceSha=$SinceSha"

# ---- Preconditions -------------------------------------------------------

if (-not $InternalRepo) {
    LogLine "ERROR: IridescentCraft-internal repo not found alongside this repo"
    exit 0
}
$LessonsMain = Join-Path $InternalRepo.Path "dev\lessons-learned.md"
$LessonsTetra = Join-Path $InternalRepo.Path "dev\lessons-learned-Tetra.md"
foreach ($f in @($LessonsMain, $LessonsTetra)) {
    if (-not (Test-Path $f)) {
        LogLine "ERROR: $f not found"
        exit 0
    }
}

$apiKey = $env:ANTHROPIC_API_KEY
if ([string]::IsNullOrEmpty($apiKey)) {
    LogLine "ERROR: ANTHROPIC_API_KEY not set; nothing to do"
    exit 0
}

# ---- Build commit context ------------------------------------------------

if ([string]::IsNullOrEmpty($SinceSha)) {
    $SinceSha = (& git -C $RepoRoot rev-parse "HEAD~5" 2>$null)
}
$range = "$SinceSha..HEAD"
$commits = & git -C $RepoRoot log $range --pretty=format:"%h | %s" 2>$null
if (-not $commits) {
    LogLine "INFO: no commits in range $range; exit"
    exit 0
}
$commitCount = ($commits | Measure-Object).Count
LogLine "scanning $commitCount commits in range $range"

$fullLog = & git -C $RepoRoot log $range --stat --pretty=format:"=== %h %s ===%n%b%n" 2>$null
# Cap the input so we don't blow the context budget. ~60k chars is roughly
# 15k tokens, well within Sonnet/Opus capacity.
$maxInputChars = 60000
if ($fullLog.Length -gt $maxInputChars) {
    $fullLog = $fullLog.Substring(0, $maxInputChars) + "`n... [truncated]"
    LogLine "WARN: commit log truncated to $maxInputChars chars"
}

# Pull a sample of existing lessons-learned for format reference.
$existingMain = (Get-Content $LessonsMain -TotalCount 200) -join "`n"
$existingTetra = (Get-Content $LessonsTetra -TotalCount 200) -join "`n"

# ---- Build the prompt ----------------------------------------------------

$systemPrompt = @"
You are the lessons-learned auto-capture worker for the IridescentCraft modpack.
You read a range of recent commits and identify lesson-worthy patterns, then
write entries directly into the canonical lessons-learned docs.

Trigger patterns (a lesson is worth capturing when):
- Multi-commit "fix then real fix" sequences (sign of misdiagnosis)
- Bytecode-decompile commits (Tetra-lesson rule trigger)
- "FAIL"/"ERROR"/"WARN"/"abort" in commit messages
- NBT migrator / data-shape changes
- Cross-mod interaction bugs ("X breaks when Y is loaded")
- Multi-session blockers that finally resolved
- Distribution-architecture lessons (dev assumptions leaking to operators)
- Silent failure modes

Entry format (match the existing docs precisely; see samples in the user message):
- Date heading
- Symptoms
- Actual root cause
- Dead ends
- Fix
- Takeaway

Tetra-specific lessons go in lessons-learned-Tetra.md. Everything else goes in
lessons-learned.md. Be concise: 30-60 lines per entry. Cite specific commits.

Output format: ONE response with two fenced code blocks, in this exact order:

```lessons-main
<contents to APPEND to lessons-learned.md, with leading "`n---`n`n" separator>
```

```lessons-tetra
<contents to APPEND to lessons-learned-Tetra.md, with leading "`n---`n`n" separator>
```

If a section has no new entries, emit an empty code block but still emit it.
Do not include any other prose -- just the two fenced blocks.
"@

$userPrompt = @"
COMMIT RANGE: $range ($commitCount commits)

COMMIT LOG WITH DIFFS:
$fullLog

EXISTING lessons-learned.md (first 200 lines for format reference):
$existingMain

EXISTING lessons-learned-Tetra.md (first 200 lines for format reference):
$existingTetra

Analyze the commit range and write any new lesson entries that should be
captured. Match the format exactly. Output the two fenced code blocks only.
"@

# ---- Call Anthropic API --------------------------------------------------

$body = @{
    model = $Model
    max_tokens = $MaxTokens
    system = $systemPrompt
    messages = @(
        @{ role = "user"; content = $userPrompt }
    )
} | ConvertTo-Json -Depth 6 -Compress

$headers = @{
    "x-api-key" = $apiKey
    "anthropic-version" = "2023-06-01"
    "content-type" = "application/json"
}

try {
    LogLine "calling Anthropic API (model=$Model)"
    $resp = Invoke-RestMethod -Uri "https://api.anthropic.com/v1/messages" `
        -Method Post -Headers $headers -Body $body -TimeoutSec 300
} catch {
    LogLine "ERROR: API call failed: $($_.Exception.Message)"
    exit 0
}

$text = $resp.content[0].text
if (-not $text) {
    LogLine "ERROR: empty response"
    exit 0
}
LogLine "API returned $($text.Length) chars"

# ---- Parse fenced blocks --------------------------------------------------

function ExtractBlock([string]$text, [string]$lang) {
    $pattern = "(?s)``````$lang`r?`n(.*?)`r?`n``````"
    $m = [regex]::Match($text, $pattern)
    if ($m.Success) { return $m.Groups[1].Value } else { return "" }
}

$mainEntry = ExtractBlock $text "lessons-main"
$tetraEntry = ExtractBlock $text "lessons-tetra"

$wrote = $false
if ($mainEntry.Trim()) {
    Add-Content -Path $LessonsMain -Value $mainEntry -Encoding UTF8
    LogLine "appended $($mainEntry.Length) chars to lessons-learned.md"
    $wrote = $true
}
if ($tetraEntry.Trim()) {
    Add-Content -Path $LessonsTetra -Value $tetraEntry -Encoding UTF8
    LogLine "appended $($tetraEntry.Length) chars to lessons-learned-Tetra.md"
    $wrote = $true
}

if (-not $wrote) {
    LogLine "no entries generated; nothing to commit"
    exit 0
}

# ---- Commit + push to internal repo --------------------------------------

try {
    Push-Location $InternalRepo.Path
    & git add dev/lessons-learned.md dev/lessons-learned-Tetra.md
    $msg = "lessons-learned: auto-capture range $($SinceSha.Substring(0,7))..HEAD"
    & git commit -m $msg 2>&1 | Out-Null
    & git push 2>&1 | Out-Null
    LogLine "committed + pushed lessons updates to IridescentCraft-internal"
} catch {
    LogLine "WARN: commit/push failed: $($_.Exception.Message); entries are still on disk"
} finally {
    Pop-Location
}

exit 0
