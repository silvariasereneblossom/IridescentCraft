# Server-side PAT setup: reading the pack, pushing logs

> **The key now has to READ the pack repository (2026-10-25).** The pack
> repository `silvariasereneblossom/IridescentCraft` is private. The
> launcher's sync (`icraft-gui` / `icraft serve`: the branch HEAD, the compare
> between two commits, each changed file, the full zip, the launcher's own
> update) reads it only with this key: with no key, or a revoked or expired
> one, the sync cannot run, and the launcher log says
> `the GitHub key in use was rejected (HTTP 401)` or
> `No GitHub key is configured, and the repository is private`. So the key
> needs **read access to the contents of `IridescentCraft`**, whatever else it
> is for: a fine-grained key with Contents: Read on it (Read and write if the
> same key pushes), or a classic key with `repo` scope. Testers need no key:
> their installs read the pack through the pack server
> (`https://iridescentcraft.sereneblossom.gay/pack/`), which holds its own
> read-only key.

> **Out of date on where logs go.** Since 2026-10-12 nothing pushes logs into
> this (public) pack repository: the launcher (`icraft-gui`) pushes the
> server's logs to the PRIVATE repository `IridescentCraft-logs`, folder
> `server/`, and `push_crash_logs.{bat,sh}` do nothing. Logs and crash reports
> are never committed to the pack repository (`.gitignore`, ruling 21 of
> 2026-10-14). A fine-grained token made from the steps below would need
> access to `IridescentCraft-logs` as well; the box runs a classic token, and
> a fine-grained one has not been tried.

`push_crash_logs.{bat,sh}` and the native `icraft serve` post-exit
flow commit and push server logs to the repo automatically. Both need a
GitHub Personal Access Token to authenticate the push from the server
box, because the box usually runs without an interactive credential
helper.

## 1. Generate the PAT

GitHub.com → Settings → Developer settings → **Personal access tokens
→ Fine-grained tokens** → Generate new token.

| Field | Value |
|---|---|
| Token name | `icraft-server-log-push` (or anything memorable) |
| Expiration | 90 days (rotate on calendar) |
| Repository access | **Only select repositories** → `silvariasereneblossom/IridescentCraft` (and `IridescentCraft-logs` for the log push) |
| Repository permissions → Contents | **Read and write** (Read is the minimum: the sync reads the private pack with it) |

Generate the token and copy the `github_pat_...` string. GitHub shows it
only once.

## 2. Install on the server box

Pick **one** of the three options below (they take precedence in this
order, top to bottom):

### Option A: environment variable (recommended for service-mode)

This is the cleanest option: the token never touches disk in plaintext.

**Windows (interactive, persists across reboots):**
```cmd
setx ICRAFT_GH_TOKEN "github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```
Restart any open cmd / PowerShell sessions so they see the new variable.

**Linux (systemd service):** add to the unit's `Environment=` line, or
via a drop-in:
```ini
[Service]
Environment="ICRAFT_GH_TOKEN=github_pat_xxx..."
```
Then `systemctl daemon-reload && systemctl restart icraft`.

### Option B: `.icraft_token` next to the running binary

Put a file named `.icraft_token` in the same directory as
`icraft.exe` / `iridescentserver.bat`. One line, the PAT only, no
trailing whitespace:
```
github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
The repo root `.gitignore` excludes any `.icraft_token` so it never
gets committed.

### Option C: `.icraft_token` in `cfg.server_dir`

Same file format as Option B, but inside the modpack's
`server_distribution/` directory. Useful if the launcher binary lives
elsewhere on the box.

## 3. Verify

Run `push_crash_logs.bat` (no `--silent`) on the server box. It echoes
the path it took and, if a PAT is set up, shows the real git push
output instead of hiding errors. A successful push prints:
```
[postexit] Server logs pushed (via C:\path\to\repo)
```

If you see:
```
[postexit] WARN: no PAT configured ...
```
then none of A/B/C resolved a token. Check the spelling of the
environment variable, the file path, and whether `.icraft_token` has
trailing whitespace.

A real `git push` error message (auth failure, network error, branch
protection) shows in the console, because the new versions of the
scripts no longer redirect stderr to nul.

## 4. Rotation

When the PAT expires (90 days default), GitHub stops accepting it.
Symptoms: the sync stops (`the GitHub key in use was rejected (HTTP 401)`
in the launcher log, "API UNREACHABLE" on the badge, and the server starts
on the files it already has), and `git push` returns 403 with a message about
"personal access token has expired". Generate a new PAT (step 1) and update
whichever location you used in step 2 before it runs out: on the private
repository an expired key stops the updates, not only the log push.

## Why a fine-grained PAT and not a classic token

Classic PATs grant repo-wide access to every repo the user owns.
Fine-grained PATs scope to specific repos and specific permissions.
For the server box, "Contents: read" on `IridescentCraft` is the smallest
grant the sync works with; the log push adds write on the logs repository.

## Why `http.extraHeader` instead of embedding the PAT in the URL

`git push https://USER:PAT@github.com/...` works but leaks the PAT
into:
- Process listings (`tasklist`, `ps aux`)
- `git reflog` and shell history
- Crash dumps if git itself crashes

`-c http.extraHeader="AUTHORIZATION: bearer <PAT>"` lives in
git's process memory only, never persists to `.git/config`, and
isn't visible to peer processes.
