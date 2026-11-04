//! Path constants, Forge version, custom JAR allowlist.

use std::path::{Path, PathBuf};

pub const FORGE_VERSION: &str = "1.20.1-47.4.6";
pub const FORGE_INSTALLER_URL: &str =
    "https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.4.6/forge-1.20.1-47.4.6-installer.jar";

/// GitHub repo coordinates for self-update + sync flows.
pub const GITHUB_REPO_OWNER: &str = "silvariasereneblossom";
pub const GITHUB_REPO_NAME: &str = "IridescentCraft";
pub const GITHUB_REPO_BRANCH: &str = "main";
/// Server-distribution path within the repo.
pub const REPO_SERVER_PATH: &str = ".minecraft/server_distribution";

/// Where the server's log mirror is pushed: a PRIVATE repository of its own
/// (operator ruling 2026-10-11). Never the pack repo above, which is public;
/// logs carry player names, chat and addresses.
pub const LOGS_REPO_OWNER: &str = GITHUB_REPO_OWNER;
pub const LOGS_REPO_NAME: &str = "IridescentCraft-logs";
pub const LOGS_REPO_BRANCH: &str = "main";

/// JAR filenames that are NOT managed by packwiz and must be
/// preserved by `cleanup_stale_jars` when the manifest can't be loaded.
///
/// FALLBACK ONLY. The real keep-authority is `custom_jars_manifest.json`
/// (loaded at runtime by `cleanup_stale_jars`); this list is the floor
/// used when the manifest is missing/unparseable. Keep it byte-aligned
/// with the `$customJars` array in `cleanup_stale_jars.ps1` (the
/// canonical hand-maintained copy) — a drift here re-opens the
/// "a new custom jar got purged because its allowlist entry was missed"
/// class of bug. Last reconciled to the PS1 list 2026-06-19: dropped the
/// retired `zeta_racefix-1.0.0.jar` (gone from manifest + PS1); added
/// `iridescent_grand_compass`, `iridescent_relics`, `linearxp`,
/// `lovely_sparkle_pieces` (present in PS1 + manifest, missing here).
pub const CUSTOM_JARS: &[&str] = &[
    "iridescent_codex_data.jar",
    "iridescent_origins-1.0.0.jar",
    "iridescent_biomes-1.0.0.jar",
    "iridescent_tetra_expansion-1.0.0.jar",
    "iridescent_durability_clamp-0.1.0.jar",
    "iridescent_difficulty-0.1.0.jar",
    "iridescent_grand_compass-1.0.0.jar",
    "justlevelingfork-1.2.1-iridescent.1.jar",
    "mek_walkable_cables-1.0.1.jar",
    "offlineskins-1.20.1-v1.jar",
    "Patchouli-1.20.1-85-FORGE.jar",
    "ars_nouveau-1.20.1-4.12.7-all.jar",
    "class-artifacts-forge-2.0.5.jar",
    "iridescent_relics-1.0.0.jar",
    "linearxp-1.0.0-iridescent.1.jar",
    "lovely_sparkle_pieces-0.1.0.0-iridescent.2.jar",
];

/// Lowercase substring patterns for jars that must NEVER be present —
/// mods intentionally pulled from the pack. `cleanup_stale_jars`
/// force-removes any jar whose (lowercased) filename contains one of
/// these, before the allowlist/hash checks (Layer 1 in
/// `cleanup_stale_jars.ps1`). The server runs the Rust `serve()`, never
/// the PS1, so without this port a denied mod that lands on the server
/// (e.g. synced from a tester's client distro) would survive. Keep in
/// lockstep with `$denyList` in `cleanup_stale_jars.ps1`.
pub const DENY_LIST_PATTERNS: &[&str] = &[
    "truly_modular",   // Truly-Modular suite (replaced by iridescent_reforging)
    "truly-modular",   // hyphenated variant of same
    "rechiseled",      // removed — SuperMartijn642 dep removed
    "supermartijn642", // removed — dep chain incompat
    "connectedglass",  // removed — SuperMartijn642 dep
    "trashcans",       // removed — SuperMartijn642 dep
    "fastback",        // removed 2026-10-11 — needs git on the JVM's PATH, never ran on the server; see backup.rs
    "chunky-player-pause-", // removed 2026-10-18: does nothing in the pack; operator 2026-10-18 23:05 EDT: "FancyMenu + Konkrete + Melody, chunky-player-pause, TenshiLib"
    "tenshilib-",      // removed 2026-10-18: does nothing in the pack; operator 2026-10-18 23:05 EDT: "FancyMenu + Konkrete + Melody, chunky-player-pause, TenshiLib"
    "fancymenu_",      // removed 2026-10-18: does nothing in the pack; operator 2026-10-18 23:05 EDT: "FancyMenu + Konkrete + Melody, chunky-player-pause, TenshiLib"
    "konkrete_",       // removed 2026-10-18: does nothing in the pack; operator 2026-10-18 23:05 EDT: "FancyMenu + Konkrete + Melody, chunky-player-pause, TenshiLib"
    "melody_",         // removed 2026-10-18: does nothing in the pack; operator 2026-10-18 23:05 EDT: "FancyMenu + Konkrete + Melody, chunky-player-pause, TenshiLib"
    "jeitweaker-",     // removed 2026-10-31: RAM audit 2026-10-30: no CraftTweaker script in the pack (operator 2026-10-31)
    "crafttweaker-",   // removed 2026-10-31: RAM audit 2026-10-30: no .zs script in the pack; forced ModernFix smart_ingredient_sync off (operator 2026-10-31)
    "silent-lib-",     // removed 2026-10-31: RAM audit 2026-10-30: a library no jar of the pack references (operator 2026-10-31)
    "polylib-",        // removed 2026-10-31: RAM audit 2026-10-30: a library no jar of the pack references (operator 2026-10-31)
    "libraryferret-",  // removed 2026-10-31: RAM audit 2026-10-30: a library no jar of the pack references (operator 2026-10-31)
    "libipn-",         // removed 2026-10-31: RAM audit 2026-10-30: a library no jar of the pack references (operator 2026-10-31)
    "lazydfu-",        // removed 2026-10-31: RAM audit 2026-10-30: the same job as ModernFix dynamic_dfu, which is on (operator 2026-10-31)
    "probejs-",        // removed 2026-10-31: RAM audit 2026-10-30: script-typing dev tool, a dump thread on every client join (operator 2026-10-31)
    "kubejsoffline-",  // removed 2026-10-31: RAM audit 2026-10-30: offline documentation dev tool on clients (operator 2026-10-31)
];

/// Custom-jar hash manifest filename, sat at the distro root (sibling of
/// `mods/`). The single source of truth for which custom jars are
/// expected AND their canonical SHA-256 — `cleanup_stale_jars` reads it
/// to catch same-filename content drift (a rebuilt `iridescent_*` jar
/// that kept its version string). Generated by
/// `regen_custom_jars_manifest.ps1`.
pub const CUSTOM_JARS_MANIFEST_FILE: &str = "custom_jars_manifest.json";

/// The server's JVM flags: Aikar's G1 set (first copied from
/// `iridescentserver.bat` Phase 4), with the heap sized by measurement.
///
/// The heap is config c of the heap-sizing measurement, shipped by the
/// operator's ruling of 2026-11-04 (internal repo,
/// `dev/ram-audit-2026-10-30/heap-sizing-2026-11-02/README.md`, `69c4a60`).
/// It replaced `-Xms8G -Xmx10G -XX:+AlwaysPreTouch`, which committed 8 GB
/// from the first second (9.5 GB of the box's RAM, measured). On the boot rig,
/// with no players, the live heap after a load was 2.0 GB. Under c the
/// committed heap held at the 4 GB floor through Chunky and a force-load (box
/// estimate 5.3 GB), tick time did not change, and the longest pause was 40 ms.
/// Measured once and never with players; the GC log ([`GC_LOG_DIR`]) is how
/// it is watched live.
///   - `-Xms4G`: the floor every shrink stops at. 2 GB is too small for the
///     boot: G1 grew past it at once and kept 5.7 GB (config e).
///   - no `-XX:+AlwaysPreTouch`: it made all of `-Xms` resident at start.
///   - `MinHeapFreeRatio=10`, `MaxHeapFreeRatio=30`: G1 shrinks only at a
///     Remark (or a full GC), and only down to 1/(1 - Max/100) times the heap
///     in use: 1.43 times here, 3.3 times with the defaults (40/70). Memory
///     taken in a busy spell goes back once it ends.
///   - `-Xmx10G` stays: room for players and spikes, free until G1 uses it.
///   - `G1PeriodicGCInterval` is left out on purpose: untested (the README's
///     open item).
///
/// The boot rig (`.minecraft/dev/boot/icboot.py`) reads this array and puts
/// its own `-Xmx`/`-Xms` in place of these two.
pub const AIKAR_FLAGS: &[&str] = &[
    "-noverify",
    "-Xmx10G", "-Xms4G",
    "-XX:MinHeapFreeRatio=10",
    "-XX:MaxHeapFreeRatio=30",
    "-XX:+UseG1GC",
    "-XX:+ParallelRefProcEnabled",
    "-XX:MaxGCPauseMillis=200",
    "-XX:+UnlockExperimentalVMOptions",
    "-XX:+DisableExplicitGC",
    "-XX:G1NewSizePercent=30",
    "-XX:G1MaxNewSizePercent=40",
    "-XX:G1HeapRegionSize=8M",
    "-XX:G1ReservePercent=20",
    "-XX:G1HeapWastePercent=5",
    "-XX:G1MixedGCCountTarget=4",
    "-XX:InitiatingHeapOccupancyPercent=15",
    "-XX:G1MixedGCLiveThresholdPercent=90",
    "-XX:G1RSetUpdatingPauseTimePercent=5",
    "-XX:SurvivorRatio=32",
    "-XX:+PerfDisableSharedMem",
    "-XX:MaxTenuringThreshold=1",
    "-Dusing.aikars.flags=https://mcflags.emc.gs",
    "-Daikars.new.flags=true",
    "-XX:+HeapDumpOnOutOfMemoryError",
    // NOTE: no `-XX:HeapDumpPath` here on purpose. A FIXED path is one the
    // JVM refuses to overwrite, so a single stale dump silently blocks every
    // later OOM capture (a 14.78 GB `crash-heapdump.hprof` from 2026-06-13
    // ate the 2026-09-04 OOM that wedged the server for a week). The path is
    // computed per-launch -- timestamped, in `crash-reports/heapdumps/` --
    // by `run::prepare_heap_dump_path`, which appends the flag after these.
    // The legacy bat/sh launchers got the same fix on 2026-07-15.
    //
    // `-XX:+PerfDisableSharedMem` (above) hides the JVM's counters from
    // `jstat`, so the GC log is how this server's heap is read. Like the dump
    // path, it is not in this array: see [`gc_log_flag`].
];

/// The server's GC log folder, in the server dir: `gc.log` and its rotations.
/// It is the launcher's own. No sync writes or deletes in it (it is in
/// `sync::EXCLUDED_DIRS`, and no path of the pack repo names it), the log push
/// stages only `logs/` and `crash-reports/`, and a world backup takes the world
/// and the server's own state files, not this.
pub const GC_LOG_DIR: &str = "gc-logs";
/// Archived files the JVM keeps beside the current `gc.log`.
///
/// The JVM moves the previous run's `gc.log` to `gc.log.<n>` at every start
/// (the numbers form a ring: when all are taken it reuses the oldest by
/// modification time, so sort by time, not by number), and rotates within a
/// run at [`GC_LOG_FILE_SIZE`]. Every restart takes one file, however small:
/// many small files keep the most restarts. The bound is
/// (`GC_LOG_FILE_COUNT` + 1) x `GC_LOG_FILE_SIZE` = 100 MB. On the rig a young
/// pause wrote about 2 KB at `gc*` info: an idle 4 h run (one every 90 s) is
/// well under 1 MB; Chunky (one a second) about 7 MB an hour.
pub const GC_LOG_FILE_COUNT: u32 = 49;
/// Size at which the current `gc.log` is rotated within a run.
pub const GC_LOG_FILE_SIZE: &str = "2M";

/// The `-Xlog` option of the server's GC log, added by `run.rs` once
/// [`ServerConfig::gc_log_dir`] exists. Not in [`AIKAR_FLAGS`] because a log
/// file in a folder that does not exist stops the JVM from starting at all
/// ("Invalid -Xlog option"), and the boot rig takes that array as it is. The
/// path is relative to the JVM's working directory (the server dir) so it has
/// no drive colon and no space: `-Xlog` splits its argument at colons.
pub fn gc_log_flag() -> String {
    format!(
        "-Xlog:gc*:file={GC_LOG_DIR}/gc.log:time,uptime,level,tags:filecount={GC_LOG_FILE_COUNT},filesize={GC_LOG_FILE_SIZE}"
    )
}

/// Server install root — the directory containing forge / mods /
/// libraries / config. Determined by:
///   1. `--server-dir` CLI arg if provided (handled by caller)
///   2. The current working directory if it contains `.icraft_server`
///   3. CWD/IridescentCraft Dedicated Server (the bootstrap target)
#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub server_dir: PathBuf,
}

impl ServerConfig {
    pub fn from_cwd_or_default() -> std::io::Result<Self> {
        let cwd = std::env::current_dir()?;
        Ok(Self { server_dir: cwd })
    }

    pub fn from_path<P: Into<PathBuf>>(p: P) -> Self {
        Self { server_dir: p.into() }
    }

    pub fn mods_dir(&self) -> PathBuf { self.server_dir.join("mods") }
    pub fn mods_index(&self) -> PathBuf { self.mods_dir().join(".index") }
    pub fn libraries_dir(&self) -> PathBuf { self.server_dir.join("libraries") }
    pub fn forge_dir(&self) -> PathBuf {
        self.libraries_dir()
            .join("net/minecraftforge/forge")
            .join(FORGE_VERSION)
    }
    pub fn forge_installer(&self) -> PathBuf {
        self.server_dir.join(format!("forge-{FORGE_VERSION}-installer.jar"))
    }
    pub fn win_args(&self) -> PathBuf {
        self.libraries_dir()
            .join("net/minecraftforge/forge")
            .join(FORGE_VERSION)
            .join("win_args.txt")
    }
    pub fn unix_args(&self) -> PathBuf {
        self.libraries_dir()
            .join("net/minecraftforge/forge")
            .join(FORGE_VERSION)
            .join("unix_args.txt")
    }
    pub fn eula(&self) -> PathBuf { self.server_dir.join("eula.txt") }
    pub fn install_marker(&self) -> PathBuf { self.server_dir.join(".icraft_server") }
    pub fn last_sha(&self) -> PathBuf { self.server_dir.join(".icraft_last_sha") }
    /// Custom-jar SHA-256 manifest (sibling of `mods/`); see
    /// [`CUSTOM_JARS_MANIFEST_FILE`].
    pub fn custom_jars_manifest(&self) -> PathBuf {
        self.server_dir.join(CUSTOM_JARS_MANIFEST_FILE)
    }
    pub fn logs_dir(&self) -> PathBuf { self.server_dir.join("logs") }
    pub fn crash_reports(&self) -> PathBuf { self.server_dir.join("crash-reports") }
    /// Per-launch OOM heap dumps (`heap_<YYYYmmdd_HHMMSS>.hprof`). Same
    /// location the bat/sh launchers use. Deliberately EXCLUDED from the
    /// log mirror in [`crate::logpush`] -- each dump is
    /// heap-sized and would blow past GitHub's blob limit.
    pub fn heapdumps_dir(&self) -> PathBuf { self.crash_reports().join("heapdumps") }
    /// The GC log ([`GC_LOG_DIR`], [`gc_log_flag`]).
    pub fn gc_log_dir(&self) -> PathBuf { self.server_dir.join(GC_LOG_DIR) }

    /// `level-name` from server.properties: the world folder, relative to the
    /// server dir. `world` (Minecraft's own default) when the file or the key
    /// is missing, or the value is not a plain relative path.
    pub fn level_name(&self) -> String {
        std::fs::read_to_string(self.server_dir.join("server.properties"))
            .ok()
            .and_then(|props| parse_level_name(&props))
            .unwrap_or_else(|| "world".to_string())
    }
    pub fn world_dir(&self) -> PathBuf { self.server_dir.join(self.level_name()) }
    /// World backups (see [`crate::backup`]). Excluded from every sync.
    pub fn backups_dir(&self) -> PathBuf { self.server_dir.join("backups") }

    /// Best-effort guess at whether this directory is already a
    /// configured icraft server install.
    pub fn is_installed(&self) -> bool {
        self.install_marker().exists() || self.forge_dir().exists()
    }

    /// Assert the path is somewhere we expect to write. Guards against
    /// running the launcher from `Downloads/` or `Desktop/` and creating
    /// an install in a system folder.
    pub fn looks_like_system_dir(&self) -> bool {
        let p = self.server_dir.to_string_lossy().to_lowercase();
        ["\\downloads", "\\desktop", "\\documents", "/downloads", "/desktop"]
            .iter()
            .any(|s| p.contains(s))
    }
}

/// The `level-name` value of a server.properties body. `\x` escapes are
/// reduced to `x` (enough for the `\ `, `\:`, `\=` Java writes; `\uXXXX` is
/// not decoded). `None` unless it is a plain relative path: a `..` or an
/// absolute path here would point the backup at something that is not a world.
fn parse_level_name(props: &str) -> Option<String> {
    for raw in props.lines() {
        let line = raw.trim_start_matches('\u{feff}').trim_start();
        if line.starts_with('#') || line.starts_with('!') {
            continue;
        }
        let Some((key, value)) = line.split_once(|c: char| c == '=' || c == ':') else { continue };
        if key.trim() != "level-name" {
            continue;
        }
        let mut name = String::new();
        let mut chars = value.trim().chars();
        while let Some(c) = chars.next() {
            if c == '\\' {
                if let Some(escaped) = chars.next() {
                    name.push(escaped);
                }
            } else {
                name.push(c);
            }
        }
        let plain = !name.is_empty()
            && Path::new(&name).components().all(|c| matches!(c, std::path::Component::Normal(_)));
        return plain.then_some(name);
    }
    None
}

/// Helper for path-relative resolution from inside the launcher.
pub fn join_existing(base: &Path, sub: &str) -> Option<PathBuf> {
    let p = base.join(sub);
    if p.exists() { Some(p) } else { None }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn level_name_comes_from_server_properties() {
        let name = |props: &str| parse_level_name(props);
        assert_eq!(name("#Minecraft server properties\nlevel-name=world\n").as_deref(), Some("world"));
        assert_eq!(name("motd=x\r\nlevel-name = My\\ World \r\nlevel-seed=1").as_deref(), Some("My World"));
        assert_eq!(name("\u{feff}level-name=worlds/main").as_deref(), Some("worlds/main"));
        // Absent, commented out or empty: the caller falls back to `world`.
        assert_eq!(name("level-type=default"), None);
        assert_eq!(name("#level-name=old\nlevel-type=default"), None);
        assert_eq!(name("level-name="), None);
        // Never a path that leaves the server dir.
        assert_eq!(name("level-name=.."), None);
        assert_eq!(name("level-name=../elsewhere"), None);
        assert_eq!(name("level-name=/abs"), None);
    }

    #[test]
    fn world_dir_follows_level_name() {
        let dir = std::env::temp_dir().join(format!("icraft-config-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let cfg = ServerConfig::from_path(&dir);
        assert_eq!(cfg.level_name(), "world"); // no server.properties yet
        std::fs::write(dir.join("server.properties"), "level-name=alpha\n").unwrap();
        assert_eq!(cfg.world_dir(), dir.join("alpha"));
        assert_eq!(cfg.backups_dir(), dir.join("backups"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The per-launch options stay out of the fixed array: the boot rig starts
    /// its JVM with the array as it is, in a folder with no `gc-logs/`, and a
    /// missing log folder is a JVM that does not start.
    #[test]
    fn the_fixed_flags_carry_no_log_file_and_no_dump_path() {
        for flag in AIKAR_FLAGS {
            assert!(!flag.starts_with("-Xlog"), "{flag}");
            assert!(!flag.starts_with("-XX:HeapDumpPath"), "{flag}");
        }
    }

    /// `-Xlog` splits at colons: the file part must be the relative path in
    /// the GC log folder, with no drive letter and nothing else in it.
    #[test]
    fn the_gc_log_option_names_a_relative_file_in_its_folder() {
        let flag = gc_log_flag();
        let parts: Vec<&str> = flag.split(':').collect();
        assert_eq!(
            parts,
            [
                "-Xlog",
                "gc*",
                &format!("file={GC_LOG_DIR}/gc.log"),
                "time,uptime,level,tags",
                &format!("filecount={GC_LOG_FILE_COUNT},filesize={GC_LOG_FILE_SIZE}"),
            ],
            "{flag}"
        );
        assert!(!GC_LOG_DIR.contains(' '));
    }
}
