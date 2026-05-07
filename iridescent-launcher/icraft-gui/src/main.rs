//! `icraft-gui` — placeholder. Phase 2 swaps the body for an egui
//! window with one button per `icraft-cli` subcommand and a real-time
//! log pane fed from icraft-core via a channel.
//!
//! For v0 this is a stub that prints the planned button list and exits.
//! Keeping the binary in the workspace ensures we catch icraft-core
//! API breakage early — every API change has to compile against this
//! crate too.

fn main() {
    println!("icraft-gui: not yet implemented (Phase 2)");
    println!();
    println!("Planned buttons (mirroring icraft-cli subcommands):");
    println!("  [Serve]            full sync + install + launch");
    println!("  [Sync]             pull repo updates only");
    println!("  [Self-Update]      apply staged .new files + relaunch");
    println!("  [Install Forge]    Forge {}", icraft_core::config::FORGE_VERSION);
    println!("  [Install Mods]     bulk download from .index");
    println!("  [Strip Client]     remove client-only mods");
    println!("  [Update Mods]      sync mods/ against .index");
    println!("  [Cleanup Jars]     remove stale jars");
    println!("  [Accept EULA]      write eula=true");
    println!("  [Run]              launch java (skip sync/install)");
    println!("  [Push Crash Logs]  capture + git push");
    println!("  [Diagnose]         system/install report");
    println!("  [Firewall Audit]   Windows-only port check");
    std::process::exit(0);
}
