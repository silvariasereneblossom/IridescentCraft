//! "Start at boot": the launcher starts when Windows starts, with nobody
//! logged on, and runs the server.
//!
//! 2026-10-19/20: an in-place upgrade of the box restarted it five times and
//! nothing started the launcher afterwards. The launcher lived in the
//! operator's desktop session, the old task `IridescentMCStart` had no trigger
//! at all (an on-demand task that started the legacy `.bat` in a session that
//! had to exist already), and the server stayed down for about seven hours
//! until the operator logged on and started it. Operator ruling (01:06 EDT
//! 2026-10-20): "launcher should open at boot and launch".
//!
//! How, without a stored password (auto-logon and saved credentials are not
//! on the table): a Task Scheduler task with a boot trigger and an S4U
//! principal, the operator's own account. S4U is "run whether the user is
//! logged on or not" with "do not store password": Windows logs the account on
//! by itself at boot, in session 0, with no desktop anyone can see, no access
//! to network SHARES (none is needed: the server folder is local, GitHub is
//! plain HTTPS) and none to files the account encrypted. Registering one for
//! one's own account needs no password and no elevation. The task starts
//! `icraft-gui.exe --boot "<server folder>"`: the launcher without its window
//! (the boot instance), which runs the same supervised Cycle the Cycle button
//! runs and keeps the server up exactly as the window does. A window opened
//! later, at an RDP logon, finds the boot instance holding the server folder
//! (`instance.rs`), shows what it is doing, and can take the server over.
//!
//! The operator turns this on once, at the box: the "Start at boot" box on the
//! Server tab registers the task ([`register`]); unticking it deletes it.
//! Nothing registers it remotely. Task Scheduler refuses an S4U registration
//! from an unelevated token ("Access is denied", measured on Server 2025
//! 2026-10-20, although Microsoft's page on task security reads otherwise), so
//! the window then asks Windows for administrator approval (a UAC prompt) and
//! registers through a copy of itself run as administrator ([`run_elevated`],
//! `icraft-gui.exe --boot-task register <folder>`). The task grants the account
//! full access to itself ([`task_xml`]'s security descriptor), so the
//! unelevated window can read it back and run it afterwards.

use anyhow::{anyhow, Result};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// The task, at the root of the Task Scheduler library.
pub const TASK_NAME: &str = "IridescentCraft launcher at boot";
/// `icraft-gui.exe --boot "<server folder>"` starts the boot instance.
pub const BOOT_ARG: &str = "--boot";
/// After boot, before the launcher starts: the network and the relay service
/// come up first, so the first sync does not start on an offline box.
pub const BOOT_DELAY: &str = "PT1M";

/// The boot instance's server folder, from the command line: `--boot <dir>`,
/// or `--boot` alone (the task's working directory, which is the folder).
/// `None` = no `--boot`: the window. Other arguments are ignored, as before.
pub fn boot_dir_from_args<I, S>(args: I, cwd: impl FnOnce() -> Option<PathBuf>) -> Option<PathBuf>
where
    I: IntoIterator<Item = S>,
    S: Into<std::ffi::OsString>,
{
    let args: Vec<std::ffi::OsString> = args.into_iter().map(Into::into).collect();
    let at = args.iter().position(|a| a.to_str().is_some_and(|s| s.eq_ignore_ascii_case(BOOT_ARG)))?;
    match args.get(at + 1).filter(|a| !a.to_string_lossy().starts_with("--")) {
        Some(dir) => Some(PathBuf::from(dir)),
        None => cwd(),
    }
}

/// `--boot-task <register|remove> <server folder>`: the registration helper the
/// window runs as administrator (see [`run_elevated`]).
pub const BOOT_TASK_ARG: &str = "--boot-task";

pub fn boot_task_from_args<I, S>(args: I) -> Option<(String, PathBuf)>
where
    I: IntoIterator<Item = S>,
    S: Into<std::ffi::OsString>,
{
    let args: Vec<std::ffi::OsString> = args.into_iter().map(Into::into).collect();
    let at = args.iter().position(|a| a.to_str().is_some_and(|s| s.eq_ignore_ascii_case(BOOT_TASK_ARG)))?;
    let action = args.get(at + 1)?.to_str()?.to_ascii_lowercase();
    let dir = PathBuf::from(args.get(at + 2)?);
    matches!(action.as_str(), "register" | "remove").then_some((action, dir))
}

/// The task's argument string. A trailing backslash would escape the closing
/// quote, so it goes.
pub fn boot_arguments(server_dir: &Path) -> String {
    let dir = server_dir.display().to_string();
    format!("{BOOT_ARG} \"{}\"", dir.trim_end_matches(['\\', '/']))
}

/// `DOMAIN\user` of this process (a local account: `COMPUTER\user`).
pub fn current_user() -> Option<String> {
    let user = std::env::var("USERNAME").ok().filter(|u| !u.is_empty())?;
    Some(match std::env::var("USERDOMAIN").ok().filter(|d| !d.is_empty()) {
        Some(domain) => format!("{domain}\\{user}"),
        None => user,
    })
}

/// The SID of this process's account (`S-1-5-21-...`), from `whoami /user`.
pub fn current_user_sid() -> Option<String> {
    if !cfg!(windows) {
        return None;
    }
    let mut cmd = std::process::Command::new("whoami.exe");
    cmd.args(["/user", "/fo", "csv", "/nh"]).stdin(std::process::Stdio::null());
    let out = crate::subprocess::run_bounded(cmd, "whoami /user", Duration::from_secs(30)).ok()?;
    sid_from_whoami(&String::from_utf8_lossy(&out.stdout))
}

/// `"box\op","S-1-5-21-1-2-3-1001"` -> the SID.
fn sid_from_whoami(csv: &str) -> Option<String> {
    let sid = csv.lines().find(|l| !l.trim().is_empty())?.rsplit(',').next()?.trim().trim_matches('"').to_string();
    (sid.starts_with("S-1-") && sid[4..].chars().all(|c| c.is_ascii_digit() || c == '-')).then_some(sid)
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

fn xml_unescape(s: &str) -> String {
    s.replace("&quot;", "\"").replace("&apos;", "'").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
}

/// The task definition, in Task Scheduler's XML.
///
/// - S4U, the operator's account, least privilege: the window runs the same
///   way today (an unelevated token, measured on the box 2026-10-20), so the
///   server's files are written by the same account either way.
/// - Priority 4: a task's default (7) runs its process, and so the JVM it
///   starts, at below-normal CPU priority with LOW I/O and memory priority.
///   4 is the only level with all three normal (Task Scheduler schema docs).
/// - No time limit (the default stops a task after 72 h), one instance, no
///   battery rules, and three retries five minutes apart if it fails to start.
/// - With the account's SID, a security descriptor: SYSTEM, Administrators and
///   the account itself have full access. A task registered as administrator is
///   otherwise not readable by the same account unelevated, and the window
///   could not tell whether it is there.
pub fn task_xml(exe: &Path, server_dir: &Path, user: &str, sid: Option<&str>) -> String {
    let dir = server_dir.display().to_string();
    let sd = sid.map_or(String::new(), |sid| format!("\n    <SecurityDescriptor>D:(A;;FA;;;SY)(A;;FA;;;BA)(A;;FA;;;{sid})</SecurityDescriptor>"));
    format!(
        r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Starts the IridescentCraft server launcher without its window when Windows starts, before anyone logs on, so a reboot cannot leave the server down. Registered by the launcher's "Start at boot" box (Server tab); untick it there to remove this task.</Description>
    <URI>\{name}</URI>{sd}
  </RegistrationInfo>
  <Triggers>
    <BootTrigger>
      <Enabled>true</Enabled>
      <Delay>{delay}</Delay>
    </BootTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>{user}</UserId>
      <LogonType>S4U</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>4</Priority>
    <RestartOnFailure>
      <Interval>PT5M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>{exe}</Command>
      <Arguments>{args}</Arguments>
      <WorkingDirectory>{dir}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"#,
        name = xml_escape(TASK_NAME),
        delay = BOOT_DELAY,
        user = xml_escape(user),
        exe = xml_escape(&exe.display().to_string()),
        args = xml_escape(&boot_arguments(server_dir)),
        dir = xml_escape(dir.trim_end_matches(['\\', '/'])),
    )
}

/// What the task registered under [`TASK_NAME`] does, against what this
/// launcher would register.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Registered {
    No,
    Yes,
    /// There is one, and it is not this launcher's for this folder: why.
    Differs(String),
}

/// The first `<tag>...</tag>` text, unescaped.
fn element(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let start = xml.find(&open)? + open.len();
    let len = xml[start..].find(&format!("</{tag}>"))?;
    Some(xml_unescape(xml[start..start + len].trim()))
}

fn same_path(a: &str, b: &str) -> bool {
    let norm = |s: &str| s.trim().trim_matches('"').replace('/', "\\").trim_end_matches('\\').to_lowercase();
    norm(a) == norm(b)
}

/// Judge a registered task's XML (as `schtasks /Query /XML` prints it).
pub fn judge(xml: &str, exe: &Path, server_dir: &Path) -> Registered {
    let command = element(xml, "Command").unwrap_or_default();
    if !same_path(&command, &exe.display().to_string()) {
        return Registered::Differs(format!("it starts {command}, not this launcher ({})", exe.display()));
    }
    let args = element(xml, "Arguments").unwrap_or_default();
    let wanted = boot_arguments(server_dir);
    let args_ok = args.eq_ignore_ascii_case(&wanted)
        || args.split_once(char::is_whitespace).is_some_and(|(flag, dir)| {
            flag.eq_ignore_ascii_case(BOOT_ARG) && same_path(dir, &server_dir.display().to_string())
        });
    if !args_ok {
        return Registered::Differs(format!("its arguments are `{args}`, not `{wanted}`"));
    }
    match element(xml, "LogonType").as_deref() {
        Some("S4U") => {}
        Some(other) => return Registered::Differs(format!("its logon type is {other}, not S4U (run with nobody logged on, no password stored)")),
        None => return Registered::Differs("it has no logon type: it only runs while someone is logged on".to_string()),
    }
    if !xml.contains("<BootTrigger") {
        return Registered::Differs("it has no at-startup trigger".to_string());
    }
    if xml.contains("<Enabled>false</Enabled>") {
        return Registered::Differs("it, or its trigger, is disabled".to_string());
    }
    Registered::Yes
}

/// schtasks prints UTF-16 when it writes XML to a pipe on some builds and
/// the console code page on others.
fn decode(bytes: &[u8]) -> String {
    let utf16 = bytes.starts_with(&[0xFF, 0xFE]) || (bytes.len() >= 4 && bytes[1] == 0 && bytes[3] == 0);
    if utf16 {
        let units: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        String::from_utf16_lossy(&units).trim_start_matches('\u{feff}').to_string()
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

const SCHTASKS_LIMIT: Duration = Duration::from_secs(60);

fn schtasks(args: &[&str], what: &str) -> Result<(bool, String, String)> {
    let mut cmd = std::process::Command::new("schtasks.exe");
    cmd.args(args).stdin(std::process::Stdio::null());
    let out = crate::subprocess::run_bounded(cmd, what, SCHTASKS_LIMIT)?;
    Ok((out.status.success(), decode(&out.stdout), decode(&out.stderr)))
}

/// The registered task's XML, or `None` when there is none.
pub fn query() -> Result<Option<String>> {
    if !cfg!(windows) {
        return Ok(None);
    }
    let (ok, out, err) = schtasks(&["/Query", "/TN", TASK_NAME, "/XML"], "schtasks /Query")?;
    if ok {
        return Ok(Some(out));
    }
    let lower = err.to_lowercase();
    if lower.contains("denied") {
        return Err(anyhow!("Task Scheduler refused to show the task: {}", err.trim()));
    }
    Ok(None)
}

pub fn status(exe: &Path, server_dir: &Path) -> Result<Registered> {
    Ok(match query()? {
        None => Registered::No,
        Some(xml) => judge(&xml, exe, server_dir),
    })
}

/// Register (or replace) the task for `exe` and `server_dir`, as this account.
pub fn register(exe: &Path, server_dir: &Path) -> Result<()> {
    if !cfg!(windows) {
        return Err(anyhow!("start at boot is a Windows Task Scheduler task: not available here"));
    }
    let user = current_user().ok_or_else(|| anyhow!("USERNAME is not set: cannot name the task's account"))?;
    let xml = task_xml(exe, server_dir, &user, current_user_sid().as_deref());
    let path = std::env::temp_dir().join(format!("icraft-boot-task-{}.xml", std::process::id()));
    // Task Scheduler reads the file as the encoding it declares: UTF-16 LE, BOM.
    let mut bytes = vec![0xFF, 0xFE];
    bytes.extend(xml.encode_utf16().flat_map(|u| u.to_le_bytes()));
    std::fs::write(&path, bytes).map_err(|e| anyhow!("writing {}: {e}", path.display()))?;
    let file = path.display().to_string();
    let result = schtasks(&["/Create", "/TN", TASK_NAME, "/XML", &file, "/F"], "schtasks /Create");
    let _ = std::fs::remove_file(&path);
    let (ok, out, err) = result?;
    if !ok {
        let why = if err.trim().is_empty() { out } else { err };
        return Err(anyhow!("Task Scheduler refused the task: {}", why.trim()));
    }
    // What was registered is what we meant to register.
    match status(exe, server_dir)? {
        Registered::Yes => Ok(()),
        Registered::No => Err(anyhow!("schtasks reported success, but no task '{TASK_NAME}' is there")),
        Registered::Differs(why) => Err(anyhow!("the registered task is not the one asked for: {why}")),
    }
}

pub fn unregister() -> Result<()> {
    if query()?.is_none() {
        return Ok(());
    }
    let (ok, out, err) = schtasks(&["/Delete", "/TN", TASK_NAME, "/F"], "schtasks /Delete")?;
    if !ok {
        let why = if err.trim().is_empty() { out } else { err };
        return Err(anyhow!("Task Scheduler refused to delete the task: {}", why.trim()));
    }
    Ok(())
}

/// The same task as one PowerShell line, for an elevated PowerShell at the
/// box when the launcher's own registration was refused.
pub fn powershell_line(exe: &Path, server_dir: &Path) -> String {
    let q = |s: &str| s.replace('\'', "''");
    let dir = server_dir.display().to_string();
    let dir = dir.trim_end_matches(['\\', '/']);
    format!(
        "Register-ScheduledTask -TaskName '{name}' -Force \
         -Action (New-ScheduledTaskAction -Execute '{exe}' -Argument '{args}' -WorkingDirectory '{dir}') \
         -Trigger $(New-ScheduledTaskTrigger -AtStartup | ForEach-Object {{ $_.Delay = '{delay}'; $_ }}) \
         -Principal (New-ScheduledTaskPrincipal -UserId \"$env:USERDOMAIN\\$env:USERNAME\" -LogonType S4U -RunLevel Limited) \
         -Settings (New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -Priority 4 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries \
         -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5))",
        name = q(TASK_NAME),
        exe = q(&exe.display().to_string()),
        args = q(&boot_arguments(server_dir)),
        dir = q(dir),
        delay = BOOT_DELAY,
    )
}

/// The user declined the UAC prompt (Win32 ERROR_CANCELLED).
pub const ERROR_CANCELLED: i32 = 1223;
/// How long the UAC prompt and the elevated helper may take.
const ELEVATED_LIMIT: Duration = Duration::from_secs(5 * 60);

/// The PowerShell that starts `exe` with `args` as administrator and returns
/// its exit code (ERROR_CANCELLED when the prompt was declined).
fn elevation_script(exe: &Path, args: &[String]) -> String {
    let q = |s: &str| s.replace('\'', "''");
    let list: Vec<String> = args.iter().map(|a| format!("\"{}\"", a.replace('"', ""))).collect();
    format!(
        "$ProgressPreference = 'SilentlyContinue'; try {{ $p = Start-Process -FilePath '{}' -ArgumentList '{}' -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop; exit $p.ExitCode }} \
         catch {{ [Console]::Error.WriteLine($_.Exception.Message); exit {ERROR_CANCELLED} }}",
        q(&exe.display().to_string()),
        q(&list.join(" ")),
    )
}

/// Run `exe args` as administrator: Windows shows its approval prompt (UAC)
/// to whoever is at the box, and nothing happens without a yes. Waits for it
/// and returns its exit code. The script goes in encoded (`-EncodedCommand`),
/// so no path needs quoting through two command lines.
pub fn run_elevated(exe: &Path, args: &[String]) -> Result<i32> {
    use base64::Engine;
    let script = elevation_script(exe, args);
    let utf16: Vec<u8> = script.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    let encoded = base64::engine::general_purpose::STANDARD.encode(utf16);
    let mut cmd = std::process::Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-EncodedCommand", &encoded]).stdin(std::process::Stdio::null());
    let out = crate::subprocess::run_bounded(cmd, "Start-Process -Verb RunAs", ELEVATED_LIMIT)?;
    let code = out.status.code().unwrap_or(-1);
    let err = readable_stderr(&String::from_utf8_lossy(&out.stderr));
    if code != 0 && !err.is_empty() {
        log::warn!("[boot-task] the approval step said: {err}");
    }
    Ok(code)
}

/// PowerShell writes its stderr to a pipe as CLIXML (progress records and
/// all): keep the error strings only.
fn readable_stderr(raw: &str) -> String {
    let raw = raw.trim();
    if !raw.starts_with("#< CLIXML") {
        return raw.to_string();
    }
    raw.split("<S S=\"Error\">")
        .skip(1)
        .filter_map(|part| part.split("</S>").next())
        .map(|t| t.replace("_x000D_", "").replace("_x000A_", " ").trim().to_string())
        .filter(|t| !t.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// The Windows session this process runs in: 0 for the boot instance (no
/// desktop), the RDP session's number for a window.
pub fn session_id() -> Option<u32> {
    #[cfg(windows)]
    {
        let mut id: u32 = 0;
        // SAFETY: a plain out-parameter call on our own process id.
        let ok = unsafe { windows_sys::Win32::System::RemoteDesktop::ProcessIdToSessionId(std::process::id(), &mut id) };
        if ok != 0 {
            return Some(id);
        }
        None
    }
    #[cfg(not(windows))]
    {
        None
    }
}

// =============================================================================
// Taking the server over from the boot instance
// =============================================================================
//
// Only the launcher that started the JVM holds its console, so a window that
// wants the server (to type into its console, to stop it, to run a
// regeneration) asks the boot instance to give it up: TAKEOVER_REQUEST_FILE
// ("<unix-secs> <who>"). The boot instance stops the server like a Cycle
// does (a 60 s in-game countdown when players are on), does not restart it,
// lets go of the server folder and exits; the window then starts its own
// Cycle (sync + start). It answers in TAKEOVER_RESULT_FILE.

pub const TAKEOVER_REQUEST_FILE: &str = ".icraft_takeover_request";
pub const TAKEOVER_RESULT_FILE: &str = ".icraft_takeover_request.result";
/// Same limit as a Cycle request (`restart_policy::REQUEST_MAX_AGE`).
pub const TAKEOVER_MAX_AGE: Duration = crate::restart_policy::REQUEST_MAX_AGE;

#[derive(Debug, Clone, Default)]
pub struct TakeoverFacts {
    /// Seconds since the request's timestamp; `None` = it has none.
    pub age_secs: Option<u64>,
    /// A supervised run owns the server (up, starting, or in a backoff).
    pub supervising: bool,
    /// Why a supervised server cannot be stopped for a Cycle right now.
    pub cycle_blocker: Option<String>,
    /// A task holds the launcher (the supervised run, or a start a request made).
    pub busy: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TakeoverVerdict {
    /// Nothing runs (stopped, exited cleanly, or the heartbeat gave up): let go now.
    Now,
    /// The server is up: stop it (warned), then let go.
    AfterStop,
    Refused(String),
}

impl TakeoverVerdict {
    pub fn answer(&self) -> String {
        match self {
            TakeoverVerdict::Now => "accepted: nothing is running; the boot instance lets go of the server folder now".to_string(),
            TakeoverVerdict::AfterStop => {
                "accepted: stopping the server (a 60 s in-game countdown if players are on); the boot instance then lets go".to_string()
            }
            TakeoverVerdict::Refused(why) => why.clone(),
        }
    }
}

pub fn takeover_verdict(f: &TakeoverFacts) -> TakeoverVerdict {
    let Some(age) = f.age_secs else {
        return TakeoverVerdict::Refused("rejected: no timestamp in the request".to_string());
    };
    if age > TAKEOVER_MAX_AGE.as_secs() {
        return TakeoverVerdict::Refused(format!("skipped: stale request ({age}s old)"));
    }
    if !f.supervising {
        if f.busy {
            return TakeoverVerdict::Refused("skipped: the launcher is carrying out another task: ask again when it is done".to_string());
        }
        return TakeoverVerdict::Now;
    }
    match &f.cycle_blocker {
        None => TakeoverVerdict::AfterStop,
        Some(why) => TakeoverVerdict::Refused(format!("skipped: {why}; ask again once the server is up")),
    }
}

/// `"<unix-secs> <who>"`, the same shape as a Cycle request.
pub fn write_takeover_request(server_dir: &Path, who: &str, now_unix: u64) -> std::io::Result<()> {
    let _ = std::fs::remove_file(server_dir.join(TAKEOVER_RESULT_FILE));
    std::fs::write(server_dir.join(TAKEOVER_REQUEST_FILE), format!("{now_unix} {who}\n"))
}

/// The request's age from its body (`None` without a timestamp).
pub fn request_age(body: &str, now_unix: u64) -> Option<u64> {
    body.split_whitespace().next().and_then(|s| s.parse::<u64>().ok()).map(|t| now_unix.saturating_sub(t))
}

#[cfg(test)]
mod tests {
    use super::*;

    const EXE: &str = r"C:\Users\op\Desktop\IridescentCraft Dedicated Server\icraft-gui.exe";
    const DIR: &str = r"C:\Users\op\Desktop\IridescentCraft Dedicated Server";

    #[test]
    fn the_boot_flag_names_the_server_folder() {
        let cwd = || Some(PathBuf::from(r"C:\cwd"));
        assert_eq!(boot_dir_from_args(["--boot", DIR], cwd), Some(PathBuf::from(DIR)));
        assert_eq!(boot_dir_from_args(["--BOOT", DIR], cwd), Some(PathBuf::from(DIR)));
        // The task's working directory is the folder: `--boot` alone works too.
        assert_eq!(boot_dir_from_args(["--boot"], cwd), Some(PathBuf::from(r"C:\cwd")));
        assert_eq!(boot_dir_from_args(["--boot", "--other"], cwd), Some(PathBuf::from(r"C:\cwd")));
        // No flag: the window, whatever else is there (a relaunch used to pass nothing).
        assert_eq!(boot_dir_from_args(Vec::<String>::new(), cwd), None);
        assert_eq!(boot_dir_from_args(["serve"], cwd), None);
    }

    #[test]
    fn the_arguments_quote_the_folder_and_drop_a_trailing_backslash() {
        assert_eq!(boot_arguments(Path::new(DIR)), format!("--boot \"{DIR}\""));
        assert_eq!(boot_arguments(Path::new(r"C:\srv\")), "--boot \"C:\\srv\"");
    }

    #[test]
    fn the_task_runs_this_launcher_at_boot_as_this_account_with_no_password() {
        let xml = task_xml(Path::new(EXE), Path::new(DIR), r"BOX\op", None);
        assert!(xml.contains("<BootTrigger>") && xml.contains("<Delay>PT1M</Delay>"));
        assert!(xml.contains("<UserId>BOX\\op</UserId>"));
        assert!(xml.contains("<LogonType>S4U</LogonType>"));
        assert!(xml.contains("<RunLevel>LeastPrivilege</RunLevel>"));
        assert!(xml.contains("<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>"));
        assert!(xml.contains("<Priority>4</Priority>"));
        assert!(xml.contains("<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>"));
        assert!(!xml.contains("Password"));
        assert!(xml.contains(&format!("<Command>{EXE}</Command>")));
        assert!(xml.contains(&format!("<Arguments>--boot &quot;{DIR}&quot;</Arguments>")));
        assert!(xml.contains(&format!("<WorkingDirectory>{DIR}</WorkingDirectory>")));
        // What we register is what we recognise as ours.
        assert_eq!(judge(&xml, Path::new(EXE), Path::new(DIR)), Registered::Yes);
    }

    #[test]
    fn xml_special_characters_in_a_path_are_escaped_and_read_back() {
        let dir = r"C:\Servers\Tom & Jerry's <test>";
        let exe = format!(r"{dir}\icraft-gui.exe");
        let xml = task_xml(Path::new(&exe), Path::new(dir), r"BOX\op", None);
        assert!(xml.contains("Tom &amp; Jerry&apos;s &lt;test&gt;"));
        assert_eq!(judge(&xml, Path::new(&exe), Path::new(dir)), Registered::Yes);
    }

    #[test]
    fn a_task_that_is_not_ours_for_this_folder_is_named_as_such() {
        let ours = task_xml(Path::new(EXE), Path::new(DIR), r"BOX\op", None);
        let other_exe = judge(&ours, Path::new(r"D:\elsewhere\icraft-gui.exe"), Path::new(DIR));
        assert!(matches!(other_exe, Registered::Differs(why) if why.contains("not this launcher")));
        let other_dir = judge(&ours, Path::new(EXE), Path::new(r"D:\other server"));
        assert!(matches!(other_dir, Registered::Differs(why) if why.contains("arguments")));
        let interactive = ours.replace("<LogonType>S4U</LogonType>", "<LogonType>InteractiveToken</LogonType>");
        assert!(matches!(judge(&interactive, Path::new(EXE), Path::new(DIR)), Registered::Differs(why) if why.contains("InteractiveToken")));
        let no_trigger = ours.replace("<BootTrigger>", "<LogonTrigger>").replace("</BootTrigger>", "</LogonTrigger>");
        assert!(matches!(judge(&no_trigger, Path::new(EXE), Path::new(DIR)), Registered::Differs(why) if why.contains("at-startup")));
        let disabled = ours.replacen("<Enabled>true</Enabled>", "<Enabled>false</Enabled>", 1);
        assert!(matches!(judge(&disabled, Path::new(EXE), Path::new(DIR)), Registered::Differs(why) if why.contains("disabled")));
    }

    #[test]
    fn a_registered_task_is_recognised_however_schtasks_prints_it() {
        // Case, slashes and unescaped quotes differ from what we wrote.
        let printed = task_xml(Path::new(EXE), Path::new(DIR), r"BOX\op", None)
            .replace(&format!("<Command>{EXE}</Command>"), &format!("<Command>{}</Command>", EXE.to_lowercase().replace('\\', "/")))
            .replace(&format!("--boot &quot;{DIR}&quot;"), &format!("--boot \"{DIR}\\\""));
        assert_eq!(judge(&printed, Path::new(EXE), Path::new(DIR)), Registered::Yes);
        // UTF-16 with a BOM, as schtasks writes it to a pipe on some builds.
        let mut bytes = vec![0xFF, 0xFE];
        bytes.extend(printed.encode_utf16().flat_map(|u| u.to_le_bytes()));
        assert_eq!(judge(&decode(&bytes), Path::new(EXE), Path::new(DIR)), Registered::Yes);
        assert_eq!(decode(b"<Task/>"), "<Task/>");
    }

    #[test]
    fn the_account_keeps_full_access_to_its_task() {
        let xml = task_xml(Path::new(EXE), Path::new(DIR), r"BOX\op", Some("S-1-5-21-11-22-33-1001"));
        assert!(xml.contains("<SecurityDescriptor>D:(A;;FA;;;SY)(A;;FA;;;BA)(A;;FA;;;S-1-5-21-11-22-33-1001)</SecurityDescriptor>"));
        let at = xml.find("<SecurityDescriptor>").unwrap();
        assert!(at > xml.find("<RegistrationInfo>").unwrap() && at < xml.find("</RegistrationInfo>").unwrap());
        assert_eq!(judge(&xml, Path::new(EXE), Path::new(DIR)), Registered::Yes);
        assert!(!task_xml(Path::new(EXE), Path::new(DIR), r"BOX\op", None).contains("SecurityDescriptor"));
        assert_eq!(sid_from_whoami("\"box\\op\",\"S-1-5-21-11-22-33-1001\"\r\n").as_deref(), Some("S-1-5-21-11-22-33-1001"));
        assert_eq!(sid_from_whoami("\"box\\op\",\"not a sid\""), None);
        assert_eq!(sid_from_whoami(""), None);
    }

    #[test]
    fn the_registration_helper_is_named_on_its_command_line() {
        assert_eq!(boot_task_from_args(["--boot-task", "register", DIR]), Some(("register".to_string(), PathBuf::from(DIR))));
        assert_eq!(boot_task_from_args(["--boot-task", "REMOVE", DIR]), Some(("remove".to_string(), PathBuf::from(DIR))));
        assert_eq!(boot_task_from_args(["--boot-task", "format", DIR]), None);
        assert_eq!(boot_task_from_args(["--boot-task", "register"]), None);
        assert_eq!(boot_task_from_args(["--boot", DIR]), None);
    }

    #[test]
    fn the_elevated_start_quotes_every_argument_once() {
        let args = vec!["--boot-task".to_string(), "register".to_string(), DIR.to_string()];
        let script = elevation_script(Path::new(EXE), &args);
        assert!(script.contains(&format!("-FilePath '{EXE}'")));
        assert!(script.contains(&format!("-ArgumentList '\"--boot-task\" \"register\" \"{DIR}\"'")));
        assert!(script.contains("-Verb RunAs") && script.contains("-Wait -PassThru"));
        assert!(script.contains("exit 1223"));
        assert!(script.starts_with("$ProgressPreference = 'SilentlyContinue';"));
        // A single quote in a path is doubled for PowerShell.
        assert!(elevation_script(Path::new(r"C:\Jerry's\icraft-gui.exe"), &[]).contains(r"'C:\Jerry''s\icraft-gui.exe'"));
    }

    #[test]
    fn powershell_stderr_is_read_without_its_clixml() {
        assert_eq!(readable_stderr("  plain words  "), "plain words");
        let clixml = "#< CLIXML\r\n<Objs Version=\"1.1.0.1\"><Obj S=\"progress\" RefId=\"0\"><TN RefId=\"0\"></TN></Obj>\
                      <S S=\"Error\">The operation was canceled by the user._x000D__x000A_</S></Objs>";
        assert_eq!(readable_stderr(clixml), "The operation was canceled by the user.");
        assert_eq!(readable_stderr("#< CLIXML\r\n<Objs><Obj S=\"progress\"></Obj></Objs>"), "");
    }

    #[test]
    fn the_powershell_line_registers_the_same_task() {
        let line = powershell_line(Path::new(EXE), Path::new(DIR));
        assert!(line.starts_with("Register-ScheduledTask -TaskName 'IridescentCraft launcher at boot' -Force"));
        assert!(line.contains(&format!("-Execute '{EXE}'")));
        assert!(line.contains(&format!("-Argument '--boot \"{DIR}\"'")));
        assert!(line.contains("-LogonType S4U -RunLevel Limited"));
        assert!(line.contains("-AtStartup") && line.contains("$_.Delay = 'PT1M'"));
        assert!(line.contains("-ExecutionTimeLimit 0 -Priority 4"));
        assert!(!line.contains('\n'));
        // A quote in a path is doubled for PowerShell's single quotes.
        assert!(powershell_line(Path::new(r"C:\Jerry's\icraft-gui.exe"), Path::new(DIR)).contains(r"'C:\Jerry''s\icraft-gui.exe'"));
    }

    #[test]
    fn a_takeover_is_answered_by_what_the_server_is_doing() {
        let fresh = |supervising, blocker: Option<&str>, busy| TakeoverFacts {
            age_secs: Some(5),
            supervising,
            cycle_blocker: blocker.map(str::to_string),
            busy,
        };
        assert_eq!(takeover_verdict(&fresh(true, None, true)), TakeoverVerdict::AfterStop);
        assert_eq!(takeover_verdict(&fresh(false, Some("no supervised server"), false)), TakeoverVerdict::Now);
        let starting = takeover_verdict(&fresh(true, Some("server not up (Starting) -- already booting or restarting"), true));
        assert!(matches!(&starting, TakeoverVerdict::Refused(why) if why.starts_with("skipped: server not up (Starting)") && why.ends_with("once the server is up")));
        assert!(matches!(takeover_verdict(&fresh(false, None, true)), TakeoverVerdict::Refused(why) if why.contains("another task")));
        let stale = TakeoverFacts { age_secs: Some(11 * 60), ..fresh(true, None, true) };
        assert!(matches!(takeover_verdict(&stale), TakeoverVerdict::Refused(why) if why.starts_with("skipped: stale")));
        let unstamped = TakeoverFacts { age_secs: None, ..fresh(true, None, true) };
        assert!(matches!(takeover_verdict(&unstamped), TakeoverVerdict::Refused(why) if why.starts_with("rejected")));
        assert!(TakeoverVerdict::AfterStop.answer().starts_with("accepted"));
        assert!(TakeoverVerdict::Now.answer().starts_with("accepted"));
    }

    #[test]
    fn a_takeover_request_carries_its_time() {
        let dir = std::env::temp_dir().join(format!("icraft-takeover-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(TAKEOVER_RESULT_FILE), "old answer").unwrap();
        write_takeover_request(&dir, "window pid 7", 1_000).unwrap();
        let body = std::fs::read_to_string(dir.join(TAKEOVER_REQUEST_FILE)).unwrap();
        assert_eq!(body, "1000 window pid 7\n");
        // A new request clears the answer to the last one.
        assert!(!dir.join(TAKEOVER_RESULT_FILE).exists());
        assert_eq!(request_age(&body, 1_030), Some(30));
        assert_eq!(request_age("soon", 1_030), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn this_process_has_a_session() {
        assert!(session_id().is_some());
    }
}
