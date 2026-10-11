//! Child processes that cannot wait on a human and cannot outlive a limit.
//!
//! 2026-10-11: a routine restart kept the server down for 39 minutes. The
//! launcher had started `git fetch` the way `Command::status()` does from a
//! GUI-subsystem exe: with nothing set for stdin/stdout/stderr, so Windows gave
//! the child a console of its own. git's automatic `repack` could not delete an
//! old pack file, and Git for Windows asks about that on a console ("Unlink of
//! file ... failed. Should I try again? (y/n)") whenever stdin and stderr are
//! both one. Nobody was at that console, and nothing bounded the wait.
//!
//! Everything the launcher runs through this module therefore gets:
//!   - no console window, and stdin on the null device ([`harden`]);
//!   - stdout and stderr on pipes, so neither is a console either;
//!   - a time limit, after which the child AND the processes it started are
//!     killed ([`run_bounded`]). On Windows the child is put in a job object:
//!     the job is what reaches a grandchild (`git fetch` -> `git maintenance`
//!     -> `git repack`), and closing it takes any straggler along when the
//!     call returns or the launcher exits.

use anyhow::{anyhow, Result};
use std::fs::File;
use std::io::Read;
use std::process::{Child, Command, Output, Stdio};
use std::sync::mpsc::{channel, Receiver};
use std::time::{Duration, Instant};

/// The one limit for a network step the launcher does not strictly need: a git
/// child, or a whole log push. Past it the step is abandoned, loudly.
pub const STEP_LIMIT: Duration = Duration::from_secs(5 * 60);

/// Kept per stream; the rest of a chatty child's output is read and dropped so
/// it never blocks on a full pipe.
const OUTPUT_CAP: u64 = 256 * 1024;
const POLL: Duration = Duration::from_millis(100);

/// Environment variables a GitHub token can arrive in. They are for the
/// launcher and for git only: see [`scrub_token_env`].
pub const TOKEN_ENV_VARS: &[&str] = &["ICRAFT_GH_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"];

/// No console window, and nothing to read: stdin is the null device.
pub fn harden(cmd: &mut Command) -> &mut Command {
    cmd.stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Keep a GitHub token that is set in the launcher's own environment out of a
/// child that has no use for it (the JVM runs ~450 mods and every server
/// script; any of them can read its environment).
pub fn scrub_token_env(cmd: &mut Command) -> &mut Command {
    for name in TOKEN_ENV_VARS {
        cmd.env_remove(name);
    }
    cmd
}

/// The error [`run_bounded`] returns when the limit was reached.
#[derive(Debug)]
pub struct TimedOut {
    pub what: String,
    pub limit: Duration,
}

impl std::fmt::Display for TimedOut {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} timed out after {}s (killed with its child processes)", self.what, self.limit.as_secs())
    }
}

impl std::error::Error for TimedOut {}

/// Run `cmd` hardened (see [`harden`]) with stdout and stderr captured, for at
/// most `limit`. `Ok` carries the exit status whatever it is; `Err` means the
/// child could not be started, or was killed at the limit ([`TimedOut`]).
/// `what` names the step in log lines and errors: never put a secret in it.
pub fn run_bounded(cmd: Command, what: &str, limit: Duration) -> Result<Output> {
    run_inner(cmd, None, what, limit)
}

/// [`run_bounded`], with stdout written to `stdout` instead of captured.
pub fn run_bounded_to_file(cmd: Command, stdout: File, what: &str, limit: Duration) -> Result<Output> {
    run_inner(cmd, Some(stdout), what, limit)
}

fn run_inner(mut cmd: Command, stdout: Option<File>, what: &str, limit: Duration) -> Result<Output> {
    harden(&mut cmd);
    match stdout {
        Some(file) => cmd.stdout(Stdio::from(file)),
        None => cmd.stdout(Stdio::piped()),
    };
    cmd.stderr(Stdio::piped());

    let job = Job::new();
    let mut child = cmd.spawn().map_err(|e| anyhow!("starting {what}: {e}"))?;
    if let Some(job) = &job {
        job.assign(&child);
    }
    let out = drain(child.stdout.take());
    let err = drain(child.stderr.take());

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() < limit => std::thread::sleep(POLL),
            Ok(None) => {
                log::error!(
                    "[subprocess] {what} did not finish within {}s -- killing it and every process it started",
                    limit.as_secs()
                );
                kill_tree(&mut child, job.as_ref());
                let _ = child.wait();
                return Err(anyhow::Error::new(TimedOut { what: what.to_string(), limit }));
            }
            Err(e) => {
                kill_tree(&mut child, job.as_ref());
                return Err(anyhow!("waiting for {what}: {e}"));
            }
        }
    };
    // The pipes close when the last process holding them exits. The child has;
    // if something it started lingers, do not wait for it (dropping the job
    // below ends it).
    let grace = Duration::from_secs(5);
    Ok(Output {
        status,
        stdout: out.recv_timeout(grace).unwrap_or_default(),
        stderr: err.recv_timeout(grace).unwrap_or_default(),
    })
}

/// Read a pipe to its end on a thread of its own, keeping the first
/// [`OUTPUT_CAP`] bytes.
fn drain<R: Read + Send + 'static>(pipe: Option<R>) -> Receiver<Vec<u8>> {
    let (tx, rx) = channel();
    std::thread::spawn(move || {
        let mut kept = Vec::new();
        if let Some(mut pipe) = pipe {
            let _ = pipe.by_ref().take(OUTPUT_CAP).read_to_end(&mut kept);
            let _ = std::io::copy(&mut pipe, &mut std::io::sink());
        }
        let _ = tx.send(kept);
    });
    rx
}

/// Kill `child` and what it started. `taskkill /T` first, while the parent
/// links are intact: it also reaches a process created in the instant before
/// the child was put in the job.
fn kill_tree(child: &mut Child, job: Option<&Job>) {
    #[cfg(windows)]
    {
        let mut taskkill = Command::new("taskkill");
        taskkill.args(["/F", "/T", "/PID", &child.id().to_string()]);
        harden(&mut taskkill).stdout(Stdio::null()).stderr(Stdio::null());
        if let Ok(mut killer) = taskkill.spawn() {
            let asked = Instant::now();
            while matches!(killer.try_wait(), Ok(None)) {
                if asked.elapsed() >= Duration::from_secs(10) {
                    let _ = killer.kill();
                    break;
                }
                std::thread::sleep(POLL);
            }
        }
    }
    if let Some(job) = job {
        job.terminate();
    }
    let _ = child.kill();
}

// =============================================================================
// Job object (Windows): one handle that owns a child's whole process tree
// =============================================================================

#[cfg(windows)]
mod job {
    use std::ffi::c_void;
    use std::os::windows::io::AsRawHandle;

    type Handle = isize;

    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION: i32 = 9;
    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x0000_2000;

    // Laid out as JOBOBJECT_EXTENDED_LIMIT_INFORMATION; only one field is ever set.
    #[repr(C)]
    #[allow(dead_code)]
    struct BasicLimits {
        per_process_user_time_limit: i64,
        per_job_user_time_limit: i64,
        limit_flags: u32,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: u32,
        affinity: usize,
        priority_class: u32,
        scheduling_class: u32,
    }

    #[repr(C)]
    #[allow(dead_code)]
    pub(super) struct ExtendedLimits {
        basic: BasicLimits,
        io_counters: [u64; 6],
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_used: usize,
        peak_job_memory_used: usize,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateJobObjectW(attributes: *const c_void, name: *const u16) -> Handle;
        fn SetInformationJobObject(job: Handle, class: i32, info: *const c_void, length: u32) -> i32;
        fn AssignProcessToJobObject(job: Handle, process: Handle) -> i32;
        fn TerminateJobObject(job: Handle, exit_code: u32) -> i32;
        fn CloseHandle(handle: Handle) -> i32;
    }

    /// Closing the handle (drop) kills whatever is still in the job.
    pub struct Job(Handle);

    impl Job {
        pub fn new() -> Option<Job> {
            // SAFETY: plain Win32 calls on a handle this function owns; the
            // limits struct is zero-initialised, which is its "no limits" value.
            unsafe {
                let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if handle == 0 {
                    return None;
                }
                let mut limits: ExtendedLimits = std::mem::zeroed();
                limits.basic.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let set = SetInformationJobObject(
                    handle,
                    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
                    &limits as *const ExtendedLimits as *const c_void,
                    std::mem::size_of::<ExtendedLimits>() as u32,
                );
                if set == 0 {
                    CloseHandle(handle);
                    return None;
                }
                Some(Job(handle))
            }
        }

        pub fn assign(&self, child: &std::process::Child) -> bool {
            // SAFETY: both handles are open for the duration of the call.
            unsafe { AssignProcessToJobObject(self.0, child.as_raw_handle() as Handle) != 0 }
        }

        pub fn terminate(&self) {
            // SAFETY: the job handle is open until drop.
            unsafe {
                TerminateJobObject(self.0, 1);
            }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            // SAFETY: the handle was returned by CreateJobObjectW and is closed once.
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}

#[cfg(windows)]
use job::Job;

/// Elsewhere only the child itself is killed at the limit.
#[cfg(not(windows))]
struct Job;

#[cfg(not(windows))]
#[allow(dead_code)]
impl Job {
    fn new() -> Option<Job> {
        None
    }
    fn assign(&self, _child: &Child) -> bool {
        false
    }
    fn terminate(&self) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    fn powershell(script: &str) -> Command {
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-Command", script]);
        cmd
    }

    #[cfg(windows)]
    fn process_exists(pid: u32) -> bool {
        let mut cmd = Command::new("tasklist");
        cmd.args(["/FI", &format!("PID eq {pid}"), "/NH", "/FO", "CSV"]);
        let out = run_bounded(cmd, "tasklist", Duration::from_secs(60)).expect("tasklist runs");
        String::from_utf8_lossy(&out.stdout).contains(&format!("\"{pid}\""))
    }

    /// What Git for Windows tests before it asks "Should I try again? (y/n)":
    /// stdin and stderr must both be consoles. Here none of the three is, and a
    /// read of stdin ends at once.
    #[test]
    #[cfg(windows)]
    fn a_child_has_no_console_to_ask_on() {
        let script = "[Console]::IsInputRedirected; [Console]::IsOutputRedirected; \
                      [Console]::IsErrorRedirected; [Console]::In.ReadToEnd().Length";
        let out = run_bounded(powershell(script), "console probe", Duration::from_secs(120)).unwrap();
        let text = String::from_utf8_lossy(&out.stdout);
        let lines: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
        assert_eq!(lines, ["True", "True", "True", "0"], "stderr: {}", String::from_utf8_lossy(&out.stderr));
        assert!(out.status.success());
    }

    /// The child (powershell) starts a grandchild (ping) and waits on it, the
    /// shape of `git fetch` waiting on `git repack`. At the limit both must be
    /// gone, and the caller must have its answer.
    #[test]
    #[cfg(windows)]
    fn a_child_past_its_limit_is_killed_with_the_processes_it_started() {
        let dir = std::env::temp_dir().join(format!("icraft-proc-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let pid_file = dir.join("grandchild.pid");
        let script = format!(
            "$p = Start-Process ping -ArgumentList '-n','300','127.0.0.1' -PassThru -NoNewWindow; \
             Set-Content -LiteralPath '{}' -Value $p.Id; Wait-Process -Id $p.Id",
            pid_file.display()
        );
        let limit = Duration::from_secs(20);
        let started = Instant::now();
        let err = run_bounded(powershell(&script), "sleeper", limit).unwrap_err();
        let timed_out = err.downcast_ref::<TimedOut>().expect("a TimedOut error");
        assert_eq!(timed_out.limit, limit);
        assert!(err.to_string().contains("sleeper timed out after 20s"), "{err}");
        assert!(started.elapsed() < limit + Duration::from_secs(30), "took {:?}", started.elapsed());

        let pid: u32 = std::fs::read_to_string(&pid_file)
            .expect("the child got as far as starting its own child")
            .trim()
            .parse()
            .unwrap();
        std::thread::sleep(Duration::from_secs(1));
        assert!(!process_exists(pid), "grandchild {pid} survived the kill");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    #[cfg(windows)]
    fn output_and_exit_status_come_back() {
        let out = run_bounded(powershell("'to stdout'; [Console]::Error.WriteLine('to stderr'); exit 3"), "echo", Duration::from_secs(120)).unwrap();
        assert_eq!(out.status.code(), Some(3));
        assert!(String::from_utf8_lossy(&out.stdout).contains("to stdout"));
        assert!(String::from_utf8_lossy(&out.stderr).contains("to stderr"));
    }

    #[test]
    #[cfg(windows)]
    fn the_job_limits_struct_has_the_size_windows_expects() {
        #[cfg(target_pointer_width = "64")]
        assert_eq!(std::mem::size_of::<job::ExtendedLimits>(), 144);
        #[cfg(target_pointer_width = "32")]
        assert_eq!(std::mem::size_of::<job::ExtendedLimits>(), 112);
        assert!(Job::new().is_some());
    }

    #[test]
    #[cfg(unix)]
    fn a_child_past_its_limit_is_killed() {
        let mut cmd = Command::new("sleep");
        cmd.arg("60");
        let started = Instant::now();
        let err = run_bounded(cmd, "sleeper", Duration::from_secs(1)).unwrap_err();
        assert!(err.downcast_ref::<TimedOut>().is_some());
        assert!(started.elapsed() < Duration::from_secs(20));
    }

    #[test]
    fn a_token_in_the_launcher_environment_is_not_passed_on() {
        let mut cmd = Command::new("java");
        scrub_token_env(&mut cmd);
        for name in TOKEN_ENV_VARS {
            let removed = cmd.get_envs().any(|(key, value)| key == std::ffi::OsStr::new(name) && value.is_none());
            assert!(removed, "{name} is not removed from the child's environment");
        }
    }
}
