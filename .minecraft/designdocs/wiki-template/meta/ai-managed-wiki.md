# AI-Managed Documentation

**Status:** Template

---

## Overview

This wiki is maintained by Claude Code — an AI that serves as the primary editor of a markdown repository. Claude Code commits to Git, opens pull requests for human review, and runs structured protocols to keep interconnected pages consistent with each other and with reality.

---

## Why

Documentation rots. A change gets made, the wiki doesn't get updated, and three months later half the pages are wrong. The bigger the wiki gets, the worse it gets — pages reference each other, and a single change can silently create contradictions across a dozen files.

This setup solves for documentation that:

- Stays accurate as things change
- Catches its own contradictions
- Verifies its claims against live systems
- Scales without requiring manual cross-checking of every page

---

## The Stack

| Component | Role |
|-----------|------|
| Markdown files in Git | Source of truth |
| Claude Code (CLI) | Primary editor |
| `CLAUDE.md` | Codified conventions, workflow rules, domain context |
| Protocol files | Structured maintenance workflows |
| Git hosting (GitHub, Gitea, etc.) | Pull request review |
| Wiki renderer (optional) | Web UI for reading (syncs from Git) |

The wiki is a plain Git repository of markdown files covering whatever the operator needs documented. There is no application code, no build system, no tests. The "codebase" is pure prose.

---

## How It Works

### The Editing Loop

1. Operator describes a change ("I moved the database to the new server")
2. Claude Code reads the relevant pages
3. Makes edits following established conventions
4. Commits to the `dev` branch
5. Pushes and opens (or updates) a pull request
6. Human reviews the diff and merges
7. Optional wiki renderer syncs from the main branch

No change reaches the wiki without a human reviewing the diff first.

### `CLAUDE.md` — The Institutional Memory

The `CLAUDE.md` file in the repo root is what makes this repeatable across sessions. It tells Claude Code:

- **What this repo is** — a wiki, not code
- **How pages are structured** — internal links, tables for data, Related Pages sections
- **The Git workflow** — work on `dev`, never push to `main`, check for existing PRs
- **Key domain context** — facts about the systems being documented that every page needs to be consistent about

This eliminates the cold-start problem. Claude Code doesn't rediscover conventions each session — they're codified.

---

## The Protocols

The real leverage comes from structured protocols stored as markdown files in the repo. Invoked by saying "run Protocol N", Claude Code reads the protocol file and executes it systematically.

### Protocol 1: Harmonize

A full editorial pass across a topic area. Claude Code reads every page in scope and looks for:

- **Anachronisms** — statements that were true once but aren't anymore
- **Contradictions** — page A says X, page B says Y
- **Tone drift** — operator notes instead of encyclopedic documentation
- **Missing context** — technically correct but misleading without clarification
- **Inaccessible pages** — orphaned pages not linked from anywhere, broken links

### Protocol 2: Spot-Check

Random-sample contradiction detection at scale:

1. Inventories all wiki pages
2. Selects 10 random page pairs (biased toward cross-domain pairs)
3. Reads both pages in each pair and checks for factual contradictions
4. Reports findings with confidence levels: certain, likely, or possible

This scales to any wiki size without reading every page combination.

### Protocol 3: Verify

The trust-but-verify layer. Before accepting any fix, Claude Code generates commands the operator can run to check ground truth. The output is a copyable command block. The operator runs it, reports results, and Claude Code adjusts its fixes accordingly.

This closes the loop between documentation and reality.

### Protocol 4: Recursive Harmonize

Applies Protocol 1 to recently changed files, then checks if those fixes created new inconsistencies, and repeats until convergence (max 5 iterations). Handles cascading fixes — when correcting one page means three other pages now need updating too.

---

## What a Session Looks Like

**Simple update:**

> "I moved the database to a new server. Update the wiki."

Claude Code reads all relevant pages, updates all references, commits, pushes, opens a PR.

**Consistency check:**

> "Run Protocol 2"

Claude Code spot-checks 10 random page pairs, reports contradictions, generates verification commands, the operator confirms ground truth, and Claude Code fixes what's wrong.

**Post-change sweep:**

> "Run Protocol 4"

After a big change, this recursively harmonizes outward from the changed files until nothing else needs fixing.

---

## Why This Pattern Works

**Markdown is the right format.** Structured enough for an LLM to maintain coherently. Flexible enough that the value-add over manual editing is real. No schemas to break, no migrations to run.

**Git provides the safety net.** Every change is a commit. Every change goes through a PR. The human reviews diffs before merging.

**Protocols formalize what's normally ad-hoc.** "Check if the wiki is consistent" is vague. "Read 10 random page pairs and report contradictions with confidence levels" is actionable and repeatable.

**Verification closes the loop.** The wiki doesn't just claim to be accurate — Protocol 3 generates commands to prove it.

**`CLAUDE.md` prevents drift.** Conventions survive across sessions because they're codified, not remembered.

---

## Recommendations for Getting Started

1. **Start with `CLAUDE.md`.** Spend real time on it. The better the conventions are defined, the more consistent the output.
2. **Use Git and PRs.** Never let the AI push directly to the main branch. Review everything.
3. **Build verification into the workflow.** An LLM will confidently write plausible-sounding documentation that's wrong. Generating commands to check reality is what makes this trustworthy.
4. **Keep pages interconnected.** Tables, cross-references, and Related Pages sections create a web of constraints that makes contradictions detectable.
5. **Formalize maintenance patterns as protocols.** If a review pattern gets repeated, write it down as a protocol file. It becomes invocable and reproducible.

---

## Related Pages

- [Style Guide](/en/meta/style-guide) — writing conventions for wiki pages
- [Infrastructure Overview](/en/infrastructure/overview) — example documentation page
