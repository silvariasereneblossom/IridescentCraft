//! Diagnostic dump — Java/OS/disk/mod-count snapshot for debugging.
//! Replaces `diagnose.bat` / `diagnose.ps1`.

use anyhow::Result;
use std::process::Command;

use crate::config::ServerConfig;

pub fn report(cfg: &ServerConfig) -> Result<String> {
    let mut out = String::new();
    out.push_str("=== IridescentCraft Server Diagnostic ===\n");
    out.push_str(&format!("server_dir: {}\n", cfg.server_dir.display()));
    out.push_str(&format!("install_marker: {}\n", cfg.install_marker().exists()));
    out.push_str(&format!("forge_dir exists: {}\n", cfg.forge_dir().exists()));
    out.push_str(&format!("eula present: {}\n", cfg.eula().exists()));

    out.push_str(&format!("\n--- mods/ ---\n"));
    if let Ok(rd) = std::fs::read_dir(cfg.mods_dir()) {
        let jars: Vec<_> = rd
            .filter_map(|r| r.ok())
            .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("jar"))
            .collect();
        out.push_str(&format!("jar count: {}\n", jars.len()));
    } else {
        out.push_str("mods/ missing\n");
    }
    out.push_str(&format!("mod index dir present: {}\n", cfg.mods_index().exists()));

    out.push_str("\n--- java -version ---\n");
    match Command::new("java").arg("-version").output() {
        Ok(o) => out.push_str(&String::from_utf8_lossy(&o.stderr)),
        Err(e) => out.push_str(&format!("java not on PATH: {e}\n")),
    }

    out.push_str("\n--- last_sha ---\n");
    match std::fs::read_to_string(cfg.last_sha()) {
        Ok(s) => out.push_str(&format!("{}\n", s.trim())),
        Err(_) => out.push_str("(none)\n"),
    }

    out.push_str("\n--- crash-reports (newest 5) ---\n");
    if let Ok(rd) = std::fs::read_dir(cfg.crash_reports()) {
        let mut entries: Vec<_> = rd
            .filter_map(|r| r.ok())
            .filter_map(|e| e.metadata().ok().and_then(|m| m.modified().ok()).map(|t| (t, e.path())))
            .collect();
        entries.sort_by(|a, b| b.0.cmp(&a.0));
        for (_, p) in entries.iter().take(5) {
            out.push_str(&format!("{}\n", p.display()));
        }
        if entries.is_empty() { out.push_str("(none)\n"); }
    } else {
        out.push_str("(none)\n");
    }

    Ok(out)
}
