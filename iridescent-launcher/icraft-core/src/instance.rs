//! One launcher per server folder.
//!
//! Since 2026-10-20 two launchers can exist on the box at once: the boot
//! instance that the "Start at boot" task starts when Windows starts (no
//! window, nobody logged on; see `autostart.rs`), and a window the operator
//! opens after an RDP logon. Two supervisors on one server folder would each
//! run the request watchers and the restart policy, write the status file in
//! turn, sync files under a running server and start a second JVM on a world
//! the first one has open. So the launcher that runs the server holds
//! [`LOCK_FILE`] in the server folder open for writing, shared for reading
//! only, for as long as it lives:
//!
//!   - Windows refuses a second writer (a sharing violation), so the second
//!     launcher knows at once that it is not the one running the server;
//!   - the file is freed when the process ends, however it ends (a crash, a
//!     kill, a power cut): a lock can never be left behind;
//!   - the file says who holds it (pid, mode, since when), for the launcher
//!     that was refused.
//!
//! A launcher that cannot open the file for another reason (the folder does
//! not exist, no rights) is not stopped by it: the caller logs that and runs
//! as before. The lock exists to keep two launchers apart, not to stop one.
//!
//! On other systems there is no lock: the server box is Windows.

use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// Next to `server.properties`. Not pack content: no sync writes or deletes it.
pub const LOCK_FILE: &str = ".icraft_launcher.lock";

/// The two kinds of launcher process (the `launcher_mode` of the status file).
pub const MODE_WINDOW: &str = "window";
pub const MODE_BOOT: &str = "boot";

/// Who holds the lock, as written into it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Holder {
    pub pid: u32,
    /// [`MODE_WINDOW`] or [`MODE_BOOT`].
    pub mode: String,
    pub started_unix: u64,
}

impl Holder {
    /// This process, in `mode`.
    pub fn me(mode: &str) -> Holder {
        Holder { pid: std::process::id(), mode: mode.to_string(), started_unix: unix_now() }
    }

    pub fn render(&self) -> String {
        format!(
            "# icraft-gui: the launcher that runs this server holds this file open.\n\
             pid={}\nmode={}\nstarted_unix={}\n",
            self.pid, self.mode, self.started_unix
        )
    }

    /// `None` when the text is not a lock file's (a missing key, a bad number).
    pub fn parse(text: &str) -> Option<Holder> {
        let get = |key: &str| {
            text.lines()
                .filter_map(|l| l.split_once('='))
                .find(|(k, _)| k.trim() == key)
                .map(|(_, v)| v.trim().to_string())
        };
        Some(Holder {
            pid: get("pid")?.parse().ok()?,
            mode: get("mode").filter(|m| !m.is_empty())?,
            started_unix: get("started_unix")?.parse().ok()?,
        })
    }

    pub fn is_boot(&self) -> bool {
        self.mode == MODE_BOOT
    }

    /// "the boot instance (no window), pid 1234, running for 2 h 05 min".
    pub fn describe(&self) -> String {
        let what = if self.is_boot() { "the boot instance (no window)" } else { "a launcher window" };
        let up = unix_now().saturating_sub(self.started_unix);
        format!("{what}, pid {}, running for {}", self.pid, span(up))
    }
}

/// The lock, held for as long as this value lives.
pub struct InstanceLock {
    _file: File,
    pub path: PathBuf,
}

pub enum Acquired {
    /// This process runs the server folder now.
    Ours(InstanceLock),
    /// Another live launcher does (`None` when its file could not be read).
    Theirs(Option<Holder>),
}

/// One attempt. `Err` = the file could not be opened for a reason other than
/// another launcher holding it.
pub fn try_acquire(dir: &Path, me: &Holder) -> std::io::Result<Acquired> {
    let path = dir.join(LOCK_FILE);
    match open_for_holder(&path) {
        Ok(mut file) => {
            file.set_len(0)?;
            file.seek(SeekFrom::Start(0))?;
            file.write_all(me.render().as_bytes())?;
            file.flush()?;
            Ok(Acquired::Ours(InstanceLock { _file: file, path }))
        }
        Err(e) if held_by_another(&e) => Ok(Acquired::Theirs(read_holder(dir))),
        Err(e) => Err(e),
    }
}

/// [`try_acquire`] again every 250 ms until it is ours or `wait` has passed.
/// A launcher that replaced itself (self-update) starts its successor a moment
/// before it exits, so the successor waits for the old process to let go.
pub fn acquire_within(dir: &Path, me: &Holder, wait: Duration) -> std::io::Result<Acquired> {
    let deadline = Instant::now() + wait;
    loop {
        let got = try_acquire(dir, me)?;
        if matches!(got, Acquired::Ours(_)) || Instant::now() >= deadline {
            return Ok(got);
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

/// What the lock file says, read without disturbing the holder.
pub fn read_holder(dir: &Path) -> Option<Holder> {
    let mut text = String::new();
    open_for_reader(&dir.join(LOCK_FILE)).ok()?.read_to_string(&mut text).ok()?;
    Holder::parse(&text)
}

#[cfg(windows)]
fn open_for_holder(path: &Path) -> std::io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    const FILE_SHARE_READ: u32 = 0x1;
    OpenOptions::new().read(true).write(true).create(true).share_mode(FILE_SHARE_READ).open(path)
}

#[cfg(windows)]
fn open_for_reader(path: &Path) -> std::io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    // The holder has the file open for writing: a reader must share writing.
    const SHARE_ALL: u32 = 0x1 | 0x2 | 0x4;
    OpenOptions::new().read(true).share_mode(SHARE_ALL).open(path)
}

#[cfg(windows)]
fn held_by_another(e: &std::io::Error) -> bool {
    const ERROR_SHARING_VIOLATION: i32 = 32;
    e.raw_os_error() == Some(ERROR_SHARING_VIOLATION)
}

#[cfg(not(windows))]
fn open_for_holder(path: &Path) -> std::io::Result<File> {
    OpenOptions::new().read(true).write(true).create(true).open(path)
}

#[cfg(not(windows))]
fn open_for_reader(path: &Path) -> std::io::Result<File> {
    File::open(path)
}

#[cfg(not(windows))]
fn held_by_another(_e: &std::io::Error) -> bool {
    false
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// "45 s", "12 min", "3 h 05 min", "2 d 4 h".
pub fn span(secs: u64) -> String {
    match secs {
        s if s < 60 => format!("{s} s"),
        s if s < 3600 => format!("{} min", s / 60),
        s if s < 86_400 => format!("{} h {:02} min", s / 3600, (s % 3600) / 60),
        s => format!("{} d {} h", s / 86_400, (s % 86_400) / 3600),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("icraft-instance-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_holder_survives_its_own_file_format() {
        let h = Holder { pid: 4242, mode: MODE_BOOT.to_string(), started_unix: 1_792_500_000 };
        assert_eq!(Holder::parse(&h.render()), Some(h.clone()));
        assert!(h.is_boot());
        assert!(h.describe().starts_with("the boot instance (no window), pid 4242, running for "));
    }

    #[test]
    fn a_file_that_is_not_a_lock_file_names_nobody() {
        assert_eq!(Holder::parse(""), None);
        assert_eq!(Holder::parse("pid=12\nmode=boot\n"), None);
        assert_eq!(Holder::parse("pid=twelve\nmode=boot\nstarted_unix=1\n"), None);
        assert_eq!(Holder::parse("pid=12\nmode=\nstarted_unix=1\n"), None);
    }

    #[test]
    fn spans_read_like_the_status_lines() {
        assert_eq!(span(5), "5 s");
        assert_eq!(span(125), "2 min");
        assert_eq!(span(3 * 3600 + 5 * 60), "3 h 05 min");
        assert_eq!(span(2 * 86_400 + 4 * 3600 + 59), "2 d 4 h");
    }

    #[cfg(windows)]
    #[test]
    fn a_second_launcher_is_refused_and_told_who_holds_the_folder() {
        let dir = scratch("refused");
        let boot = Holder { pid: std::process::id(), mode: MODE_BOOT.to_string(), started_unix: 1_792_500_000 };
        let first = match try_acquire(&dir, &boot).unwrap() {
            Acquired::Ours(l) => l,
            Acquired::Theirs(_) => panic!("an empty folder was refused"),
        };
        // A second handle, even from the same process, is refused by Windows.
        match try_acquire(&dir, &Holder::me(MODE_WINDOW)).unwrap() {
            Acquired::Ours(_) => panic!("two launchers held one server folder"),
            Acquired::Theirs(h) => assert_eq!(h, Some(boot.clone())),
        }
        assert_eq!(read_holder(&dir), Some(boot));
        // Let go (the process ending does the same): the next one gets it.
        drop(first);
        match try_acquire(&dir, &Holder::me(MODE_WINDOW)).unwrap() {
            Acquired::Ours(_) => {}
            Acquired::Theirs(_) => panic!("a released lock was still refused"),
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn a_successor_waits_for_the_launcher_it_replaces() {
        let dir = scratch("successor");
        let old = match try_acquire(&dir, &Holder::me(MODE_BOOT)).unwrap() {
            Acquired::Ours(l) => l,
            Acquired::Theirs(_) => panic!("an empty folder was refused"),
        };
        // The old launcher exits a moment after starting its successor.
        let releaser = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(700));
            drop(old);
        });
        let started = Instant::now();
        match acquire_within(&dir, &Holder::me(MODE_BOOT), Duration::from_secs(10)).unwrap() {
            Acquired::Ours(_) => {}
            Acquired::Theirs(_) => panic!("the successor never got the folder"),
        }
        assert!(started.elapsed() >= Duration::from_millis(500));
        releaser.join().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn a_folder_that_does_not_exist_is_an_error_not_a_holder() {
        let dir = scratch("missing").join("not-there");
        assert!(try_acquire(&dir, &Holder::me(MODE_WINDOW)).is_err());
    }
}
