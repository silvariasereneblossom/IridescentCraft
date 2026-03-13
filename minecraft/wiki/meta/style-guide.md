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

## Design Document Updates

When any design change is made:
1. Update the relevant section in `design/master.md`
2. Add a dated entry to `design/changelog.md`
3. Update implementation status in `home.md` if applicable
