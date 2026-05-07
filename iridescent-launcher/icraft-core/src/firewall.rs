//! Windows firewall audit — checks for the icraft-server inbound rule.
//! No-op on Linux. Equivalent of `firewall_audit.bat`.
//!
//! On Windows we shell to `netsh advfirewall firewall show rule name=...`
//! and report whether port 25565/TCP is allowed.

use anyhow::Result;

pub fn audit() -> Result<String> {
    if !cfg!(target_os = "windows") {
        return Ok("[firewall] not Windows -- skipping audit\n".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let out = Command::new("netsh")
            .args(["advfirewall", "firewall", "show", "rule", "name=IridescentCraft Server"])
            .output()?;
        let body = String::from_utf8_lossy(&out.stdout).into_owned();
        if body.contains("LocalPort:") || body.contains("Local Port:") {
            return Ok(format!("[firewall] rule present:\n{body}"));
        }
        Ok(format!(
            "[firewall] no rule found. Suggested:\n  netsh advfirewall firewall add rule \\\n    name=\"IridescentCraft Server\" dir=in action=allow protocol=TCP localport=25565\n"
        ))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(String::new())
    }
}
