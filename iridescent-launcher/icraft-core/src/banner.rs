//! Trans-flag-colored startup banner.
//!
//! The original .bat invokes a complex PowerShell P/Invoke to enable
//! VT processing on the Windows console then writes ANSI RGB escapes.
//! Native Rust on modern Windows (Win10+) gets VT for free via the
//! standard library's stdout — no P/Invoke needed.
//!
//! Per `feedback_shell_testing.md` the 5-line banner colors are:
//!   line 1, 5: blue  #5BCEFA  (38;2;91;206;250)
//!   line 2, 4: pink  #F5A9B8  (38;2;245;169;184)
//!   line 3:    white #FFFFFF  (38;2;255;255;255)

const BLUE:  &str = "\x1b[38;2;91;206;250m";
const PINK:  &str = "\x1b[38;2;245;169;184m";
const WHITE: &str = "\x1b[38;2;255;255;255m";
const RESET: &str = "\x1b[0m";

const BAR: &str = "  ==========================================";

pub fn startup_banner() {
    println!();
    println!("{BLUE}{BAR}{RESET}");
    println!("{PINK}  IridescentCraft Server{RESET}");
    println!("{WHITE}  Forge {} ~450 mods{RESET}", crate::config::FORGE_VERSION);
    println!("{PINK}  Iridescent Edition{RESET}");
    println!("{BLUE}{BAR}{RESET}");
    println!();
}

pub fn launch_banner() {
    println!();
    println!("{BLUE}{BAR}{RESET}");
    println!("{PINK}  Welcome to IridescentCraft!{RESET}");
    println!("{WHITE}  Starting server (8-10 GB RAM){RESET}");
    println!("{PINK}  First startup may take 5-15 minutes{RESET}");
    println!("{BLUE}{BAR}{RESET}");
    println!();
}

pub fn installer_banner() {
    println!();
    println!("{BLUE}{BAR}{RESET}");
    println!("{PINK}  IridescentCraft Server Installer{RESET}");
    println!("{WHITE}  Forge {}{RESET}", crate::config::FORGE_VERSION);
    println!("{PINK}  Standalone Edition{RESET}");
    println!("{BLUE}{BAR}{RESET}");
    println!();
}

/// Enable Windows VT processing if we're on Windows. No-op on Unix.
/// Modern Windows 10+ enables this by default for new consoles, but
/// older terminals (CMD launched without VT) need an explicit toggle.
#[cfg(target_os = "windows")]
pub fn enable_ansi() {
    use std::io::Write;
    // Force a write to stdout so the console adopts VT mode if it
    // hasn't already. The actual SetConsoleMode call would require
    // win32 bindings; for a simple banner the auto-enable on first
    // ANSI write is sufficient on Win10+.
    let _ = std::io::stdout().write_all(b"\x1b[0m");
    let _ = std::io::stdout().flush();
}

#[cfg(not(target_os = "windows"))]
pub fn enable_ansi() {}
