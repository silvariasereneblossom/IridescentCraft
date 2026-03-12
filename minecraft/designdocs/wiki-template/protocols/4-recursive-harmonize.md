# Protocol 4: Recursive Harmonize

Apply Protocol 1 to the changes just made, then repeat on the new changes, continuing until a pass produces zero findings. Each iteration's scope is the files touched by the previous iteration's fixes plus all files that cross-reference them.

## Trigger

"Run Protocol 4" or "Recursive harmonize"

## Procedure

1. **Seed scope** — Identify the files changed in the most recent commit(s). This is the initial change set.
2. **Expand scope** — For every file in the change set, grep the wiki for cross-references (file names, shared concepts, IPs, paths, service names). Add any referencing files to the scope.
3. **Run Protocol 1** on the expanded scope — find anachronisms, contradictions, tone issues, and missing clarifications. Run Protocol 3 verification for any findings that depend on ground truth.
4. **Apply fixes** — commit and push.
5. **Check for convergence** — If the pass produced zero findings, stop. The wiki is harmonized with respect to these changes.
6. **Recurse** — If fixes were made, the changed files become the new seed scope. Return to step 2.

## Convergence

The process converges because each iteration fixes contradictions introduced or exposed by the previous iteration. The scope narrows naturally: first-pass fixes touch many cross-references, second-pass fixes touch fewer, and subsequent passes typically find nothing.

If a pass produces only "possible" findings (not certain or likely), present them to the user and stop — do not recurse on speculative fixes.

## Guardrails

- **Maximum depth: 5 iterations.** If the fifth pass still produces findings, stop and report the remaining issues to the user. Infinite loops indicate a structural problem that requires human judgment.
- **Do not re-fix already-fixed findings.** Track findings by file and line across iterations to avoid oscillation (fixing A to match B, then fixing B to match A).
- **Each iteration gets its own commit** with a message indicating the iteration number (e.g., "Protocol 4 iteration 2: fix 3 issues across 2 files").
