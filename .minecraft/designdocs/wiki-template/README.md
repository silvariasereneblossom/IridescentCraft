# Personal Wiki Template

A template for running a personal wiki as a Git repository of markdown files, maintained by Claude Code with structured protocols for consistency and verification.

Based on a production wiki that manages 100+ interconnected pages across infrastructure documentation, project tracking, and personal knowledge management.

## What You Get

- **`CLAUDE.md`** — Project instructions that Claude Code loads automatically. Defines conventions, Git workflow, domain context, and protocol index.
- **Style guide** — Adapted from Wikipedia's Manual of Style for a personal technical wiki. Covers voice, tense, page types, words to avoid.
- **7 protocols** — Structured maintenance workflows invoked by saying "run Protocol N":
  1. **Harmonize** — Full editorial pass to fix contradictions, anachronisms, tone
  2. **Spot-Check** — Random-sample contradiction detection across page pairs
  3. **Verify** — Generate commands to check wiki claims against live systems
  4. **Recursive Harmonize** — Iterative harmonization until convergence
  5. **Session Log Setup** — Create logging infrastructure for a new project
  6. **Homepage Coverage** — Ensure every wiki page is reachable from the homepage
  7. **Commit & Ship** — Stage, commit, push, create PR, update session logs
- **Homepage crawl script** — Python BFS crawler that finds orphaned pages and broken links
- **Session logging pattern** — Append-only decision logs that prevent wiki drift across sessions
- **Example pages** — Starter homepage, infrastructure overview, and style guide

## Quick Start

1. **Fork or clone this repo.** Rename it to whatever you want.

2. **Edit `CLAUDE.md`.** This is the most important file. Customize:
   - The "What This Is" section to describe your wiki's purpose
   - The "Repository Structure" section to match your directory layout
   - The "Workflow" section for your Git hosting (GitHub, Gitea, Forgejo, etc.)
   - The "Key Domain Context" section with facts Claude Code needs to know
   - Add session logging sections as you create new projects

3. **Edit `home.md`.** Replace the example sections with your own. This is your wiki's front door.

4. **Start Claude Code** in the repo directory:
   ```bash
   cd ~/your-wiki
   claude
   ```
   Claude Code auto-loads `CLAUDE.md` and knows the project context. Just describe what you want.

5. **Add content.** Tell Claude Code what to document:
   ```
   "document my home network setup"
   "add a page about the NAS"
   "I moved the database to a new server. Update the wiki."
   ```

6. **Run protocols** to maintain quality:
   ```
   "protocol 4"   — recursive harmonize after changes
   "protocol 2"   — spot-check for contradictions
   "protocol 6"   — check that all pages are reachable from the homepage
   ```

## Design Principles

- **If it's not documented here, it doesn't exist.** The wiki is the source of truth.
- **Git provides the safety net.** Every change is a commit. Every change goes through a PR. Humans review diffs before merging.
- **Protocols formalize what's normally ad-hoc.** "Check if the wiki is consistent" becomes a repeatable, invocable workflow.
- **Verification closes the loop.** Protocol 3 generates commands to prove the wiki matches reality.
- **Session logs prevent drift.** Append-only decision records ensure continuity across Claude Code sessions.
- **`CLAUDE.md` prevents cold starts.** Conventions survive across sessions because they're codified, not remembered.

## Adapting for Your Use Case

### Infrastructure / Homelab Wiki
The template was originally built for this. Document servers, containers, network topology, services, and operational procedures. Protocol 3 (Verify) is especially valuable here — it generates commands to check that your documentation matches what's actually deployed.

### Project Knowledge Base
Track projects with overview pages, session logs, and decision records. The session logging pattern (Protocol 5) is the key differentiator — it prevents the gap between what was decided in conversation and what the wiki reflects.

### Personal Knowledge Management
Organize notes, research, reading lists, and ideas. The homepage coverage check (Protocol 6) ensures nothing gets orphaned as the wiki grows.

### Team Documentation
The protocol system works for teams too. Protocol 1 (Harmonize) catches contradictions that creep in when multiple people update docs. Protocol 2 (Spot-Check) scales to large wikis where reading every page isn't practical.

## File Layout

```
your-wiki/
├── CLAUDE.md                  <- Project instructions (edit this first)
├── README.md                  <- You are here
├── home.md                    <- Wiki homepage (edit this second)
├── meta/
│   ├── style-guide.md         <- Writing conventions
│   └── ai-managed-wiki.md     <- How this wiki works
├── protocols/
│   ├── 1-harmonize.md
│   ├── 2-spot-check.md
│   ├── 3-verify.md
│   ├── 4-recursive-harmonize.md
│   ├── 5-session-log-setup.md
│   ├── 6-homepage-coverage.md
│   ├── 7-commit-and-ship.md
│   └── scripts/
│       └── homepage-crawl.py
├── infrastructure/            <- Example section (rename/replace)
│   └── overview.md
├── projects/                  <- Project tracking (add as needed)
└── ideas/                     <- Half-baked ideas (add as needed)
```

## Prerequisites

- [Claude Code](https://claude.ai/code) CLI installed
- A Git repository (any hosting: GitHub, Gitea, Forgejo, GitLab, etc.)
- Optional: a wiki renderer like Wiki.js, Gollum, or MkDocs that syncs from Git

## License

Use this however you want. No attribution required.
