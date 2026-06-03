# Style Guide

Writing conventions for IridescentCraft wiki pages.

## Voice

- Third person for documentation pages
- Direct/imperative for procedures and checklists
- Technical but accessible — spell out acronyms on first use per page

## Tense

| Context | Tense | Example |
|---------|-------|---------|
| Implemented system | Present | The death penalty removes 10% durability in the Overworld. |
| Planned/not implemented | Future | The prestige system will add 5 ascension levels. |
| Design decision | Present | Glass cannons use halved equipment HP to create risk. |
| Historical event | Past | The datapack loading issue was resolved on 2026-03-12. |
| Status that may change | As-of | As of 2026-03-13, 45 of 95 affixes are implemented. |

## Formatting

- Use markdown tables for structured data
- Use relative links between wiki pages: `[Link Text](../section/page.md)`
- End pages with a "Related Pages" section
- Anchor time-sensitive statements with dates, not "currently" or "recently"

## Public vs. internal content

**The public wiki carries player-facing summaries.** Detailed developer information — script paths, line numbers, root-cause forensics, internal cleanup/deny-list patterns, and local filesystem paths — stays in the private internal repository, not on these pages.

When writing or editing a public page, keep the *what* and the *why* a player would care about; leave the *how it was diagnosed and fixed* to the private developer log. A page should read as documentation, not as a postmortem.

## Design Document Updates

When any design change is made:
1. Update the relevant section in `design/master.md`
2. Add a high-level, dated headline to `design/changelog.md` (the public changelog is a summary — the detailed development history is logged privately)
3. Update implementation status in `home.md` if applicable
