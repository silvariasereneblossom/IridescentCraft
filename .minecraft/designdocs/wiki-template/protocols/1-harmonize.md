# Protocol 1: Harmonize

Perform a full wiki harmonization pass across a specified topic area.

## Trigger

"Run Protocol 1" or "Harmonize [topic area]"

## Procedure

1. Read every page that touches the topic area (use grep to find cross-references)
2. Identify **anachronisms** — statements that were true at time of writing but are now outdated (e.g., "in progress" for completed work, "reserved for future use" for things already in use)
3. Identify **contradictions** — two pages that disagree about the current state of something
4. Identify **tone issues** — sections that read as live operator notes rather than encyclopedic documentation. Rewrite in Wikipedia-style third person, past tense for completed events, present tense for current state
5. Identify **missing clarifications** — statements that are technically correct but misleading without context
6. Check for **style guide violations** — compare prose against [the style guide](/en/meta/style-guide) and flag:
   - **Peacock terms** — subjective adjectives that add no factual information ("robust", "elegant", "powerful")
   - **Weasel words** — vague attribution ("it is widely known", "some believe", "generally considered")
   - **Time-relative language without dates** — "currently", "recently", "soon", "upcoming" without an "as of" date anchor
   - **Operator voice** — first person ("I decided", "we built", "my plan") outside of the sanctioned `home.md` exception
   - **Task items in encyclopedic prose** — imperative-tense instructions mixed into descriptive sections (these belong in separate "Tasks" or "Remaining Work" sections, or in runbook pages)
   - **Idea pages:** apply a lighter touch. Speculative language and "Status: Shower thought" labels are acceptable in `ideas/` pages. Still flag peacock terms, weasel words, and first-person voice.
7. Check for **inaccessible pages** — wiki pages that cannot be reached by a reader navigating the wiki:
   - **Orphaned pages** — `.md` files that exist in the repo but are not linked from any other page via `/en/` links. Every page should be reachable from `home.md` through at most two hops.
   - **Broken internal links** — `/en/` links that point to pages where no corresponding `.md` file exists in the repo
   - **Missing Related Pages links** — pages that reference a topic but don't link to the dedicated page for that topic in their Related Pages section
   - **How to check:** Grep all `.md` files for `/en/` link targets, compare against the actual file tree, and flag any mismatches in either direction
8. **Verify** — Run Protocol 3 to generate commands that check ground truth on live systems. Present the commands to the user and wait for confirmation before applying fixes.
9. Make all fixes, commit, push, and create/update a PR
