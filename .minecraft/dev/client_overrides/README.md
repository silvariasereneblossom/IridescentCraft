# Client asset overrides that save memory

Three kinds of file in `.minecraft/kubejs/assets` exist only to cut client memory. None changes what a player sees
or hears. They come from the RAM audit of 2026-10-30 (internal repo, `dev/ram-audit-2026-10-30`). Each one is
right only for the jars it was made from, so `client_overrides.py --check` compares them with the jars.

| File | Over | Why |
|---|---|---|
| `<ns>/sounds.json` (11 namespaces, generated) | every sound event that plays a file of 30 s or more without `"stream": true` | A sound that is not streamed is decoded whole on first play and kept in native memory until quit, where F3 and `-Xmx` do not show it. EDF Remastered's End fight track (1,364 s, 48 kHz stereo) alone is 262 MB. The override restates the event with `"replace": true` and `"stream": true` on each file |
| `theabyss/textures/item/netherite_helmet_-_copy.png` | TATOS' 6000 x 6000 PNG | No model uses it, but the block atlas loads every PNG under `textures/item`: about 198 MB of native memory, and it made the atlas 8192 x 8192 instead of 8192 x 4096. The override is a 16 x 16 transparent PNG of our own |
| `fallingleaves/atlases/leaves.json` | Falling Leaves' `{"type":"directory","source":"particle"}` | The mod registers its reload listener twice, and each copy stitches every `textures/particle` PNG of the pack (about 1,770) into a 4096 x 2048 atlas, while its leaf types use eight `fallingleaves` sprites. Atlas sources from all packs are applied in order, and the `filter` source removes the sprites added before it, here every namespace but `fallingleaves` |

## When it runs

```
python -I .minecraft/dev/client_overrides/client_overrides.py --check      # exit 1 when an override is wrong
python -I .minecraft/dev/client_overrides/client_overrides.py --write      # regenerate the sounds.json files
python -I .minecraft/dev/client_overrides/client_overrides.py --current    # the gate: no jar needed
```

**By itself, from `dev/mods/intake.py`**: `add` and `update` of a mod the client loads (side `client` or `both`),
and `remove` of a jar the stamp says an override depends on, end with `--check`. Intake passes the folders it
took the jars from (`--mods`, the new jar's own folder first), so the check reads the new jar before any launch.
`--no-client-check` skips it; the gate then refuses the push until the check passes. By hand after anything else
that changes the client's jars: `intake.py decide <mod> side ...` across `server`, a custom-jar release that changed
a sound, a hand edit of an override. `--check` fails when:
- a sound event's merged list changed, so the override would hide what the update added;
- a new event plays a long track without streaming;
- TATOS fixed or dropped the texture, or something now references it;
- Falling Leaves changed its atlas file;
- TATOS or Falling Leaves left the pack while its override is still there.

On a failure it prints "What to do": the `--write` command for the sounds (with the same `--mods`), which file to
re-read for the other two, then `--check` again and `sync-distros.ps1 -Fix`. `--write` regenerates the
`sounds.json` files; the other two are written by hand. With no flag it prints the event list and changes nothing.

It reads the jars the client index of the tree names (`distribution/client/mods/.index`), each from the first
`--mods` folder that holds it with the hash the index records (default: the PrismLauncher instance's `mods`
folder; `--mods` can be given more than once and replaces the default), and the pack's own jars from
`distribution/client/mods`. A jar found nowhere stops it (exit 2): the output would describe other jars than the
ones the pack ships. Vanilla's `sounds.json` comes from PrismLauncher's asset index (`--assets`). Only
`.minecraft/kubejs/assets` and the stamp are written; `dev/sync-distros.ps1 -Fix` mirrors the assets to the two
distros.

## The stamp, and the two gates

When `--check` or `--write` ends with every override matching the jars, it writes `checked.json` next to the tool
(commit it with the overrides; never edit it):

- `jars`: every client jar it read, with the hash the index records. For the pack's own jars, `own:` and a hash of
  only their `sounds.json`, `.ogg`, Falling Leaves atlas and TATOS texture files, so a rebuild that changes code
  needs no new check.
- `touches`: what of a jar an override depends on. `sounds`: its `sounds.json` registers a restated event, or
  replaces an event (taking it away can bring back a long track it hid). `sound files`: it ships a file a restated
  event plays, or one another pack ships too. `tatos`: it is TATOS, ships the texture or names it. `leaves`: it
  ships Falling Leaves' atlas file. A jar with no touches can leave the pack without a new check.
- `overrides`: a hash of each override file (JSON with LF line ends).

`--current` compares the tree with the stamp. It opens no third-party jar and downloads nothing, in about half a
second (it opens the pack's own client jars, 17 MB). It fails (exit 1, `[client-overrides] FAIL   STALE   ...`)
when a jar of the client index was added or updated since the check, a jar with touches left the index, one of
the pack's own jars ships other sound or atlas files, or an override file is not the one the check passed. Exit 2:
no stamp. Two gates use it:

| Gate | Runs | Refuses |
|---|---|---|
| `intake.py check` (pre-push hook, block "Mod intake gate"; workflow `mod-intake.yml`) | every push | `CLIENT OVERRIDES <mod>`: a third-party client mod added, updated or removed since the check, the same way it refuses an owed decision |
| pre-push hook, block "Client asset overrides"; workflow `client-overrides.yml` | a push that touches a mod index, a jar in `distribution/client/mods`, an override or this folder | everything `--current` reports: also the pack's own jars and edits of the override files |

`client_overrides_test.py` builds a small pack (jars, a vanilla asset index, the overrides) in a temporary folder
and plants each stale state; the workflow runs it. The intake side is in `dev/mods/intake_test.py`.

Not seen by the gate: a resource pack the player adds; the Paxi packs, which sit above the KubeJS pack (`--check`
reports their long tracks as NOTE lines, an override cannot reach them); the vanilla asset index, which is fixed for
1.20.1.

## How the sound list is built

The tool replays the game's merge, pack by pack from the bottom of the stack: every mod jar and nested jar (Forge
gives each one its own entry), then vanilla, then the KubeJS pack. The first registration of an event, or one with
`"replace": true`, starts the event over and sets its subtitle; any other appends. An event goes into the override
when a file of its merged list is 30 s or longer and not streamed. Every file of that event is then streamed. Only
the fields the game reads are restated: `replace` and `subtitle` for the event; `name`, `volume`, `pitch`,
`weight`, `stream`, `attenuation_distance`, `preload` and `type` for a sound. A sound's category is set by the code
that plays it, not by `sounds.json`; the `category` keys some mods write there are ignored by the game and are left
out. The Paxi packs sit above KubeJS, and the tool reports any event of theirs that it cannot cover.
