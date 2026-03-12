# Protocol 5: Session Log Setup

Set up session logging infrastructure for a project that's important, time-sensitive, or involves ongoing decisions that need to be tracked across multiple Claude Code sessions.

Session logs prevent **wiki drift** — the gap between what was decided in conversation and what the wiki files actually reflect. They're the safety net that ensures continuity between sessions.

## Trigger

"Run Protocol 5" or "Set up session logging for [project]"

## When to Use

- The project involves decisions that build on each other over time
- There's a real-world timeline with deadlines or action items
- Multiple sessions will touch the same files and you need continuity
- You're helping someone else (advocacy, coordination) and need an audit trail

## Procedure

### 1. Identify the Project

Confirm which project directory needs session logging. The project should already exist as a wiki section.

### 2. Create the Logs Directory

```bash
mkdir -p <project>/logs
```

### 3. Create the Session Log Index

Create `<project>/session-log.md`:

```markdown
# Session Log

Append-only record of every session involving <project>. This prevents wiki drift — the gap between what actually happened and what the wiki files say.

## How This Works

Each session gets its own file in `<project>/logs/`, named `YYYY-MM-DD-<slug>.md`. Multiple sessions on the same day get letter suffixes (a, b, c, d...).

**At the start of a session touching this project**, read the **most recent 1-2 log files** (not all of them) to catch up on what happened last. Use the index below to find them.

**At the end of a session**, create a new log file recording:
- Date and session context (what triggered it, what was the goal)
- Decisions made or actions taken
- Which wiki files were updated (and which still need updating)
- Open items and next steps

---

## Log Index

| Date | File | Summary |
|------|------|---------|

---

## Related Pages

<links to project hub and key pages>
```

### 4. Create the First Session Log

If the current session involved meaningful work on the project, create the first log file now:

- Filename: `<project>/logs/YYYY-MM-DD-<slug>.md`
- Content follows this template:

```markdown
# Session: <short description>

**Date:** <date>
**Context:** <what triggered this session>

## Decisions Made

<what was decided, researched, or acted on>

## Wiki Files Updated

<list of files created or modified>

## Open Items / Next Steps

<what still needs to happen>
```

Add the entry to the log index table.

### 5. Link from the Project Hub

Add the session log to the project's overview/hub page so it's discoverable:

- Add a row to the pages table: `[Session Log](/en/<project>/session-log)`
- Or add it to whatever navigation structure the project uses

### 6. Register in Protocol 7

Add the project to the session log check table in `protocols/7-commit-and-ship.md` so that Protocol 7 knows to prompt for a session log when changes touch this project.

### 7. Update CLAUDE.md

Add a session logging section for the project in `CLAUDE.md`, following the pattern described in the "Session Logging" section. This ensures all future sessions know about the logging requirement.

## Notes

- Not every session needs a log. Only log sessions where decisions were made, actions were taken, or state changed. A session that just reads files and answers questions doesn't need one.
- Keep log entries factual and concise. The log is a reference for future sessions, not a narrative.
- The log index should be the first thing read at the start of a session — it's the "previously on..." for the project.
