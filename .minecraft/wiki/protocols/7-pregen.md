# Protocol 7: World Pre-Generation (Chunky)

## Automatic (default)

Pre-generation now auto-triggers on first world load via `kubejs/server_scripts/pregen/auto_chunky.js`. The script uses `ServerEvents.loaded` + `server.persistentData` to fire `/chunky start` exactly once per world, with:

- **dimension:** `minecraft:overworld`
- **center:** 0, 0
- **radius:** 2500 blocks (~104,000 chunks; the canonical value - reconciled 2026-06-06, the doc previously said 1500)

`config/chunky/config.json` has `continueOnRestart: true`, so interrupted pre-gens resume automatically on the next launch. `chunky-player-pause` pauses the task while any player is online, so it's safe to leave running — it'll chip away at the background whenever the server is idle.

The `icraft_chunky_pregen_started` flag in the world's persistent data prevents re-triggering. To force a re-run (e.g., bigger radius), delete the flag: `/data remove storage kubejs:server icraft_chunky_pregen_started` (or just start a fresh world).

## When to run manually

Before opening a fresh world to testers, or whenever a new spawn region is established. Pre-generating chunks moves all worldgen + structure-placement cost (Dungeon Crawl, Better Dungeons, When Dungeons Arise, etc.) to a one-time offline operation, eliminating the multi-second main-thread stalls that happen when players walk into densely-packed structure regions during play.

## Mods involved

- **Chunky** — does the pre-generation
- **Pause-on-join is script-managed** (auto_chunky.js) as of 2026-06-06 - the chunky-player-pause jar shipped an empty stub plus a datapack function that never parsed on our Chunky version; the mod is inert and optional to remove

## Commands (run from server console or as op)

Pick the spawn coordinates as the center, then:

```
/chunky world minecraft:overworld
/chunky center 0 0
/chunky radius 2500
/chunky start
```

`radius 2500` covers a 5000-block diameter region (~104,000 chunks) - a long offline pregen; drop to 1500 (~37,500 chunks) if you need the world open sooner.

To monitor: `/chunky status`. To stop early: `/chunky cancel`.

When the overworld is done, repeat for any other dimension testers will visit early:

```
/chunky world twilightforest:twilight_forest
/chunky center 0 0
/chunky radius 800
/chunky start
```

## Why this matters for IridescentCraft specifically

A 115-second main-thread stall on 2026-04-10 was tracked to Dungeon Crawl generating a multi-node dungeon at (~2782, 73, 1631) while the tester was actively playing nearby. The chunk manager held the server thread for the entire structure placement + Lootr chest conversion sequence. Pre-generation makes this a non-issue: by the time a player walks into that area, the dungeon already exists on disk and worldgen does nothing.

Recommended for any mod stack that includes structure-heavy mods (we have 7+: Dungeon Crawl, YUNG's Better Dungeons, Stalwart Dungeons, Brutal Bosses, Epic Dungeons, When Dungeons Arise, Dungeons Plus).

## Server.properties view/sim distance

Pre-gen pairs well with conservative `view-distance` / `simulation-distance` in `server.properties`. Current shipped values in `server_distribution/server.properties`:

```
view-distance=6
simulation-distance=4
```

These values mean fewer new chunks need to load per player movement, reducing pressure on the chunk pipeline. Pre-gen + low view/sim distance is the standard combo for stable kitchen-sink modpacks.
