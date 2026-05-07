# Server-side PAT setup for auto log-push

`push_crash_logs.{bat,sh}` and the native `icraft serve` post-exit
flow auto-commit + auto-push server logs to the repo. Both require a
GitHub Personal Access Token to authenticate the push from the server
box, since the box typically runs without an interactive credential
helper.

## 1. Generate the PAT

GitHub.com → Settings → Developer settings → **Personal access tokens
→ Fine-grained tokens** → Generate new token.

| Field | Value |
|---|---|
| Token name | `icraft-server-log-push` (or anything memorable) |
| Expiration | 90 days (rotate on calendar) |
| Repository access | **Only select repositories** → `silvariasereneblossom/IridescentCraft` |
| Repository permissions → Contents | **Read and write** |

Generate, copy the `github_pat_...` string. You only see it once.

## 2. Install on the server box

Pick **one** of three options (precedence top to bottom):

### Option A — environment variable (recommended for service-mode)

Cleanest: never touches disk in plaintext.

**Windows (interactive, persists across reboots):**
```cmd
setx ICRAFT_GH_TOKEN "github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```
Restart any open cmd / PowerShell sessions to pick up the new env.

**Linux (systemd service):** add to the unit's `Environment=` line, or
via a drop-in:
```ini
[Service]
Environment="ICRAFT_GH_TOKEN=github_pat_xxx..."
```
Then `systemctl daemon-reload && systemctl restart icraft`.

### Option B — `.icraft_token` next to the running binary

Drop a file named `.icraft_token` in the same directory as
`icraft.exe` / `iridescentserver.bat`. One line, the PAT only, no
trailing whitespace:
```
github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
The repo root `.gitignore` excludes any `.icraft_token` so it never
gets committed.

### Option C — `.icraft_token` in `cfg.server_dir`

Same file format as Option B, but inside the modpack's
`server_distribution/` directory. Useful if the launcher binary lives
elsewhere on the box.

## 3. Verify

Run `push_crash_logs.bat` (no `--silent`) on the server box. It will
echo the path it took and, if a PAT is wired, will show the actual git
push output instead of swallowing errors. Successful push prints:
```
[postexit] Server logs pushed (via C:\path\to\repo)
```

If you see:
```
[postexit] WARN: no PAT configured ...
```
then none of A/B/C resolved a token. Check spelling of the env var,
the file path, and whether the `.icraft_token` has trailing whitespace.

If you see a real `git push` error message (auth failure, network
error, branch protection), the new versions of the scripts no longer
redirect stderr to nul, so the actual problem will surface in the
console for diagnosis.

## 4. Rotation

When the PAT expires (90 days default), GitHub stops accepting it.
Symptom: `git push` returns 403 with a message about "personal access
token has expired". Generate a new fine-grained PAT (step 1) and
update whichever location you used in step 2.

## Why a fine-grained PAT and not a classic token

Classic PATs grant repo-wide access to every repo the user owns.
Fine-grained PATs scope to specific repos and specific permissions.
For a server-box log-push, "Contents: write" on `IridescentCraft`
alone is the minimum viable surface.

## Why `http.extraHeader` instead of embedding the PAT in the URL

`git push https://USER:PAT@github.com/...` works but leaks the PAT
into:
- Process listings (`tasklist`, `ps aux`)
- `git reflog` and shell history
- Crash dumps if git itself crashes

`-c http.extraHeader="AUTHORIZATION: bearer <PAT>"` lives in
git's process memory only, never persists to `.git/config`, and
isn't visible to peer processes.
