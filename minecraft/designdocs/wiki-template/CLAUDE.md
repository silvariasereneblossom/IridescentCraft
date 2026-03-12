# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

This is a personal wiki maintained as markdown files, serving as documentation for [YOUR DOMAIN HERE — e.g., a homelab, a business, a research project]. It is optionally synced to a wiki renderer (Wiki.js, MkDocs, Gollum, etc.). There is no build system, test suite, or application code.

<!-- Customize: describe your wiki's purpose, where it runs, and how it's accessed. -->

## Repository Structure

- `home.md` — Wiki homepage with section index and quick-reference table
- `infrastructure/` — [Rename or replace this section]
  - `overview.md` — Top-level overview page
- `projects/` — Active project documentation
- `ideas/` — Half-baked project ideas
- `meta/` — Wiki meta-documentation
  - `style-guide.md` — Writing conventions
  - `ai-managed-wiki.md` — How Claude Code maintains this wiki
- `protocols/` — Structured maintenance workflows (1-7)

<!-- Customize: update this to match your actual directory structure as it grows. -->

## Writing Conventions

- Pages use Wiki.js-style internal links: `/en/path/to/page`
- Tables are used for structured data (specs, inventories, configuration references)
- Architecture diagrams use ASCII art in fenced code blocks
- Shell commands are documented with step-by-step context explaining *why*, not just *what*
- Pages end with a "Related Pages" section linking to adjacent topics

## Workflow

- **Default branch: `dev`** — Work on the `dev` branch unless told otherwise. Simply commit to `dev` and push.
- If `dev` does not exist locally, create it from `main`: `git checkout -b dev origin/main`
- If `dev` already exists, make sure it's up to date: `git fetch origin main && git rebase origin/main`
- When changes are ready for review, create or update a pull request from `dev` to `main`
- Before pushing, always `git fetch origin main && git rebase origin/main` to ensure the branch includes the latest merged changes
- Never push directly to `main`; all changes go through PRs for human review

<!-- Customize: update the PR creation commands for your Git hosting platform.

GitHub example:
  gh pr create --base main --head dev --title "..." --body "..."

Forgejo/Gitea example:
  curl -s -X POST "https://your-gitea.example.com/api/v1/repos/OWNER/REPO/pulls" \
    -H "Content-Type: application/json" \
    -H "Authorization: token $TOKEN" \
    -d '{"title": "...", "body": "...", "head": "dev", "base": "main"}'
-->

## Protocols

Protocols are stored in `protocols/` as individual files. When a protocol is invoked (e.g., "run Protocol 2"), read the corresponding file before executing.

| Protocol | Description | File |
|----------|-------------|------|
| 1 | Full harmonization pass — fix contradictions, anachronisms, tone | `protocols/1-harmonize.md` |
| 2 | Random-sample spot-check for contradictions across file pairs | `protocols/2-spot-check.md` |
| 3 | Verify — generate commands to check ground truth before accepting fixes | `protocols/3-verify.md` |
| 4 | Recursive harmonize — apply Protocol 1 to recent changes, repeat until convergence | `protocols/4-recursive-harmonize.md` |
| 5 | Session log setup — create session logging infrastructure for a new project | `protocols/5-session-log-setup.md` |
| 6 | Homepage coverage — check that every wiki page is reachable from `home.md` | `protocols/6-homepage-coverage.md` |
| 7 | Commit & ship — commit, push, create/update PR, then update session logs if applicable | `protocols/7-commit-and-ship.md` |

<!-- Customize: add your own protocols as you develop repeatable workflows. -->

## Session Logging

Session logs prevent **wiki drift** — the gap between what was decided in conversation and what the wiki files actually say. They're optional but recommended for any project that involves ongoing decisions across multiple Claude Code sessions.

To set up session logging for a new project, run Protocol 5.

The pattern:
- Each project with logging gets a `session-log.md` index and a `logs/` directory
- Each session gets its own file: `YYYY-MM-DD-<slug>.md`
- At the **start** of a session, read the most recent 1-2 log files to catch up
- At the **end** of a session, create a new log recording decisions, actions, and next steps

<!-- Customize: as you add projects with session logging, add a section for each one here.
Follow this pattern:

## Session Logging (Project Name)

Any session that involves [trigger conditions] **must** create a log file in `path/to/logs/` before ending.

**File naming:** `YYYY-MM-DD-<slug>.md`. Multiple sessions on the same day get letter suffixes.

Each log file records:
- Date and session context
- Decisions made or actions taken
- Which wiki files were updated
- Open items and next steps

After creating the log file, **add a row to the index table** in `path/to/session-log.md`.

At the **start** of any related session, read `path/to/session-log.md` to find the **most recent 1-2 log files**, then read those.
-->

## Key Domain Context

<!-- Customize: add facts about your domain that Claude Code needs to know to write
accurate documentation. Examples:

- All servers run Debian 12 with Docker Compose
- The network uses VLANs: 10 (trusted), 20 (IoT), 30 (guest)
- Storage is tiered: SSD for databases, HDD for bulk data, NAS for backups
- Public traffic routes through a reverse proxy on server X
-->

## Python

Always use virtual environments (`python3 -m venv`) for Python projects. Never `pip install` system-wide or use `--break-system-packages`.
