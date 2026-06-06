#!/usr/bin/env python3
# =============================================================================
# BOOT-SIGNATURE MONITOR (docket #89, 2026-06-06)
# =============================================================================
# Clusters a server boot log's WARN/ERROR lines into normalized signatures and
# diffs them against a committed baseline. NEW clusters = something changed -
# a mod broke, a fix regressed, a validator fired. Known-accepted noise stays
# quiet. This converts "broken mod surfaces quietly, tester reports it weeks
# later" into a same-day, single-command check.
#
# USAGE (dev container; the server log auto-mirror lands the input here):
#   python3 .minecraft/dev/boot_signature_check.py                    # check latest mirrored log
#   python3 .minecraft/dev/boot_signature_check.py <path/to/log>      # check a specific log
#   python3 .minecraft/dev/boot_signature_check.py --update-baseline  # bless current clusters
#
# Baseline: .minecraft/dev/boot_signature_baseline.json (committed).
# Re-bless after every INTENTIONAL change to boot output (new validator,
# accepted new mod noise). NEVER bless a cluster you can't explain.
#
# Exit codes: 0 = clean (no new clusters), 1 = new clusters found, 2 = error.
# =============================================================================
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_LOG = REPO / '.minecraft/server_distribution/TesterLogs/Server Logs/latest.log'
BASELINE = Path(__file__).resolve().parent / 'boot_signature_baseline.json'

SIG_LEN = 130

def normalize(line: str) -> str | None:
    """Reduce a WARN/ERROR log line to a stable cluster signature."""
    if not (' WARN' in line[:60] or ' ERROR' in line[:60] or '/WARN]' in line[:60] or '/ERROR]' in line[:60]):
        return None
    s = line
    s = re.sub(r'^\[[^\]]*\]\s*', '', s)            # timestamp bracket
    s = re.sub(r'^\[[^\]]*\]:?\s*', '', s)          # thread/level bracket
    s = re.sub(r'^\[[^\]]*\]:?\s*', '', s)          # logger bracket
    s = re.sub(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<uuid>', s)
    # --- shape-specific collapses for known high-variance families ---
    s = re.sub(r'Incorrect key \S+ was corrected from .*', 'Incorrect key <key> was corrected', s)
    s = re.sub(r"(Failed to parse recipe ')([a-z_0-9]+):[^']+'", r"\1\2:<path>'", s)
    s = re.sub(r"(Couldn't load certain entries with the tag [a-z_0-9]+:[a-z_/0-9]+):.*", r'\1: <entries>', s)
    s = re.sub(r"(Skipping Entity with id )\S+", r'\1<id>', s)
    s = re.sub(r"(defineId called for: class )\S+( from class )\S+", r'\1<class>\2<class>', s)
    s = re.sub(r'[A-Za-z]:/[^\s,;\)]{8,}', '<winpath>', s)   # windows paths
    s = re.sub(r'(/[\w.-]+){3,}', '<path>', s)               # long unix paths
    # --- generic ---
    s = re.sub(r'-?\d+[.,]\d+', '<num>', s)          # decimals
    s = re.sub(r'\b\d{4,}\b', '<bignum>', s)         # big ints (coords, ids, line numbers in stacks)
    s = re.sub(r'\b\d+\b', '<n>', s)                 # small ints
    s = re.sub(r'\\', '/', s)                        # path slashes
    s = re.sub(r'\s+', ' ', s).strip()
    if not s:
        return None
    return s[:SIG_LEN]

def cluster(log_path: Path) -> dict[str, dict]:
    sigs: dict[str, dict] = {}
    with open(log_path, errors='replace') as fh:
        for raw in fh:
            sig = normalize(raw)
            if sig is None:
                continue
            entry = sigs.setdefault(sig, {'count': 0, 'sample': raw.strip()[:240]})
            entry['count'] += 1
    return sigs

def main() -> int:
    args = [a for a in sys.argv[1:]]
    update = '--update-baseline' in args
    args = [a for a in args if a != '--update-baseline']
    log_path = Path(args[0]) if args else DEFAULT_LOG
    if not log_path.exists():
        print(f'[boot-sig] log not found: {log_path}')
        return 2

    current = cluster(log_path)
    print(f'[boot-sig] {log_path.name}: {sum(e["count"] for e in current.values())} WARN/ERROR lines '
          f'in {len(current)} clusters')

    if update or not BASELINE.exists():
        baseline = {sig: {'count': e['count'], 'sample': e['sample']} for sig, e in sorted(current.items())}
        BASELINE.write_text(json.dumps(baseline, indent=1, sort_keys=True) + '\n')
        print(f'[boot-sig] baseline {"updated" if BASELINE.exists() else "created"}: '
              f'{len(baseline)} clusters blessed -> {BASELINE.name}')
        print('[boot-sig] commit the baseline. NEVER bless a cluster you cannot explain.')
        return 0

    baseline = json.loads(BASELINE.read_text())
    new = {s: e for s, e in current.items() if s not in baseline}
    gone = [s for s in baseline if s not in current]
    grown = {s: (baseline[s]['count'], e['count']) for s, e in current.items()
             if s in baseline and e['count'] > 3 * max(1, baseline[s]['count'])}

    if gone:
        print(f'[boot-sig] {len(gone)} baseline clusters absent this boot (fixes landing or boot-phase variance) - ok')
    if grown:
        print(f'[boot-sig] {len(grown)} known clusters GREW >3x (baseline -> now):')
        for s, (b, c) in sorted(grown.items(), key=lambda kv: -kv[1][1]):
            print(f'    {b:>5} -> {c:<5} {s[:110]}')
    if not new:
        print('[boot-sig] CLEAN - no new WARN/ERROR clusters vs baseline')
        return 0

    print(f'[boot-sig] *** {len(new)} NEW clusters - investigate each before blessing ***')
    for s, e in sorted(new.items(), key=lambda kv: -kv[1]['count']):
        print(f'  x{e["count"]:<5} {s[:115]}')
        print(f'         sample: {e["sample"][:160]}')
    return 1

if __name__ == '__main__':
    sys.exit(main())
