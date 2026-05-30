# =============================================================================
# qa-lessons.ps1 -- periodic QA pass on auto-captured lessons-learned.
#
# Triggered by lessons-pre-push.ps1 when push-count-since-last-QA crosses
# threshold (default 20 pushes). Same delegation pattern as scan-lessons.ps1
# but with a different prompt: read the N most-recent entries, check accuracy
# + conciseness, flag duplicates / overlong / mis-attributed entries.
#
# Output: a `qa-report-YYYY-MM-DD.md` written into IridescentCraft-internal's
# dev/qa-reports/ directory. NOT auto-edits of the lessons docs themselves --
# editorial calls remain human (operator reviews the report and acts).
#
# Manual invocation:
#   pwsh .minecraft\dev\qa-lessons.ps1
#
# Requires ANTHROPIC_API_KEY. Silent on any error.
# =============================================================================

[CmdletBinding()]
param(
    [int]$EntriesToReview = 30,       # how many most-recent entries to QA
    [string]$Model = "claude-opus-4-7",
    [int]$MaxTokens = 8192
)

$ErrorActionPreference = 'Continue'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$InternalRepo = Resolve-Path (Join-Path $RepoRoot "..\IridescentCraft-internal") -ErrorAction SilentlyContinue
$LogFile = Join-Path $ScriptDir ".lessons-qa.log"

function LogLine([string]$msg) {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$stamp] $msg" | Add-Content $LogFile -Encoding UTF8
}

LogLine "QA pass started"

if (-not $InternalRepo) {
    LogLine "ERROR: internal repo not found"
    exit 0
}
$apiKey = $env:ANTHROPIC_API_KEY
if ([string]::IsNullOrEmpty($apiKey)) {
    LogLine "ERROR: ANTHROPIC_API_KEY not set"
    exit 0
}

$LessonsMain = Join-Path $InternalRepo.Path "dev\lessons-learned.md"
$LessonsTetra = Join-Path $InternalRepo.Path "dev\lessons-learned-Tetra.md"
$ReportsDir = Join-Path $InternalRepo.Path "dev\qa-reports"
if (-not (Test-Path $ReportsDir)) { New-Item -ItemType Directory -Path $ReportsDir | Out-Null }

# Read tail of each lessons file -- the N most-recent entries.
function TailEntries([string]$file, [int]$count) {
    if (-not (Test-Path $file)) { return "" }
    # Entries are separated by "`n---`n". Read the file, split, take tail.
    $content = Get-Content $file -Raw
    $parts = $content -split "`r?`n---`r?`n"
    $tail = $parts | Select-Object -Last $count
    return ($tail -join "`n---`n")
}

$mainTail = TailEntries $LessonsMain $EntriesToReview
$tetraTail = TailEntries $LessonsTetra $EntriesToReview

$systemPrompt = @"
You are the QA reviewer for the IridescentCraft modpack's auto-captured
lessons-learned docs. Your job: read the N most-recent entries written by
the auto-capture worker, and produce a QA report.

Check each entry for:
1. **Accuracy** -- does the cited root cause match what the commits actually
   show? Does the entry mis-attribute a fix or oversimplify?
2. **Conciseness** -- entries > 60 lines or covering topics already
   documented in earlier entries are flagged.
3. **Cross-ref staleness** -- linked commits should still exist (don't check
   this; just flag entries with unusually-old commit SHAs that may have been
   rewritten).
4. **Duplicates / near-duplicates** -- entries with > 70% topic overlap
   should be flagged for merge.

OUTPUT a single markdown document with this structure:

# QA Report YYYY-MM-DD

## Summary
N entries reviewed (M main + K Tetra). X flagged, Y mergeable.

## Flagged entries

### [entry title] -- [accuracy | conciseness | duplicate | cross-ref]
**Issue**: <one-paragraph description>
**Suggested fix**: <one-paragraph action recommendation>

(Repeat per flagged entry.)

## Mergeable clusters
### Cluster: [shared topic]
Entries: [list of titles]
Suggested merge: [one-paragraph proposal]

## Clean entries
Brief list of entry titles that passed QA cleanly.

Do NOT auto-edit the lessons docs -- this report is a recommendation only.
Operator will act on it (edit / merge / archive) in their next session.
"@

$userPrompt = @"
=== lessons-learned.md (last $EntriesToReview entries) ===
$mainTail

=== lessons-learned-Tetra.md (last $EntriesToReview entries) ===
$tetraTail

Produce the QA report. Be concise; this is editorial triage, not a rewrite.
"@

$body = @{
    model = $Model
    max_tokens = $MaxTokens
    system = $systemPrompt
    messages = @(@{ role = "user"; content = $userPrompt })
} | ConvertTo-Json -Depth 6 -Compress

$headers = @{
    "x-api-key" = $apiKey
    "anthropic-version" = "2023-06-01"
    "content-type" = "application/json"
}

try {
    LogLine "calling Anthropic API for QA review"
    $resp = Invoke-RestMethod -Uri "https://api.anthropic.com/v1/messages" `
        -Method Post -Headers $headers -Body $body -TimeoutSec 300
} catch {
    LogLine "ERROR: API call failed: $($_.Exception.Message)"
    exit 0
}

$report = $resp.content[0].text
if (-not $report) {
    LogLine "ERROR: empty response"
    exit 0
}

$date = Get-Date -Format "yyyy-MM-dd"
$reportFile = Join-Path $ReportsDir "qa-report-$date.md"
Set-Content -Path $reportFile -Value $report -Encoding UTF8
LogLine "wrote QA report to $reportFile"

# Commit + push the report.
try {
    Push-Location $InternalRepo.Path
    & git add "dev/qa-reports/qa-report-$date.md"
    & git commit -m "lessons-learned: QA report $date" 2>&1 | Out-Null
    & git push 2>&1 | Out-Null
    LogLine "committed + pushed QA report"
} catch {
    LogLine "WARN: commit/push failed: $($_.Exception.Message)"
} finally {
    Pop-Location
}

exit 0
