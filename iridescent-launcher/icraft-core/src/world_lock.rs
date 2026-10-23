//! One server per world.
//!
//! 2026-10-22, 23:21 EDT (internal current-state, "TWO JVMs on one world"):
//! the launcher window that ran the box's server was closed while its JVM ran.
//! Windows does not end a child with its parent, so the JVM went on serving
//! with nobody holding its console: no Stop, no restarts, no backups, and no
//! other way in (RCON off, nobody an operator). The next launcher found its
//! folder free, synced three files under that server, logged "a server already
//! has the world open: local config overrides NOT re-applied" and started a
//! second JVM on the same world anyway. That one hung loading mods; both wrote
//! `logs\latest.log`.
//!
//! What keeps it to one:
//!   - [`find`]: does a process other than this launcher have this folder's
//!     world (`<world>\session.lock`) or game log (`logs\latest.log`) open, and
//!     which. A server JVM opens latest.log in its first second and holds
//!     session.lock from the moment its world loads, both for as long as it
//!     runs. The Restart Manager names the processes that have a file open
//!     (pid and start time); the image name says whether one is a JVM. Nothing
//!     else of the process is read: never its command line.
//!   - [`start_guard`]: no JVM while one is found. The reason goes into
//!     `.icraft_start_refused` like the other refusals. Called before a start's
//!     sync (nothing is rewritten under a running server) and again inside the
//!     launch gate right before the spawn, which every start path goes through.
//!   - [`stop_other`]: the way out that needs no RCON. The launcher that
//!     started the JVM gave it a console of its own (`CREATE_NO_WINDOW` makes
//!     a hidden one), and it outlives that launcher. A helper process joins it
//!     and sends Ctrl+C; the JVM takes that for SIGINT and runs its shutdown
//!     hooks, among them the game's own "Server Shutdown Thread", which stops
//!     the server the way `stop` does: every level and every player saved,
//!     then the exit. The helper is a process of its own because the event
//!     reaches every process on that console, the sender included, and because
//!     the sender must ignore it, which a process passes on to the children it
//!     starts later: the launcher's next JVM must not inherit that.
//!   - [`end_other`]: the last resort for a JVM whose own stop hangs; what
//!     changed since its last autosave is lost.
//!   - [`close_verdict`]: what a launcher may do when its window is closed.

use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

use crate::config::ServerConfig;

/// `icraft-gui.exe --stop-server-process <pid>`: the helper of [`stop_other`].
pub const STOP_HELPER_ARG: &str = "--stop-server-process";

/// How long a stop may take before the operator is offered [`end_other`]: the
/// game saves every level first, and a ~450-mod world takes a while.
pub const STOP_GRACE: Duration = Duration::from_secs(5 * 60);

const SESSION_LOCK: &str = "session.lock";
const LATEST_LOG: &str = "latest.log";

/// A process that has the world or the game log open.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OtherProcess {
    pub pid: u32,
    /// The file name of its image (`java.exe`); empty when it could not be read.
    pub image: String,
    /// Its creation time (FILETIME: 100 ns since 1601). With the pid, this
    /// names this process and not a later one that got the same pid.
    pub created: u64,
    /// Which of the two files it has open ([`SESSION_LOCK`], [`LATEST_LOG`]).
    pub holds: Vec<String>,
}

impl OtherProcess {
    pub fn is_jvm(&self) -> bool {
        is_jvm(&self.image)
    }

    /// "java.exe, pid 1844, started 2026-10-22 16:50:12 (6 h 31 min ago)".
    pub fn label(&self) -> String {
        let name = if self.image.is_empty() { "a process whose name could not be read" } else { self.image.as_str() };
        match started_unix(self.created) {
            Some(unix) => {
                let when = chrono::DateTime::from_timestamp(unix as i64, 0)
                    .map(|t| t.with_timezone(&chrono::Local).format("%Y-%m-%d %H:%M:%S").to_string())
                    .unwrap_or_default();
                let ago = crate::instance::span(unix_now().saturating_sub(unix));
                format!("{name}, pid {}, started {when} ({ago} ago)", self.pid)
            }
            None => format!("{name}, pid {}", self.pid),
        }
    }
}

/// What has this server's world or game log open.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Held {
    /// The world's session.lock refused an exclusive open: the world is loaded.
    pub world_open: bool,
    /// The JVMs among the holders; or, when the world is open and no JVM was
    /// named, whatever else holds its session.lock (possibly nothing named).
    pub by: Vec<OtherProcess>,
}

impl Held {
    /// The server to stop: the first JVM named.
    pub fn server(&self) -> Option<&OtherProcess> {
        self.by.iter().find(|p| p.is_jvm())
    }

    /// One line, for the log, the refusal file and the window.
    pub fn describe(&self) -> String {
        if self.by.is_empty() {
            return "the world's session.lock is held open by a process that could not be named (the world is loaded)".to_string();
        }
        self.by
            .iter()
            .map(|p| {
                let files: Vec<&str> = p
                    .holds
                    .iter()
                    .map(|h| if h == SESSION_LOCK { "the world (session.lock)" } else { "the game log (logs\\latest.log)" })
                    .collect();
                format!("{} has {} open", p.label(), files.join(" and "))
            })
            .collect::<Vec<_>>()
            .join("; ")
    }
}

pub fn is_jvm(image: &str) -> bool {
    let image = image.to_ascii_lowercase();
    matches!(image.as_str(), "java.exe" | "javaw.exe" | "java")
}

/// Who has this folder's world or game log open, apart from this launcher
/// process itself (its own JVM counts). `None`: nothing does.
pub fn find(cfg: &ServerConfig) -> Option<Held> {
    find_except(cfg, &[std::process::id()])
}

/// [`find`], leaving this launcher's own JVM out as well: a server this
/// launcher did not start.
pub fn find_foreign(cfg: &ServerConfig) -> Option<Held> {
    let mut own = vec![std::process::id()];
    own.extend(crate::run::active_pid());
    find_except(cfg, &own)
}

fn find_except(cfg: &ServerConfig, own: &[u32]) -> Option<Held> {
    let world = cfg.world_dir();
    let world_open = crate::backup::world_open_elsewhere(&world);
    let lock = world.join(SESSION_LOCK);
    let log = cfg.logs_dir().join(LATEST_LOG);
    let holders = holders(&[(lock.as_path(), SESSION_LOCK), (log.as_path(), LATEST_LOG)]);
    if let Err(why) = &holders {
        log::warn!("[world] who has the world open could not be asked ({why}): the session.lock check stands alone");
    }
    decide(world_open, holders, own)
}

/// The rule, apart from the system calls.
///   - A JVM other than `own` holds either file: held, by it.
///   - The world is open (session.lock refused) and nothing but `own` holds
///     it: it is this launcher's own server. Otherwise held, by whatever holds
///     the lock (maybe nothing could be named).
///   - Anything else (a log reader, a scanner): not a server.
fn decide(world_open: bool, holders: Result<Vec<OtherProcess>, String>, own: &[u32]) -> Option<Held> {
    let named = holders.as_ref().ok();
    let theirs: Vec<OtherProcess> =
        named.map(|all| all.iter().filter(|p| !own.contains(&p.pid)).cloned().collect()).unwrap_or_default();
    let jvms: Vec<OtherProcess> = theirs.iter().filter(|p| p.is_jvm()).cloned().collect();
    if !jvms.is_empty() {
        return Some(Held { world_open, by: jvms });
    }
    if !world_open {
        return None;
    }
    let ours_only = named.is_some_and(|all| {
        let on_lock: Vec<&OtherProcess> = all.iter().filter(|p| p.holds.iter().any(|h| h == SESSION_LOCK)).collect();
        !on_lock.is_empty() && on_lock.iter().all(|p| own.contains(&p.pid))
    });
    if ours_only {
        return None;
    }
    Some(Held { world_open, by: theirs.into_iter().filter(|p| p.holds.iter().any(|h| h == SESSION_LOCK)).collect() })
}

/// Before a JVM is started (before a start's sync, and in the launch gate):
/// `Err` = do not start. The reason is logged in capitals and left in
/// [`crate::overrides::REFUSED_FILE`]; the next start that is allowed removes
/// that file (`overrides::start_guard`).
pub fn start_guard(cfg: &ServerConfig) -> Result<(), String> {
    if let Some(pid) = crate::run::active_pid() {
        return refuse(cfg, format!("this launcher already runs a server JVM (pid {pid}): a second one is never started"));
    }
    let found = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| find(cfg))).unwrap_or_else(|_| {
        log::error!("[world] asking who has the world open panicked: the session.lock check stands alone");
        crate::backup::world_open_elsewhere(&cfg.world_dir()).then(|| Held { world_open: true, by: Vec::new() })
    });
    match found {
        None => Ok(()),
        Some(held) => refuse(
            cfg,
            format!(
                "another server already has this world open: {}. A second server is never started on the same world. \
                 Stop that one first (launcher window, Server tab: \"Stop it cleanly\", which saves the world and then \
                 starts the server here), or end it at the box",
                held.describe()
            ),
        ),
    }
}

fn refuse(cfg: &ServerConfig, why: String) -> Result<(), String> {
    log::error!("[world] !!! THE SERVER IS NOT STARTED: {why}");
    let body = format!(
        "# The launcher refused to start the server. Removed by the next start it allows.\nrefused_unix={}\nrefused={}\nwhy={why}\n",
        unix_now(),
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S %:z")
    );
    if let Err(e) = std::fs::write(cfg.server_dir.join(crate::overrides::REFUSED_FILE), body) {
        log::warn!("[world] {} could not be written: {e}", crate::overrides::REFUSED_FILE);
    }
    Err(why)
}

/// What a launcher may do when its window is closed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseVerdict {
    /// Nothing of this launcher's would be left behind: close.
    Close,
    /// Its JVM runs, or a run that may start one is under way: that server
    /// is stopped first (the window asks), never left running on its own.
    StopFirst,
}

/// `runs_folder`: this window holds the folder's lock (a viewer does not, and
/// runs nothing). `jvm_alive`: a JVM this process started is alive. `busy`: a
/// supervised run or a task is under way (it may be about to start one).
pub fn close_verdict(runs_folder: bool, jvm_alive: bool, busy: bool) -> CloseVerdict {
    if jvm_alive || (runs_folder && busy) {
        CloseVerdict::StopFirst
    } else {
        CloseVerdict::Close
    }
}

/// How [`stop_other`] ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StopOutcome {
    /// It exited this long after Ctrl+C reached it.
    Stopped { secs: u64 },
    /// Still running after the grace: [`end_other`] is what is left.
    StillRunning { secs: u64 },
    /// Nothing was sent, and why.
    NotSent(String),
    /// It had already exited (or its pid is another process's now).
    Gone,
}

/// Stop a server this launcher did not start: Ctrl+C through `helper` (a
/// command that runs [`ctrl_c_helper`] for the pid it is given), then wait up
/// to `grace` for it to exit, calling `progress` about once a second.
pub fn stop_other(
    target: &OtherProcess,
    helper: &dyn Fn(u32) -> Command,
    grace: Duration,
    progress: &dyn Fn(Duration),
) -> StopOutcome {
    if !sys::alive_as(target.pid, target.created) {
        return StopOutcome::Gone;
    }
    if !target.is_jvm() {
        return StopOutcome::NotSent(format!(
            "{} is not a Java process: only a server JVM is stopped this way",
            target.label()
        ));
    }
    let mut cmd = helper(target.pid);
    crate::subprocess::scrub_token_env(&mut cmd);
    match crate::subprocess::run_bounded(cmd, "the stop helper", Duration::from_secs(30)) {
        Ok(out) if out.status.success() => {}
        Ok(out) => {
            let said = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return StopOutcome::NotSent(format!(
                "the stop helper could not send Ctrl+C (exit {}): {}",
                out.status.code().map_or("?".to_string(), |c| c.to_string()),
                if said.is_empty() { "no reason given" } else { said.as_str() }
            ));
        }
        Err(e) => return StopOutcome::NotSent(format!("{e:#}")),
    }
    let asked = Instant::now();
    loop {
        if sys::wait_gone(target.pid, target.created, Duration::from_secs(1)) {
            return StopOutcome::Stopped { secs: asked.elapsed().as_secs() };
        }
        progress(asked.elapsed());
        if asked.elapsed() >= grace {
            return StopOutcome::StillRunning { secs: asked.elapsed().as_secs() };
        }
    }
}

/// End `target` at once (TerminateProcess) and wait for it to be gone. Only
/// the process that was named: a pid that is another process's now is left.
pub fn end_other(target: &OtherProcess) -> Result<(), String> {
    sys::terminate(target.pid, target.created)?;
    if sys::wait_gone(target.pid, target.created, Duration::from_secs(15)) {
        Ok(())
    } else {
        Err(format!("{} was told to end and has not, 15 s later", target.label()))
    }
}

/// The helper's whole job, in the helper process: join the console of `pid`
/// and send Ctrl+C to it. 0 = sent; the reason for anything else is on stderr.
pub fn ctrl_c_helper(pid: u32) -> i32 {
    match sys::ctrl_c(pid) {
        Ok(()) => 0,
        Err((code, why)) => {
            eprintln!("{why}");
            code
        }
    }
}

/// `--stop-server-process <pid>` in a launcher's arguments.
pub fn helper_pid_from_args<I: IntoIterator<Item = std::ffi::OsString>>(args: I) -> Option<u32> {
    let args: Vec<String> = args.into_iter().map(|a| a.to_string_lossy().into_owned()).collect();
    match args.as_slice() {
        [flag, pid, ..] if flag == STOP_HELPER_ARG => pid.trim().parse().ok(),
        _ => None,
    }
}

fn started_unix(created: u64) -> Option<u64> {
    // FILETIME counts 100 ns from 1601-01-01; the Unix epoch is 11,644,473,600 s later.
    const EPOCH_GAP: u64 = 116_444_736_000_000_000;
    (created > EPOCH_GAP).then(|| (created - EPOCH_GAP) / 10_000_000)
}

fn unix_now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Which processes have each of `files` open (those that exist).
fn holders(files: &[(&Path, &str)]) -> Result<Vec<OtherProcess>, String> {
    let mut out: Vec<OtherProcess> = Vec::new();
    for (path, label) in files {
        if !path.exists() {
            continue;
        }
        for (pid, created) in sys::open_by(path)? {
            match out.iter_mut().find(|p| p.pid == pid && p.created == created) {
                Some(p) => p.holds.push(label.to_string()),
                None => out.push(OtherProcess { pid, image: sys::image_name(pid), created, holds: vec![label.to_string()] }),
            }
        }
    }
    Ok(out)
}

#[cfg(windows)]
mod sys {
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;
    use std::time::Duration;
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, HANDLE};
    use windows_sys::Win32::System::Console::{AttachConsole, FreeConsole, GenerateConsoleCtrlEvent, SetConsoleCtrlHandler, CTRL_C_EVENT};
    use windows_sys::Win32::System::RestartManager::{
        RmEndSession, RmGetList, RmRegisterResources, RmStartSession, CCH_RM_SESSION_KEY, RM_PROCESS_INFO,
    };
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, GetProcessTimes, OpenProcess, QueryFullProcessImageNameW, TerminateProcess, WaitForSingleObject,
        PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE, PROCESS_TERMINATE,
    };

    const ERROR_MORE_DATA: u32 = 234;
    const STILL_ACTIVE: u32 = 259;
    const WAIT_OBJECT_0: u32 = 0;

    fn filetime(ft: FILETIME) -> u64 {
        ((ft.dwHighDateTime as u64) << 32) | ft.dwLowDateTime as u64
    }

    /// An open process handle, closed on drop.
    struct Process(HANDLE);

    impl Process {
        fn open(pid: u32, access: u32) -> Option<Process> {
            // SAFETY: plain call; a zero handle is the failure value.
            let h = unsafe { OpenProcess(access, 0, pid) };
            (h != 0).then_some(Process(h))
        }

        fn created(&self) -> Option<u64> {
            let zero = FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 };
            let (mut c, mut e, mut k, mut u) = (zero, zero, zero, zero);
            // SAFETY: the handle is open; the four out-pointers are live FILETIMEs.
            let ok = unsafe { GetProcessTimes(self.0, &mut c, &mut e, &mut k, &mut u) };
            (ok != 0).then(|| filetime(c))
        }
    }

    impl Drop for Process {
        fn drop(&mut self) {
            // SAFETY: the handle was opened by `open` and is closed once.
            unsafe { CloseHandle(self.0) };
        }
    }

    /// The pid is still the process that was named (same creation time).
    fn same(p: &Process, created: u64) -> bool {
        p.created() == Some(created)
    }

    /// (pid, creation time) of every process that has `path` open, from the
    /// Restart Manager (no rights beyond the caller's are needed for the
    /// caller's own processes).
    pub fn open_by(path: &Path) -> Result<Vec<(u32, u64)>, String> {
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        let mut session: u32 = 0;
        let mut key = [0u16; CCH_RM_SESSION_KEY as usize + 1];
        // SAFETY: the out-pointers are live; `key` has room for the session key and its NUL.
        let rc = unsafe { RmStartSession(&mut session, 0, key.as_mut_ptr()) };
        if rc != 0 {
            return Err(format!("the Restart Manager could not be started (error {rc})"));
        }
        let listed = (|| {
            let names = [wide.as_ptr()];
            // SAFETY: one NUL-terminated path that outlives the call; no applications, no services.
            let rc = unsafe { RmRegisterResources(session, 1, names.as_ptr(), 0, std::ptr::null(), 0, std::ptr::null()) };
            if rc != 0 {
                return Err(format!("the Restart Manager refused {} (error {rc})", path.display()));
            }
            // SAFETY: RM_PROCESS_INFO is plain data; all-zero is a valid value.
            let mut infos: Vec<RM_PROCESS_INFO> = vec![unsafe { std::mem::zeroed() }; 8];
            for _ in 0..4 {
                let (mut needed, mut count, mut reasons) = (0u32, infos.len() as u32, 0u32);
                // SAFETY: `infos` has `count` entries; the other out-pointers are live.
                let rc = unsafe { RmGetList(session, &mut needed, &mut count, infos.as_mut_ptr(), &mut reasons) };
                if rc == ERROR_MORE_DATA {
                    infos = vec![unsafe { std::mem::zeroed() }; needed as usize + 4];
                    continue;
                }
                if rc != 0 {
                    return Err(format!("the Restart Manager could not list who has {} open (error {rc})", path.display()));
                }
                return Ok(infos[..count as usize]
                    .iter()
                    .map(|i| (i.Process.dwProcessId, filetime(i.Process.ProcessStartTime)))
                    .collect());
            }
            Err("the list of processes kept growing".to_string())
        })();
        // SAFETY: ends the session started above.
        unsafe { RmEndSession(session) };
        listed
    }

    /// The file name of the process's image, or "" when it cannot be read.
    pub fn image_name(pid: u32) -> String {
        let Some(p) = Process::open(pid, PROCESS_QUERY_LIMITED_INFORMATION) else { return String::new() };
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        // SAFETY: the handle is open; `buf` holds `len` u16s and `len` is updated in place.
        let ok = unsafe { QueryFullProcessImageNameW(p.0, 0, buf.as_mut_ptr(), &mut len) };
        if ok == 0 {
            return String::new();
        }
        let full = String::from_utf16_lossy(&buf[..len as usize]);
        full.rsplit(['\\', '/']).next().unwrap_or_default().to_string()
    }

    /// The pid is the named process and it has not exited.
    pub fn alive_as(pid: u32, created: u64) -> bool {
        let Some(p) = Process::open(pid, PROCESS_QUERY_LIMITED_INFORMATION) else { return false };
        let mut code = 0u32;
        // SAFETY: the handle is open; `code` is a live u32.
        let ok = unsafe { GetExitCodeProcess(p.0, &mut code) };
        same(&p, created) && ok != 0 && code == STILL_ACTIVE
    }

    /// True once the named process has exited (or the pid is not it any more),
    /// waiting up to `wait`.
    pub fn wait_gone(pid: u32, created: u64, wait: Duration) -> bool {
        let Some(p) = Process::open(pid, PROCESS_SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION) else { return true };
        if !same(&p, created) {
            return true;
        }
        // SAFETY: the handle is open and was opened with SYNCHRONIZE.
        unsafe { WaitForSingleObject(p.0, wait.as_millis().min(u32::MAX as u128) as u32) == WAIT_OBJECT_0 }
    }

    pub fn terminate(pid: u32, created: u64) -> Result<(), String> {
        let p = Process::open(pid, PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION)
            .ok_or_else(|| format!("pid {pid} could not be opened to end it: {}", std::io::Error::last_os_error()))?;
        if !same(&p, created) {
            return Err(format!("pid {pid} is another process now: nothing was ended"));
        }
        // SAFETY: the handle is open with PROCESS_TERMINATE.
        if unsafe { TerminateProcess(p.0, 1) } == 0 {
            return Err(format!("pid {pid} could not be ended: {}", std::io::Error::last_os_error()));
        }
        Ok(())
    }

    /// Join the console of `pid` and send it Ctrl+C. Meant for a process of
    /// its own (see the module comment): it leaves its own console first and
    /// ignores the event itself.
    pub fn ctrl_c(pid: u32) -> Result<(), (i32, String)> {
        // SAFETY: console calls with no pointers; FreeConsole failing (no
        // console to leave) is fine.
        unsafe {
            FreeConsole();
            if AttachConsole(pid) == 0 {
                return Err((2, format!("could not join the console of pid {pid}: {}", std::io::Error::last_os_error())));
            }
            SetConsoleCtrlHandler(None, 1);
            let sent = GenerateConsoleCtrlEvent(CTRL_C_EVENT, 0);
            let err = std::io::Error::last_os_error();
            // The event is delivered on a thread of each process on the
            // console; stay attached for a moment so it is on its way.
            std::thread::sleep(Duration::from_millis(500));
            FreeConsole();
            if sent == 0 {
                return Err((3, format!("Ctrl+C could not be sent to the console of pid {pid}: {err}")));
            }
        }
        Ok(())
    }
}

#[cfg(not(windows))]
mod sys {
    use std::path::Path;
    use std::time::Duration;

    // The server box is Windows; elsewhere nobody can be named, and the
    // session.lock check of backup.rs stands alone (it is a no-op there too).
    pub fn open_by(_path: &Path) -> Result<Vec<(u32, u64)>, String> {
        Ok(Vec::new())
    }

    pub fn image_name(_pid: u32) -> String {
        String::new()
    }

    pub fn alive_as(_pid: u32, _created: u64) -> bool {
        false
    }

    pub fn wait_gone(_pid: u32, _created: u64, _wait: Duration) -> bool {
        true
    }

    pub fn terminate(_pid: u32, _created: u64) -> Result<(), String> {
        Err("ending another process is only done on Windows".to_string())
    }

    pub fn ctrl_c(_pid: u32) -> Result<(), (i32, String)> {
        Err((4, "Ctrl+C to another console is only sent on Windows".to_string()))
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::path::PathBuf;

    fn proc(pid: u32, image: &str, holds: &[&str]) -> OtherProcess {
        OtherProcess { pid, image: image.to_string(), created: 1, holds: holds.iter().map(|h| h.to_string()).collect() }
    }

    #[test]
    fn a_jvm_holding_either_file_is_a_server_and_a_reader_is_not() {
        let own = [10];
        // Booting: the game log only, the world not loaded yet.
        let held = decide(false, Ok(vec![proc(1844, "java.exe", &[LATEST_LOG])]), &own).unwrap();
        assert_eq!(held.server().map(|p| p.pid), Some(1844));
        // Up: both files.
        let held = decide(true, Ok(vec![proc(1844, "java.exe", &[SESSION_LOCK, LATEST_LOG])]), &own).unwrap();
        assert!(held.describe().contains("java.exe, pid 1844 has the world (session.lock) and the game log (logs\\latest.log) open"), "{}", held.describe());
        // Something reading the game log is not a server.
        assert_eq!(decide(false, Ok(vec![proc(77, "notepad.exe", &[LATEST_LOG]), proc(4, "System", &[LATEST_LOG])]), &own), None);
        // This launcher reading its own game log is not one either.
        assert_eq!(decide(false, Ok(vec![proc(10, "java.exe", &[LATEST_LOG])]), &own), None);
    }

    #[test]
    fn an_open_world_is_held_unless_only_this_launcher_holds_it() {
        // Our own JVM (in `own`) has it: not another server.
        assert_eq!(decide(true, Ok(vec![proc(50, "java.exe", &[SESSION_LOCK, LATEST_LOG])]), &[10, 50]), None);
        // Nobody could be named: still held (the lock check stands alone).
        let held = decide(true, Err("RM down".to_string()), &[10]).unwrap();
        assert!(held.by.is_empty() && held.server().is_none());
        assert!(held.describe().contains("could not be named"));
        let held = decide(true, Ok(vec![]), &[10]).unwrap();
        assert!(held.by.is_empty());
        // Something else holds the lock: held, by it (not a JVM: no clean stop).
        let held = decide(true, Ok(vec![proc(99, "backup-tool.exe", &[SESSION_LOCK]), proc(4, "System", &[LATEST_LOG])]), &[10]).unwrap();
        assert_eq!(held.by.iter().map(|p| p.pid).collect::<Vec<_>>(), [99]);
        assert!(held.server().is_none());
        // Nothing open, nothing held.
        assert_eq!(decide(false, Ok(vec![]), &[10]), None);
        assert_eq!(decide(false, Err("RM down".to_string()), &[10]), None);
    }

    #[test]
    fn a_closing_window_stops_its_own_server_and_a_viewer_just_closes() {
        use CloseVerdict::*;
        // The window that runs the folder.
        assert_eq!(close_verdict(true, true, true), StopFirst); // its server runs
        assert_eq!(close_verdict(true, false, true), StopFirst); // a Cycle is syncing: a JVM may come next
        assert_eq!(close_verdict(true, false, false), Close); // stopped, nothing running
        // A viewer runs nothing of the server another launcher runs.
        assert_eq!(close_verdict(false, false, false), Close);
        assert_eq!(close_verdict(false, false, true), Close);
        // A JVM of this process is never left behind, whatever the role says.
        assert_eq!(close_verdict(false, true, false), StopFirst);
    }

    #[test]
    fn the_helper_argument_is_read_and_labels_carry_the_start_time() {
        let args = |v: &[&str]| v.iter().map(std::ffi::OsString::from).collect::<Vec<_>>();
        assert_eq!(helper_pid_from_args(args(&[STOP_HELPER_ARG, "1844"])), Some(1844));
        assert_eq!(helper_pid_from_args(args(&[STOP_HELPER_ARG, "x"])), None);
        assert_eq!(helper_pid_from_args(args(&["--boot", "C:\\s"])), None);
        assert_eq!(helper_pid_from_args(args(&[])), None);
        // 2026-10-22 23:50:12 UTC as a FILETIME.
        let created = (1_792_713_012u64 * 10_000_000) + 116_444_736_000_000_000;
        assert_eq!(started_unix(created), Some(1_792_713_012));
        let label = OtherProcess { pid: 1844, image: "java.exe".into(), created, holds: vec![] }.label();
        assert!(label.starts_with("java.exe, pid 1844, started 2026-10-2"), "{label}");
        assert!(label.ends_with(" ago)"), "{label}");
        assert_eq!(OtherProcess { pid: 7, image: String::new(), created: 0, holds: vec![] }.label(), "a process whose name could not be read, pid 7");
    }

    // -------------------------------------------------------------------------
    // A stand-in JVM: this test binary, copied as java.exe, started the way the
    // launcher starts the real one (piped stdin, CREATE_NO_WINDOW).
    // -------------------------------------------------------------------------

    pub(crate) const FAKE_JVM_TEST: &str = "world_lock::tests::fake_jvm";
    #[cfg(windows)]
    const STOP_HELPER_TEST: &str = "world_lock::tests::stop_helper";

    pub(crate) fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("icraft-world-lock-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("world")).unwrap();
        std::fs::create_dir_all(dir.join("logs")).unwrap();
        std::fs::write(dir.join("server.properties"), "level-name=world\n").unwrap();
        dir
    }

    /// This test binary, copied into `dir` under `name` (`java.exe`: the
    /// Restart Manager then names the stand-in as a JVM).
    pub(crate) fn test_exe_as(dir: &Path, name: &str) -> PathBuf {
        let to = dir.join(name);
        std::fs::copy(std::env::current_exe().unwrap(), &to).unwrap();
        to
    }

    /// The command that starts the stand-in. `hold`: which files it opens
    /// ("lock", "log"); `on_ctrl_c`: "save" (writes `fake-saved`, exits 0, as
    /// the game's shutdown hook saves and exits) or "ignore" (a stop that
    /// hangs). It also exits 0 on a `stop` line on stdin, writing `fake-stopped`.
    pub(crate) fn fake_jvm_command(exe: &Path, server: &Path, hold: &str, on_ctrl_c: &str) -> Command {
        let mut cmd = Command::new(exe);
        cmd.args(["--exact", FAKE_JVM_TEST, "--ignored", "--nocapture", "--test-threads=1"])
            .env("ICRAFT_FAKE_JVM_DIR", server)
            .env("ICRAFT_FAKE_JVM_HOLD", hold)
            .env("ICRAFT_FAKE_JVM_CTRL_C", on_ctrl_c);
        cmd
    }

    pub(crate) fn wait_for(path: &Path, limit: Duration) -> bool {
        let start = Instant::now();
        while start.elapsed() < limit {
            if path.exists() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        false
    }

    #[cfg(windows)]
    fn spawn_hidden(mut cmd: Command) -> std::process::Child {
        use std::os::windows::process::CommandExt;
        cmd.stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW, as run.rs starts the JVM
        crate::run::let_children_take_ctrl_c(); // as run.rs does before the spawn
        cmd.spawn().unwrap()
    }

    #[test]
    #[ignore = "the stand-in JVM: started by the tests below, does nothing on its own"]
    fn fake_jvm() {
        let Some(dir) = std::env::var_os("ICRAFT_FAKE_JVM_DIR").map(PathBuf::from) else { return };
        let hold = std::env::var("ICRAFT_FAKE_JVM_HOLD").unwrap_or_default();
        let mut held = Vec::new();
        if hold.contains("lock") {
            held.push(std::fs::OpenOptions::new().create(true).write(true).open(dir.join("world").join(SESSION_LOCK)).unwrap());
        }
        if hold.contains("log") {
            held.push(std::fs::OpenOptions::new().create(true).append(true).open(dir.join("logs").join(LATEST_LOG)).unwrap());
        }
        #[cfg(windows)]
        {
            static DIR: std::sync::OnceLock<(PathBuf, bool)> = std::sync::OnceLock::new();
            let save = std::env::var("ICRAFT_FAKE_JVM_CTRL_C").map_or(true, |v| v != "ignore");
            let _ = DIR.set((dir.clone(), save));
            unsafe extern "system" fn on_ctrl(kind: u32) -> i32 {
                let (dir, save) = DIR.get().unwrap();
                if kind == 0 {
                    if *save {
                        let _ = std::fs::write(dir.join("fake-saved"), "saved on Ctrl+C\n");
                        std::process::exit(0);
                    }
                    let _ = std::fs::write(dir.join("fake-ignored"), "Ctrl+C ignored\n");
                }
                1
            }
            // SAFETY: registers a handler with the right signature.
            unsafe { windows_sys::Win32::System::Console::SetConsoleCtrlHandler(Some(on_ctrl), 1) };
        }
        let stop_dir = dir.clone();
        std::thread::spawn(move || {
            for line in std::io::BufRead::lines(std::io::stdin().lock()).map_while(Result::ok) {
                if line.trim() == "stop" {
                    let _ = std::fs::write(stop_dir.join("fake-stopped"), "saved on stop\n");
                    std::process::exit(0);
                }
            }
        });
        std::fs::write(dir.join("fake-ready"), std::process::id().to_string()).unwrap();
        std::thread::sleep(Duration::from_secs(120));
        drop(held);
        std::process::exit(3);
    }

    #[test]
    #[ignore = "the stop helper's stand-in: started by the tests below"]
    fn stop_helper() {
        let Ok(pid) = std::env::var("ICRAFT_STOP_HELPER_PID") else { return };
        std::process::exit(ctrl_c_helper(pid.parse().unwrap()));
    }

    #[cfg(windows)]
    pub(crate) fn helper_command(pid: u32) -> Command {
        let mut cmd = Command::new(std::env::current_exe().unwrap());
        cmd.args(["--exact", STOP_HELPER_TEST, "--ignored", "--nocapture", "--test-threads=1"]).env("ICRAFT_STOP_HELPER_PID", pid.to_string());
        cmd
    }

    #[cfg(windows)]
    #[test]
    fn a_world_held_by_another_jvm_refuses_the_start_and_names_it() {
        let dir = scratch("held");
        let cfg = ServerConfig::from_path(&dir);
        assert_eq!(find(&cfg), None);
        assert_eq!(start_guard(&cfg), Ok(()));
        let java = test_exe_as(&dir, "java.exe");
        let mut child = spawn_hidden(fake_jvm_command(&java, &dir, "lock+log", "save"));
        assert!(wait_for(&dir.join("fake-ready"), Duration::from_secs(30)), "the stand-in did not start");

        let held = find(&cfg).expect("the stand-in holds the world");
        assert!(held.world_open);
        let server = held.server().expect("named as a JVM").clone();
        assert_eq!(server.pid, child.id());
        assert_eq!(server.image, "java.exe");
        assert_eq!(server.holds, [SESSION_LOCK, LATEST_LOG]);
        assert_eq!(find_foreign(&cfg).and_then(|h| h.server().map(|p| p.pid)), Some(child.id()));

        let why = start_guard(&cfg).unwrap_err();
        assert!(why.starts_with("another server already has this world open: java.exe, pid "), "{why}");
        let marker = std::fs::read_to_string(dir.join(crate::overrides::REFUSED_FILE)).unwrap();
        assert!(marker.contains(&format!("why={why}\n")), "{marker}");
        // A start through serve() is refused before its sync touches anything.
        let refused = crate::serve(&cfg, crate::ServeOptions::default()).unwrap_err();
        assert!(format!("{refused:#}").contains("another server already has this world open"), "{refused:#}");

        let _ = child.kill();
        let _ = child.wait();
        assert_eq!(find(&cfg), None);
        assert_eq!(start_guard(&cfg), Ok(()));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn a_booting_jvm_is_found_by_its_game_log_and_a_log_reader_is_not() {
        let dir = scratch("booting");
        let cfg = ServerConfig::from_path(&dir);
        // A process that is not a JVM reading the game log: not a server.
        let reader = test_exe_as(&dir, "reader.exe");
        let mut child = spawn_hidden(fake_jvm_command(&reader, &dir, "log", "save"));
        assert!(wait_for(&dir.join("fake-ready"), Duration::from_secs(30)));
        assert_eq!(find(&cfg), None);
        // Named, it is still never sent Ctrl+C: only a JVM is.
        let log = dir.join("logs").join(LATEST_LOG);
        let named = holders(&[(log.as_path(), LATEST_LOG)]).unwrap();
        let reader_proc = named.iter().find(|p| p.pid == child.id()).expect("the reader is named").clone();
        assert_eq!(reader_proc.image, "reader.exe");
        let outcome = stop_other(&reader_proc, &helper_command, Duration::from_secs(1), &|_| {});
        assert!(matches!(&outcome, StopOutcome::NotSent(why) if why.contains("not a Java process")), "{outcome:?}");
        let _ = child.kill();
        let _ = child.wait();
        let _ = std::fs::remove_file(dir.join("fake-ready"));
        // A JVM with the game log open and no world yet (it is loading mods).
        let java = test_exe_as(&dir, "java.exe");
        let mut child = spawn_hidden(fake_jvm_command(&java, &dir, "log", "save"));
        assert!(wait_for(&dir.join("fake-ready"), Duration::from_secs(30)));
        let held = find(&cfg).expect("a booting JVM");
        assert!(!held.world_open);
        assert_eq!(held.server().map(|p| (p.pid, p.holds.clone())), Some((child.id(), vec![LATEST_LOG.to_string()])));
        assert!(start_guard(&cfg).is_err());
        let _ = child.kill();
        let _ = child.wait();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn ctrl_c_stops_a_server_nobody_holds_the_console_of_and_it_saves() {
        let dir = scratch("stop");
        let cfg = ServerConfig::from_path(&dir);
        let java = test_exe_as(&dir, "java.exe");
        // Its launcher is gone: nothing holds the child handle's console side
        // but the stand-in's own hidden console.
        let child = spawn_hidden(fake_jvm_command(&java, &dir, "lock+log", "save"));
        let pid = child.id();
        drop(child);
        assert!(wait_for(&dir.join("fake-ready"), Duration::from_secs(30)));
        let target = find_foreign(&cfg).and_then(|h| h.server().cloned()).expect("found");
        assert_eq!(target.pid, pid);
        let ticks = std::sync::atomic::AtomicU32::new(0);
        let outcome = stop_other(&target, &helper_command, Duration::from_secs(30), &|_| {
            ticks.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        });
        assert!(matches!(outcome, StopOutcome::Stopped { secs } if secs < 30), "{outcome:?}");
        assert!(dir.join("fake-saved").exists(), "the stand-in's Ctrl+C handler (its 'shutdown hook') did not run");
        assert_eq!(find(&cfg), None);
        assert_eq!(stop_other(&target, &helper_command, Duration::from_secs(1), &|_| {}), StopOutcome::Gone);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn a_server_whose_stop_hangs_is_reported_and_only_that_process_is_ended() {
        let dir = scratch("hang");
        let cfg = ServerConfig::from_path(&dir);
        let java = test_exe_as(&dir, "java.exe");
        let mut child = spawn_hidden(fake_jvm_command(&java, &dir, "lock+log", "ignore"));
        assert!(wait_for(&dir.join("fake-ready"), Duration::from_secs(30)));
        let target = find_foreign(&cfg).and_then(|h| h.server().cloned()).expect("found");
        let outcome = stop_other(&target, &helper_command, Duration::from_secs(3), &|_| {});
        assert!(matches!(outcome, StopOutcome::StillRunning { .. }), "{outcome:?}");
        assert!(wait_for(&dir.join("fake-ignored"), Duration::from_secs(5)), "Ctrl+C did not reach it");
        // A record with another start time is another process: left alone.
        let impostor = OtherProcess { created: target.created + 1, ..target.clone() };
        assert!(end_other(&impostor).unwrap_err().contains("another process now"));
        assert!(sys::alive_as(target.pid, target.created));
        assert_eq!(end_other(&target), Ok(()));
        assert!(child.wait().is_ok());
        assert_eq!(find(&cfg), None);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
