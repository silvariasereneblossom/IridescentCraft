=== IridescentCraft AStages: Distribution Package ===

This is the distribution-ready layout. Every folder here goes directly
into the modpack instance root (.minecraft/ for Prism, or the instance
folder for CurseForge).

Players need no manual steps: installing the pack is enough.

Folder breakdown:
  config/           Mod configuration files (ScalingMobs, Champions,
                    Apotheosis, Progressive Bosses, Improved Mobs,
                    Dynamic Difficulty, Bosses Scale With Player Count)

  kubejs/           KubeJS scripts (loot overhaul, tier gating, villager
                    trades, milestone detection, AStages definitions)

  global_packs/     Paxi-managed datapacks (auto-applied to all worlds)
    required_data/
      champions_datapack/       Champion affix tier restrictions
      improvedmobs_datapack/    Improved Mobs attribute scaling

  defaultconfigs/   Forge auto-copies these to world serverconfig/ on
                    new world creation (Champions ranks & affixes)

NOTE FOR EXISTING WORLDS: to apply this to an existing world, also
copy these by hand:
  - defaultconfigs/*.toml → saves/YourWorld/serverconfig/
  - global_packs/required_data/* → saves/YourWorld/datapacks/
New worlds pick these up automatically.
