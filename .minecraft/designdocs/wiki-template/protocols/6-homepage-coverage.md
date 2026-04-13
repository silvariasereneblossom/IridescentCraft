# Protocol 6: Homepage Coverage

Check that every wiki page is reachable from `home.md`. Fix any gaps.

## Trigger

"Run Protocol 6" or "Homepage coverage check"

## Procedure

1. **Run the crawl script.**

   ```bash
   python3 protocols/scripts/homepage-crawl.py
   ```

   The script:
   - Creates a temporary SQLite database in `/tmp` (path printed at runtime)
   - Seeds a BFS queue with `home.md`
   - Extracts every internal Wiki.js link (`[text](/en/path)`) from each page
   - Follows each link to its target `.md` file, recording it in the `pages` table with its parent and depth
   - Continues until no new pages are discovered
   - Compares the set of reachable pages against all `.md` files on disk
   - Reports orphaned pages (exist on disk but unreachable), broken links (linked but missing on disk), and depth distribution

   Excluded from the orphan check (not wiki pages): `CLAUDE.md`, `README.md`, `scratch/`, `.git/`, `.claude/`, `essays/`.

2. **Review the output.** The script prints four sections:

   | Section | What it tells you |
   |---------|-------------------|
   | **Stats** | Total pages, reachable count, link count, broken links, orphan count |
   | **Broken Links** | Links pointing to files that don't exist — usually renamed/deleted pages |
   | **Orphaned Pages** | Files that exist but have no inbound link chain from `home.md` |
   | **Depth Distribution** | How many pages are at each hop distance from the homepage |

3. **Query the database (optional).** For deeper investigation:

   ```sql
   -- How does home.md reach a specific page?
   WITH RECURSIVE chain(path, parent, depth) AS (
       SELECT path, parent, depth FROM pages WHERE path = 'infrastructure/overview.md'
       UNION ALL
       SELECT p.path, p.parent, p.depth FROM pages p JOIN chain c ON p.path = c.parent
   )
   SELECT * FROM chain ORDER BY depth;

   -- Which pages link to a given target?
   SELECT source, link_text FROM links WHERE target = 'infrastructure/overview.md';

   -- Pages with no outbound links (dead ends):
   SELECT p.path FROM pages p
   WHERE p.on_disk = 1
     AND p.path NOT IN (SELECT DISTINCT source FROM links);
   ```

4. **Fix orphans.** For each orphaned page, determine the right fix:
   - **Missing from an overview/index page:** Add a link in the appropriate overview
   - **Missing from `home.md` entirely:** Add it to the right section in `home.md`
   - **Genuinely dead content:** Flag for the user — do not delete without confirmation

5. **Fix broken links.** For each broken link:
   - If the target was renamed, update the link
   - If the target was deleted intentionally, remove the link
   - If the target should exist but doesn't, ask the user if they want the page created

6. **Re-run the script** after fixes to confirm convergence (zero orphans, zero broken links).

### SQLite schema reference

```
pages   (path TEXT PK, parent TEXT, depth INT, on_disk INT)
links   (id INT PK, source TEXT, target TEXT, link_text TEXT, target_exists INT)
orphans (path TEXT PK)
```

## Output

Report the full stats block from the script, list all fixes made, and confirm the re-run is clean.

## Fallback: Manual Coverage Check

If the crawl script is unavailable, use this heuristic approach instead.

1. **Start with known gaps.** If this protocol was triggered by recent work, add those pages to `home.md` first.

2. **Build a full page inventory.** Glob for all `.md` files, excluding:
   - `home.md` itself
   - `CLAUDE.md`
   - `README.md`
   - `protocols/` (these have their own section on the homepage — just verify the list is complete)
   - `*/logs/` directories (session logs, linked from their respective session-log index pages)
   - `scratch/` (scratch files, not wiki pages)

3. **Check each page against `home.md`.** A page counts as "covered" if:
   - It is directly linked from `home.md`, OR
   - It is within a section whose overview page is linked from `home.md`

4. **Report uncovered pages.** List every page that is not covered.

5. **Random-sample verification.** Randomly select 5 pages and verify they are reachable from the homepage (directly or through a linked overview). This catches cases where an overview exists but doesn't link to its children.

6. **Fix gaps.** For each uncovered page, add it to the appropriate section in `home.md`.
