# Protocol 7: Commit & Ship

Commit current changes, push to remote, create or update a pull request, and update session logs if the work touches a project with logging requirements.

## Trigger

"Run Protocol 7" or "Commit and ship"

## Procedure

### 1. Review Changes

```bash
git status
git diff --stat
```

Verify that only intended files are modified. Check for:
- Unintended files (`.env`, credentials, scratch files)
- Files that should be staged separately (different logical changes)

### 2. Update Wiki Files

Before committing, check whether any related wiki pages need updating to reflect the changes. For example:

- New section or topic → update `home.md` links
- Changed configuration → update relevant overview pages
- New project → update project index

Walk through the modified files and ask: *"Does any other page reference this, or should any other page now link to this?"*

If anything looks off or you're unsure whether a page needs updating, **check with the user before proceeding**.

### 3. Stage and Commit

Stage specific files by name (never `git add -A` or `git add .`):

```bash
git add <file1> <file2> ...
```

Write a descriptive commit message. Use imperative mood, focus on *why* not *what*:

```bash
git commit -m "$(cat <<'EOF'
<commit message>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

If multiple logical changes are present, create separate commits for each.

### 4. Rebase and Push

Ensure the branch includes the latest merged changes before pushing:

```bash
git fetch origin main && git rebase origin/main
git push origin dev
```

If the rebase has conflicts, resolve them before pushing. Never force-push without user approval.

### 5. Create or Update Pull Request

Check if a PR from `dev` to `main` is already open. If one exists, pushing to `dev` already updated it. If not, create one.

<!-- Customize for your Git hosting platform:

GitHub:
  gh pr list --state open --head dev
  gh pr create --base main --head dev --title "..." --body "..."

Gitea/Forgejo:
  curl -s "https://your-git.example.com/api/v1/repos/OWNER/REPO/pulls?state=open" \
    -H "Authorization: token $TOKEN"

GitLab:
  glab mr list --source-branch dev
  glab mr create --source-branch dev --target-branch main --title "..."
-->

### 6. Session Log Check

Determine if the changes touch a project with logging requirements. Check the table below:

| Project | Logging Location | Trigger |
|---------|-----------------|---------|
<!-- Add rows as you set up session logging for projects via Protocol 5. Example:
| Infrastructure | `infrastructure/logs/` + `infrastructure/session-log.md` | Changes to `infrastructure/` |
| My Project | `projects/my-project/logs/` + `projects/my-project/session-log.md` | Changes to `projects/my-project/` |
-->

If logging is required:

1. **Create a session log file** in the appropriate logs directory:
   - Filename: `YYYY-MM-DD-<slug>.md` (letter suffix if multiple logs on same day)
   - Content: date, session context, decisions made, files updated, pending items

2. **Add a row to the log index** (e.g., `projects/my-project/session-log.md`)

3. **Update relevant wiki files** if any state has changed

4. **Stage and commit** the session log files (can be a separate commit or combined)

5. **Push** the additional commit — the open PR auto-updates.

## Notes

- This protocol is meant to be run at the end of a work session, not mid-stream.
- If there are no changes to commit (`git status` shows clean), do nothing.
- The session log step is the safety net against wiki drift.
