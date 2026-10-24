# The boot-log checker (`dev/loud/`)

`loud-check.ps1` reads one boot's logs and says whether anything is broken that nobody was told about. Its header
says what it checks, how to run it and what it writes; this page is the format of `baseline.json`, the list of lines
somebody has read. `replay-test.ps1` proves the checker (by hand before a push that changes it; CI after the push).

## `baseline.json`

The NEW tier (check 5) judges the ERROR / FATAL lines of `latest.log` and the WARN lines of the KubeJS logs by their
**signature**: the line without its clock and thread, with UUIDs, addresses, `.js#<line>` numbers and numbers of two
or more digits replaced, cut at 200 characters (`Get-Signature`; the internal launcher's log pass has a port of it,
held equal by a table the PowerShell function produced). A line whose signature is in neither list is `NEW`, AMBER.

The file is public: no entry may carry a player name, a chat line or an address.

`"version": 2` (since 2026-10-24). A version 1 file (no `count` / `family` on its defects) is still read, with the
rule it was written for: every listed defect is a finding (`defect:`, AMBER). The boot gate (`dev/boot`) boots old
commits, whose baselines are version 1.

### `signatures`: accepted

| field | |
|---|---|
| `log` | `latest.log`, `kubejs/server.log` or `kubejs/startup.log` |
| `sig` | the signature, exactly |
| `count` | the most one boot prints it. Seen three times that often (per load pass) it is reported again (`grew:`) |
| `reason` | what the line is (not that it is fine). Required |
| `accepted` | the date. Required |
| `runtime` | `true`: printed while the server runs (a player, the world, the network), not in every boot, never stale |

### `defects`: known, not accepted

A defect that was read and is waiting for its fix. The operator's rule of 2026-10-24 (decision 185): "A known defect
whose line and count stay the same from boot to boot is accepted automatically and listed once; one that changes or
grows comes back as a finding."

| field | |
|---|---|
| `log`, `sig` | as above: the line as recorded |
| `count` | the most one boot prints it (1 or more). Required |
| `family` | the first characters of `sig` that stay when the wording changes, 16 or more, e.g. `ERROR [crust/configs/]: Failed first-time loading of config file`. Required |
| `what` | what the defect is, short. Required |
| `listed` | the date |
| `runtime` | as above |

What a boot gets for it:

| the boot prints | report | finding |
|---|---|---|
| the line, `count` times or (per load pass) up to `count` x passes | `KNOWN UNCHANGED defect:<id>`, once | none: GREEN stays GREEN, exit code and findings log untouched |
| the line, fewer than `count` times | `KNOWN FEWER defect:<id>`, once | none (see below) |
| the line, more than `count` x passes | | `defect-grew:<id>` AMBER: recorded x, now x |
| a line of its `family` with other words, in its log | | `defect-changed:<id>` AMBER: both wordings |
| its line, or its family, in another log | | `defect-moved:<id>` AMBER: both logs |
| nothing of it | the entry may go STALE (check 6) | none |

**A lower count is not a finding.** The line it stands for is still printed, as recorded, and printing it less often is
never a new failure: a fix in progress, a boot that loaded part of the pack, or a `/reload` that did not reprint it.
Calling it a change would raise AMBER for the good direction and teach people to ignore the tier. It is listed as
FEWER so that someone can lower `count`: until then a return to the recorded count stays quiet. A line that is gone
is check 6's: absent from two complete boots in a row, the entry is reported `STALE DEFECT`, to be deleted.

The longest matching `family` wins; on a tie, the defect listed first. A family is only for lines that are in neither
list: an accepted line is never turned into a defect's change.

When a defect is fixed, delete its entry (the STALE report says when). Do not move one into `signatures` to quiet a
change: a change of a known defect is what the rule asks to see.

### Adding entries

`loud-check.ps1 -LogsDir <logs> -ProposeBaseline <file>` writes every signature of a boot with `reason` and
`accepted` empty; a file like that is refused until someone fills them in. A defect is written by hand, with its
count from the boots on the box (the most in one log) and its family.
