# Protocol 2: Spot-Check

Detect contradictions across the wiki by comparing randomly sampled file pairs. Designed to scale to large wikis where reading every page in a single pass is impractical.

## Trigger

"Run Protocol 2" or "Spot-check"

## Procedure

1. **Inventory** — List all `.md` content files (exclude `CLAUDE.md`, `README.md`).
2. **Sample pairs** — Randomly select 10 unique pairs of files. Prefer cross-domain pairs (e.g., a containers page paired with a storage page) over same-directory pairs, since contradictions are more likely across domain boundaries.
3. **Compare each pair** — For every pair, read both files and check for:
   - **Factual contradictions** — disagreements about specs, IPs, ports, paths, identifiers, resource allocations, or current state
   - **Stale cross-references** — one page references information on the other page that has since changed
   - **Definitional drift** — the same concept described differently in each file
4. **Report** — After all pairs are compared, produce a findings summary listing:
   - Each contradiction found, citing both files and the conflicting statements
   - A confidence level (certain / likely / possible) for each finding
   - Suggested resolution (which file is probably correct, or whether both need updating)
5. **Verify** — Run Protocol 3 to generate commands that check ground truth on live systems. Present the commands to the user and wait for confirmation before applying fixes.
6. **Fix** — Apply all certain and likely fixes. Leave possible findings for human review, noted in the PR description.
7. **Commit, push, and create/update a PR** with findings in the PR body.

## Tuning

- The default is 10 pairs. If invoked as "Protocol 2 deep", use 20 pairs.
- If invoked with a topic (e.g., "Protocol 2: storage"), restrict the inventory to files matching that topic and compare every file against every other (full cross-join instead of random sampling).
