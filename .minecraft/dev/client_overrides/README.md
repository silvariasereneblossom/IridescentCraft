# Client asset overrides that save memory

Three kinds of file in `.minecraft/kubejs/assets` exist only to cut client memory. None changes what a player sees
or hears. They come from the RAM audit of 2026-10-30 (internal repo, `dev/ram-audit-2026-10-30`). Each one is
right only for the jars it was made from, so `client_overrides.py --check` compares them with the jars.

| File | Over | Why |
|---|---|---|
| `<ns>/sounds.json` (11 namespaces, generated) | every sound event that plays a file of 30 s or more without `"stream": true` | A sound that is not streamed is decoded whole on first play and kept in native memory until quit, where F3 and `-Xmx` do not show it. EDF Remastered's End fight track (1,364 s, 48 kHz stereo) alone is 262 MB. The override restates the event with `"replace": true` and `"stream": true` on each file |
| `theabyss/textures/item/netherite_helmet_-_copy.png` | TATOS' 6000 x 6000 PNG | No model uses it, but the block atlas loads every PNG under `textures/item`: about 198 MB of native memory, and it made the atlas 8192 x 8192 instead of 8192 x 4096. The override is a 16 x 16 transparent PNG of our own |
| `fallingleaves/atlases/leaves.json` | Falling Leaves' `{"type":"directory","source":"particle"}` | The mod registers its reload listener twice, and each copy stitches every `textures/particle` PNG of the pack (about 1,770) into a 4096 x 2048 atlas, while its leaf types use eight `fallingleaves` sprites. Atlas sources from all packs are applied in order, and the `filter` source removes the sprites added before it, here every namespace but `fallingleaves` |

## When to run it

```
python -I .minecraft/dev/client_overrides/client_overrides.py --check
python -I .minecraft/dev/client_overrides/client_overrides.py --write
```

After any mod update or addition (`dev/mods/intake.py update` or `add`), once a launch has synced the instance's
`mods` folder, and before the push. `--check` fails when:
- a sound event's merged list changed, so the override would hide what the update added;
- a new event plays a long track without streaming;
- TATOS fixed or dropped the texture, or something now references it;
- Falling Leaves changed its atlas file.

`--write` regenerates the `sounds.json` files. The other two files are written by hand: the check names what to
re-read. With no flag it prints the event list and changes nothing.

It reads the jars of the PrismLauncher instance (`--mods`) and stops if they are not the client index of the tree,
byte for byte. Vanilla's `sounds.json` comes from PrismLauncher's asset index. Only `.minecraft/kubejs/assets` is
written; `dev/sync-distros.ps1 -Fix` mirrors it to the two distros.

## How the sound list is built

The tool replays the game's merge, pack by pack from the bottom of the stack: every mod jar and nested jar (Forge
gives each one its own entry), then vanilla, then the KubeJS pack. The first registration of an event, or one with
`"replace": true`, starts the event over and sets its subtitle; any other appends. An event goes into the override
when a file of its merged list is 30 s or longer and not streamed. Every file of that event is then streamed. Only
the fields the game reads are restated: `replace` and `subtitle` for the event; `name`, `volume`, `pitch`,
`weight`, `stream`, `attenuation_distance`, `preload` and `type` for a sound. A sound's category is set by the code
that plays it, not by `sounds.json`; the `category` keys some mods write there are ignored by the game and are left
out. The Paxi packs sit above KubeJS, and the tool reports any event of theirs that it cannot cover.
