# Style Guide

This wiki's tone is modeled on [Wikipedia's Manual of Style](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style) but adapted for a personal technical wiki that serves a different set of needs. Wikipedia is a general encyclopedia written by human editors for the public. This wiki is an operator reference and project memory — authored primarily by a Claude Code instance translating from operator conversations into encyclopedic prose.

The style rules below account for page types that Wikipedia does not have: operational runbooks and idea/concept pages alongside standard encyclopedic documentation.

## How This Wiki Differs from Wikipedia

| Concern | Wikipedia | This wiki |
|---------|-----------|-----------|
| Authorship | Human editors writing directly | Claude Code translating from operator conversations into third-person prose |
| Audience | General public | The operator + the AI assistant (write as if a future session of Claude Code is reading) |
| Purpose | General knowledge | Operator reference, documentation, project memory across sessions |
| Page types | Encyclopedia articles | Also: operational runbooks, idea/concept pages |
| Scope | All human knowledge | Personal infrastructure, projects, ideas |

These differences mean the Wikipedia style rules are a foundation, not a complete answer. The sections below describe where this wiki follows Wikipedia conventions and where it diverges.

## Voice

**Third person, always.** The wiki never uses "I", "me", "my", "we", "us", or "our." It does not address the reader as "you." The operator speaks in first person during conversations; the wiki translates that into third-person encyclopedic prose.

| Operator says | Wiki writes |
|---------------|-------------|
| "I decided to use Restic because..." | Restic was selected because... |
| "We need to migrate the containers." | The containers require migration. |
| "My plan is to add GPU passthrough." | The design calls for GPU passthrough. |
| "I'm building a media server." | The media stack runs on the dedicated server. |

**Name the operator when attribution matters.** When a decision, responsibility, or opinion belongs to a specific person, name them. Do not use vague attribution ("someone suggested", "it was decided") when the person is known.

**Factual about people.** Describe what people do and are responsible for. Do not editorialize about the quality of their work, positively or negatively.

**Exception: `home.md`.** The homepage uses first person ("my life", "my infrastructure") intentionally. This is a sanctioned exception — the homepage serves as a personal orientation page, and first person is appropriate there.

## Tense

Tense depends on the state of the thing being described. This is where the wiki diverges most from a typical Wikipedia article, because some pages describe things that do not yet exist.

### Things that exist and are running: present tense

> The wiki server runs on port 3000.

> Backups are taken nightly and retained for 30 days.

### Things that happened: past tense

> The boot drive was encrypted in January 2026.

> The Git server was deployed during the initial setup.

### Things that are planned but do not exist: future tense

Do not describe planned components in present tense. This creates the false impression that they already exist.

| Bad (reads as if it exists) | Good (clear it is planned) |
|-----------------------------|---------------------------|
| The drive is encrypted with LUKS. | The drive will be encrypted with LUKS. |
| Grafana dashboards track server health. | Grafana dashboards will track server health. |

### Procedures and steps: imperative tense

> Mount the share via `/etc/fstab`.

> Run `restic snapshots` to verify the backup completed.

### Design rationale: present tense

Reasoning about *why* a design choice was made is a current fact, even if the system has not been built. The decision exists now; the system may not.

> The architecture separates media from infrastructure to isolate failure modes.

> Containers are used instead of VMs to reduce resource overhead.

### Status that may change: "as of" construction

For ongoing work where the status may change, anchor the statement to a date. This prevents the statement from silently going stale.

| Bad (will become stale) | Good (anchored to a date) |
|-------------------------|--------------------------|
| The encryption is in progress. | As of February 2026, the encryption is in progress. |
| The feature is not yet supported. | As of February 2026, the feature is not supported. |

### Summary table

| Context | Tense | Example |
|---------|-------|---------|
| Component that exists | Present | The wiki pulls from `main` every minute. |
| Component that is planned | Future | The drive will be encrypted with LUKS. |
| Design decision already made | Present | Containers are used to reduce resource overhead. |
| Procedure step | Imperative | Mount the share via `/etc/fstab`. |
| Event that happened | Past | The boot drive was encrypted in January 2026. |
| Status that may change | As-of | As of February 2026, the encryption is in progress. |

## Page Types

This wiki contains several types of pages. Each type has its own conventions.

### Encyclopedic pages (infrastructure, system overviews)

These follow standard Wikipedia conventions most closely. Third person, present tense for current state, past tense for history. Neutral, descriptive, no promotional language.

### Operational runbooks

These document how to perform specific procedures: commands to run, files to edit, services to restart. They use a mix of descriptive prose (explaining context) and imperative instructions (the steps themselves).

Procedural steps should be in numbered lists or clearly labeled sections, separate from the explanatory prose.

### Idea / concept pages

Pages under `ideas/` have looser rules. These are brainstorming pages — speculative, exploratory, and deliberately informal compared to the rest of the wiki.

Rules that still apply:
- Third person (no "I think this would be cool").
- No peacock terms (the idea does not need to be sold).
- Present tense for facts, future tense for speculative "how it could work" sections.

Rules that are relaxed:
- A "**Status:** Shower thought" label is fine and expected.
- Speculative language ("this could work by...", "one approach would be...") is appropriate.
- Open questions and unresolved design choices are welcome — these pages are meant to capture thinking, not present conclusions.
- The tone can be slightly more conversational than encyclopedic pages, as long as it stays in third person.

### Session log entries

Pages under `*/logs/` are records of session activity — decisions made, actions taken, and next steps. Each entry is a dated snapshot.

Rules:
- **Each entry has a date heading** in the format `### YYYY-MM-DD — short description`.
- **Third person.** Follows the same voice rules as the rest of the wiki.
- **Entries are not retroactively edited** once a subsequent entry exists. Corrections go in a new entry.

## Words to Avoid

### Time-relative words

Words like "currently", "now", "recently", "soon", "today", "upcoming", and "at present" become meaningless as soon as the page is not updated. Replace them with specific dates or the "as of" construction.

| Avoid | Use instead |
|-------|------------|
| The system currently supports... | The system supports... *(present tense implies currency)* |
| This was recently added... | X was added on 2026-02-01. |
| This will be available soon. | This is planned for March 2026. |
| The project is ongoing. | As of February 2026, the project is in development. |

### Peacock terms

Peacock terms are subjective words that promote without providing factual information. Replace them with specific, verifiable claims.

| Avoid | Use instead |
|-------|------------|
| A robust, production-grade setup. | A setup with nightly backups, monitoring, and automated recovery. |
| An incredibly powerful server. | *(Delete entirely. Describe what it does.)* |
| A highly reliable backup system. | A backup system with 30-day retention and offsite copies. |
| This elegant approach... | This approach uses per-container snapshots to enable granular recovery. |

The test: if removing the adjective loses no factual information, remove it.

### Weasel words

Weasel words attribute claims to unnamed sources or create a false impression of consensus. In a personal wiki where the operator is known, there is no reason to be vague about attribution.

| Avoid | Use instead |
|-------|------------|
| It is widely known that... | *(State the fact directly.)* |
| Some people believe... | *(Name them, or remove the claim.)* |
| The system is considered reliable. | The system has operated without unplanned downtime since January 2026. |
| There is a general consensus that... | *(State the decision and who made it.)* |

## Tone

**Neutral, not promotional.** The wiki documents what exists and what is planned. It does not argue that anything is impressive or brilliant. If the infrastructure is well-designed, the factual description will demonstrate that without adjectives.

**Honest about limitations.** If something is incomplete, unreliable, or unknown, say so directly. The wiki's value depends on accuracy, not optimism.

**Technical but accessible.** Write for a reader who understands the domain but may not know the specific details of this setup. Spell out acronyms on first use per page, and explain non-obvious design choices.

## Formatting Conventions

These complement the formatting rules in CLAUDE.md:

- Internal links use Wiki.js format: `[Link Text](/en/path/to/page)`.
- Tables for structured data (IPs, ports, specs, inventories).
- ASCII art diagrams in fenced code blocks.
- Related Pages section at the end of every page.
- Shell commands with context explaining *why*, not just *what*.

## Related Pages

- [AI-Managed Wiki](/en/meta/ai-managed-wiki) — how Claude Code maintains this wiki
- [Protocol 1: Harmonize](/en/protocols/1-harmonize) — harmonization protocol that checks for style violations

## References

This style guide draws from Wikipedia's editorial conventions, adapted for a personal technical wiki:

- [Wikipedia: Manual of Style](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style) — tense, tone, and structural conventions
- [Wikipedia: Words to Watch](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Words_to_watch) — peacock terms, weasel words, time-relative language
- [Wikipedia: Neutral Point of View](https://en.wikipedia.org/wiki/Wikipedia:Neutral_point_of_view) — impartial tone
- [Wikipedia: Writing About Current Events](https://en.wikipedia.org/wiki/Wikipedia:Writing_about_current_events) — "as of" construction, ongoing events
