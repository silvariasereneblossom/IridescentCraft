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

/// JAR filenames that are NOT managed by packwiz and must be
/// preserved by `cleanup_stale_jars`. Mirror of the `customJars`
/// arrays in `cleanup_stale_jars.ps1` and `update_mods.ps1`.
pub const CUSTOM_JARS: &[&str] = &[
    "iridescent_codex_data.jar",
    "iridescent_origins-1.0.0.jar",
    "iridescent_biomes-1.0.0.jar",
    "iridescent_tetra_expansion-1.0.0.jar",
    "iridescent_durability_clamp-0.1.0.jar",
    "iridescent_difficulty-0.1.0.jar",
    "justlevelingfork-1.2.1-iridescent.1.jar",
    "mek_walkable_cables-1.0.1.jar",
    "offlineskins-1.20.1-v1.jar",
    "zeta_racefix-1.0.0.jar",
    "Patchouli-1.20.1-85-FORGE.jar",
    "ars_nouveau-1.20.1-4.12.7-all.jar",
    "class-artifacts-forge-2.0.5.jar",
];

/// Aikar JVM flags — server-tuned G1GC config copied from
/// `iridescentserver.bat` Phase 4.
pub const AIKAR_FLAGS: &[&str] = &[
    "-noverify",
    "-Xmx10G", "-Xms8G",
    "-XX:+UseG1GC",
    "-XX:+ParallelRefProcEnabled",
    "-XX:MaxGCPauseMillis=200",
    "-XX:+UnlockExperimentalVMOptions",
    "-XX:+DisableExplicitGC",
    "-XX:+AlwaysPreTouch",
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
    "-XX:HeapDumpPath=crash-heapdump.hprof",
];

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
    pub fn logs_dir(&self) -> PathBuf { self.server_dir.join("logs") }
    pub fn crash_reports(&self) -> PathBuf { self.server_dir.join("crash-reports") }

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

/// Helper for path-relative resolution from inside the launcher.
pub fn join_existing(base: &Path, sub: &str) -> Option<PathBuf> {
    let p = base.join(sub);
    if p.exists() { Some(p) } else { None }
}
