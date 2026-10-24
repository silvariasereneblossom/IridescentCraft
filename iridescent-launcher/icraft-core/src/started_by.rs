//! What started a Cycle, a Stop, a Serve or a restart: one line in
//! logs\launcher.log when it starts, and the last of each in the status file.
//!
//! 2026-10-23: three Cycles on the box (box 08:46:43 and 08:46:45, 11:25:57,
//! 15:09:21) were logged only as "[cycle] step 1: stop server (escalates after
//! 30s) ...", the Server tab's own line: no policy ACTION, no request file. One
//! was the operator's; the others could not be placed, because nothing said
//! more than "the Cycle button, in the window in session 2". Since then every
//! way in logs one line,
//!
//!   [started-by] <Cycle|Stop|Serve>: <what started it>
//!
//! and the status file carries the last of each (`last_cycle_by=`,
//! `last_stop_by=`, `last_serve_by=`, each `<unix seconds> <the same text>`),
//! which verify-server.ps1 prints. What started it ([`Source`]) is one of:
//!   - a control of the window: which one, mouse or keyboard (a click, or
//!     Enter / Space on the focused control: the launcher has no shortcut
//!     keys), what Windows says about the input (below), and this process's
//!     Windows session: its id, console or RDP, its connect state (WTS);
//!   - the uptime restart policy (with the rule that fired), a request file
//!     (its reason, and the control when a launcher window wrote it), the
//!     heartbeat (why), the boot instance, the resume after a launcher
//!     self-update (with what started the Cycle it resumes), a takeover, the
//!     command line, the game itself (its JVM exited 0 with no stop from the
//!     launcher), the launcher's own exit.
//! No player names and no command lines: a request's reason is the caller's
//! own text, cut to one short line.
//!
//! Injected input. While a window's thread handles an input message, Windows
//! says where it came from (`GetCurrentInputMessageSource`, Windows 8 and
//! later): IMO_HARDWARE (a device, or a program with UI Access, which must be
//! signed and installed under Program Files), IMO_INJECTED (SendInput from a
//! program without UI Access), IMO_SYSTEM (Windows itself). egui decides a
//! click a frame later, out of winit's events, where that can no longer be
//! read, so [`watch_window`] puts a window procedure in front of winit's that
//! reads it for every left-button and Enter / Space message
//! and keeps the last of each; the click's handler takes the one that belongs
//! to it (at most [`PRESS_MATCH`] old). What this cannot tell:
//!   - who sits at an RDP client. RDP input is made on the client's machine; a
//!     person and a program driving the client window there arrive the same.
//!     Only input made on THIS machine can read as injected;
//!   - how RDP input reads at all: no RDP session could be measured when this
//!     was written (the dev PC can only be an RDP client). The first press in
//!     the box's RDP session says;
//!   - input posted as window messages: PostMessage reaches no egui button
//!     (tried on the rig, 2026-10-23), and is not an input message.

use std::sync::Mutex;
use std::time::Duration;

/// What was started.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    /// Stop (when one runs), self-update + sync, start.
    Cycle,
    /// Stop, Kill and Force kill: the server is not started again.
    Stop,
    /// A start without a stop first: Serve (full), Run only, the CLI's serve.
    Serve,
}

impl Action {
    pub const ALL: [Action; 3] = [Action::Cycle, Action::Stop, Action::Serve];

    pub fn word(self) -> &'static str {
        match self {
            Action::Cycle => "Cycle",
            Action::Stop => "Stop",
            Action::Serve => "Serve",
        }
    }

    /// Its key in the status file.
    pub fn status_key(self) -> &'static str {
        match self {
            Action::Cycle => "last_cycle_by",
            Action::Stop => "last_stop_by",
            Action::Serve => "last_serve_by",
        }
    }
}

/// How a control was pressed, as egui saw it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Device {
    /// A click with the primary button.
    Mouse,
    /// Enter or Space on the focused control.
    Keyboard,
    Unknown,
}

/// Where Windows says the input message came from.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Origin {
    /// IMO_HARDWARE: a device, or a program with UI Access. How an RDP
    /// client's input reads was not measured (see the module comment).
    Hardware,
    /// IMO_INJECTED: SendInput from a program on this machine.
    Injected,
    /// IMO_SYSTEM: Windows injected it.
    System,
    /// IMO_UNAVAILABLE: Windows did not say.
    Unavailable,
    /// GetCurrentInputMessageSource failed.
    Failed,
    /// No input message was seen for this press (none recorded within
    /// [`PRESS_MATCH`], or the window is not watched).
    NotSeen,
    /// Not Windows: nothing to read.
    NotRead,
}

impl Origin {
    /// From GetCurrentInputMessageSource's answer (`None`: the call failed).
    pub fn from_origin_id(id: Option<i32>) -> Origin {
        match id {
            None => Origin::Failed,
            Some(1) => Origin::Hardware,
            Some(2) => Origin::Injected,
            Some(4) => Origin::System,
            Some(_) => Origin::Unavailable,
        }
    }

    pub fn describe(self) -> &'static str {
        match self {
            Origin::Hardware => "hardware input (a device, or a program with UI Access)",
            Origin::Injected => "INJECTED input (SendInput by a program on this machine)",
            Origin::System => "input injected by Windows itself",
            Origin::Unavailable => "input of a source Windows does not name",
            Origin::Failed => "input source unreadable (GetCurrentInputMessageSource failed)",
            Origin::NotSeen => "no Windows input message seen for this press",
            Origin::NotRead => "input source not read (not Windows)",
        }
    }

    /// Packed into the low byte of a record slot (see `win`).
    fn code(self) -> u8 {
        match self {
            Origin::Hardware => 1,
            Origin::Injected => 2,
            Origin::System => 4,
            Origin::Unavailable => 8,
            Origin::Failed => 16,
            Origin::NotSeen => 32,
            Origin::NotRead => 64,
        }
    }

    fn from_code(code: u8) -> Origin {
        match code {
            1 => Origin::Hardware,
            2 => Origin::Injected,
            4 => Origin::System,
            8 => Origin::Unavailable,
            16 => Origin::Failed,
            64 => Origin::NotRead,
            _ => Origin::NotSeen,
        }
    }
}

/// A Windows session's kind, from WTSClientProtocolType.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SessionKind {
    Console,
    Rdp,
    /// Protocol 1, kept by Windows "for legacy purposes".
    OtherRemote,
    Unknown,
}

impl SessionKind {
    pub fn from_protocol(protocol: Option<u16>) -> SessionKind {
        match protocol {
            Some(0) => SessionKind::Console,
            Some(2) => SessionKind::Rdp,
            Some(1) => SessionKind::OtherRemote,
            _ => SessionKind::Unknown,
        }
    }
}

/// This process's Windows session.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Session {
    pub id: Option<u32>,
    pub kind: SessionKind,
    /// WTSConnectState (WTS_CONNECTSTATE_CLASS).
    pub state: Option<i32>,
}

impl Session {
    pub fn describe(&self) -> String {
        let Some(id) = self.id else {
            return "Windows session unknown".to_string();
        };
        if id == 0 {
            return "Windows session 0 (services: no desktop anyone sees)".to_string();
        }
        let kind = match self.kind {
            SessionKind::Console => "console",
            SessionKind::Rdp => "RDP",
            SessionKind::OtherRemote => "remote, not RDP",
            SessionKind::Unknown => "console or RDP not known",
        };
        let state = match self.state {
            Some(0) => ", active",
            Some(1) => ", connected",
            Some(2) => ", connecting",
            Some(3) => ", shadowing",
            Some(4) => ", DISCONNECTED",
            Some(5) => ", idle",
            Some(6) => ", listening",
            Some(7) => ", resetting",
            Some(8) => ", down",
            Some(9) => ", initializing",
            _ => "",
        };
        format!("Windows session {id} ({kind}{state})")
    }
}

/// This process's Windows session, read now.
pub fn this_session() -> Session {
    #[cfg(windows)]
    {
        Session {
            id: crate::autostart::session_id(),
            kind: SessionKind::from_protocol(win::query_session::<u16>(win::WTS_CLIENT_PROTOCOL_TYPE)),
            state: win::query_session::<i32>(win::WTS_CONNECT_STATE),
        }
    }
    #[cfg(not(windows))]
    {
        Session { id: None, kind: SessionKind::Unknown, state: None }
    }
}

/// How a control of the window was pressed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Press {
    pub device: Device,
    /// For a click, the button's release.
    pub origin: Origin,
    /// A click whose press read otherwise than its release: the press's.
    pub press_origin: Option<Origin>,
    pub session: Session,
}

impl Press {
    /// The press egui just reported: Windows' reading of its input message
    /// (taken: a later press cannot reuse it) and the session.
    pub fn now(device: Device) -> Press {
        let (origin, press_origin) = take_origin(device);
        Press { device, origin, press_origin, session: this_session() }
    }

    pub fn describe(&self) -> String {
        let device = match self.device {
            Device::Mouse => "mouse click",
            Device::Keyboard => "keyboard (Enter or Space on the focused control)",
            Device::Unknown => "pressed (mouse or keyboard not known)",
        };
        let press = match self.press_origin {
            Some(o) => format!(" (its button press: {})", o.describe()),
            None => String::new(),
        };
        format!("{device}; {}{press}; {}", self.origin.describe(), self.session.describe())
    }
}

/// What started it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Source {
    /// A control of this launcher's window (or an extension's tab).
    Control { control: String, press: Press },
    /// The uptime restart policy; `rule` says which rule and the readings.
    RestartPolicy { rule: String },
    /// `.icraft_cycle_request`: its reason, and who wrote it when the writer
    /// said (a launcher window's control). `after_gave_up`: the start a request
    /// makes once the heartbeat has given up.
    RequestFile { reason: String, by: Option<String>, after_gave_up: bool },
    /// The heartbeat: an auto-Cycle, or its forced stop of a hung server.
    Heartbeat { why: String },
    /// The boot instance, at Windows start (the Start-at-boot task).
    BootInstance,
    /// A launcher that replaced itself mid-Cycle; `first` is what started that
    /// Cycle ("" when the previous launcher did not record it).
    SelfUpdateResume { first: String },
    /// This window took the server over from the boot instance; `asked` is the
    /// press of its "Take over here".
    Takeover { asked: String },
    /// The boot instance stopping the server for a window's takeover request
    /// (`.icraft_takeover_request`, what it says).
    TakeoverRequest { body: String },
    /// `icraft serve` on the command line.
    Cli,
    /// The JVM exited 0 with no stop from this launcher.
    Game,
    /// This launcher exiting for a successor while its server still ran.
    LauncherExit { what: String },
}

/// How old a recorded input message may be and still belong to the press egui
/// reports (it reports it on the frame after the message, milliseconds later).
pub const PRESS_MATCH: Duration = Duration::from_secs(2);
/// A request's reason, a writer's description: at most this many characters.
const TEXT_MAX: usize = 240;
/// A whole `[started-by]` line's text (a resume quotes the Cycle it resumes).
const LINE_MAX: usize = 700;
/// Separates a request's reason from its writer in `.icraft_cycle_request`.
pub const REQUEST_BY: &str = " | by=";

impl Source {
    pub fn describe(&self) -> String {
        match self {
            Source::Control { control, press } => format!("{control} -- {}", press.describe()),
            Source::RestartPolicy { rule } => format!("the restart policy: {rule}"),
            Source::RequestFile { reason, by, after_gave_up } => {
                let by = match by {
                    Some(by) => format!("written by {by}"),
                    None => "the writer not named (request_cycle.ps1, or a file put there over the share)".to_string(),
                };
                let gave_up = if *after_gave_up { "; the start after the heartbeat gave up" } else { "" };
                format!("a request file (.icraft_cycle_request), reason '{reason}', {by}{gave_up}")
            }
            Source::Heartbeat { why } => format!("the heartbeat: {why}"),
            Source::BootInstance => "the boot instance: the Start-at-boot task, at Windows start".to_string(),
            Source::SelfUpdateResume { first } if first.is_empty() => {
                "the resume after a launcher self-update (what started that Cycle was not recorded: an older launcher)".to_string()
            }
            Source::SelfUpdateResume { first } => {
                format!("the resume after a launcher self-update, of a Cycle started by {first}")
            }
            Source::Takeover { asked } => format!("a takeover from the boot instance, asked for by {asked}"),
            Source::TakeoverRequest { body } => format!("a takeover request (.icraft_takeover_request): '{body}'"),
            Source::Cli => "the command line (icraft serve)".to_string(),
            Source::Game => {
                "the game itself: the JVM exited 0 with no stop from this launcher (an in-game /stop, or `stop` sent to it some other way)"
                    .to_string()
            }
            Source::LauncherExit { what } => format!("this launcher's exit for its successor ({what}) while its server still ran"),
        }
    }

    /// A request file's body (`<unix seconds> <reason>[ | by=<writer>]`).
    pub fn request(body: &str, after_gave_up: bool) -> Source {
        let (reason, by) = parse_request(body);
        Source::RequestFile { reason, by, after_gave_up }
    }

    /// The restart policy's rule that fired, with the readings.
    pub fn policy(
        decision: crate::restart_policy::Decision,
        policy: &crate::restart_policy::Policy,
        uptime: Duration,
        empty_for: Duration,
        players: &str,
    ) -> Source {
        use crate::restart_policy::{fmt_span, Decision};
        let rule = match decision {
            Decision::RestartBusy => format!(
                "the ceiling with players on (up {} of {}, players {players}), after a {} in-game countdown",
                fmt_span(uptime),
                fmt_span(policy.busy_after),
                fmt_span(policy.busy_warn_lead),
            ),
            _ => format!(
                "an empty server past its uptime (up {} of {}, empty for {} of {}), no warnings",
                fmt_span(uptime),
                fmt_span(policy.empty_after),
                fmt_span(empty_for),
                fmt_span(policy.empty_debounce),
            ),
        };
        Source::RestartPolicy { rule }
    }
}

/// `<unix seconds> <reason>[ | by=<writer>]` -> (reason, writer).
pub fn parse_request(body: &str) -> (String, Option<String>) {
    let body = body.trim();
    // The stamp is the first word (request_verdict reads it); the rest is the reason.
    let rest = match body.split_once(char::is_whitespace) {
        Some((stamp, rest)) if stamp.parse::<u64>().is_ok() => rest.trim(),
        None if body.parse::<u64>().is_ok() => "",
        _ => body,
    };
    // The writer: after the first `|` that `by=` follows (spaces allowed).
    let by_at = rest.match_indices('|').find(|(i, _)| rest[i + 1..].trim_start().starts_with("by="));
    let (reason, by) = match by_at {
        Some((i, _)) => (&rest[..i], Some(clean(&rest[i + 1..].trim_start()[3..]))),
        None => (rest, None),
    };
    let reason = clean(reason);
    let reason = if reason.is_empty() { "(none given)".to_string() } else { reason };
    (reason, by.filter(|b| !b.is_empty()))
}

/// The body a launcher window writes into `.icraft_cycle_request`.
pub fn request_body(unix: u64, reason: &str, by: &str) -> String {
    format!("{unix} {}{REQUEST_BY}{}\n", clean(reason), clean(by))
}

/// One line, no control characters, at most TEXT_MAX characters.
pub fn clean(text: &str) -> String {
    clean_to(text, TEXT_MAX)
}

/// The same, up to a whole line's length (LINE_MAX).
pub fn clean_line(text: &str) -> String {
    clean_to(text, LINE_MAX)
}

fn clean_to(text: &str, max: usize) -> String {
    let one: String = text.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    let one = one.split_whitespace().collect::<Vec<_>>().join(" ");
    if one.chars().count() > max {
        let cut: String = one.chars().take(max).collect();
        format!("{cut}...")
    } else {
        one
    }
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// The last of each action: (unix seconds, what started it).
static LAST: Mutex<[Option<(u64, String)>; 3]> = Mutex::new([None, None, None]);

fn slot(action: Action) -> usize {
    match action {
        Action::Cycle => 0,
        Action::Stop => 1,
        Action::Serve => 2,
    }
}

/// THE line: what started `action`. Also kept for the status file.
pub fn record(action: Action, source: &Source) {
    let text = clean_line(&source.describe());
    log::info!("[started-by] {}: {text}", action.word());
    LAST.lock().unwrap()[slot(action)] = Some((unix_now(), text));
}

/// The last `action` this launcher (or the one before it, see [`restore`])
/// recorded.
pub fn last(action: Action) -> Option<(u64, String)> {
    LAST.lock().unwrap()[slot(action)].clone()
}

/// The status file's lines: `last_cycle_by=<unix> <text>` and the other two
/// (empty when none was recorded).
pub fn status_lines() -> String {
    Action::ALL
        .iter()
        .map(|a| match last(*a) {
            Some((at, text)) => format!("{}={at} {text}\n", a.status_key()),
            None => format!("{}=\n", a.status_key()),
        })
        .collect()
}

/// Take over what the previous launcher on this folder recorded (its status
/// file), for the actions this one has not recorded yet: a self-update or a
/// restart of the launcher does not blank who started the last Cycle.
pub fn restore(status_file: &str) {
    let mut last = LAST.lock().unwrap();
    for action in Action::ALL {
        if last[slot(action)].is_some() {
            continue;
        }
        let prefix = format!("{}=", action.status_key());
        let found = status_file.lines().find_map(|l| l.trim().strip_prefix(prefix.as_str()).map(str::to_string));
        let Some(value) = found else { continue };
        let Some((at, text)) = value.split_once(' ') else { continue };
        let Ok(at) = at.parse::<u64>() else { continue };
        if !text.trim().is_empty() {
            last[slot(action)] = Some((at, clean_line(text)));
        }
    }
}

// =============================================================================
// The window's input messages (see "Injected input" in the module comment)
// =============================================================================

/// Put the watch in front of the window procedure of `hwnd`, the launcher's
/// window (eframe gives its handle), once per process. From the window's own
/// thread; every frame is fine: true once it watches that window.
///
/// Not "the visible window of this thread": on the first frames eframe's
/// window is still hidden while winit's own thread-event window (zero size,
/// WS_VISIBLE) is not, and a watch on it sees no input at all (found on the
/// dev PC's sandbox launcher, 2026-10-23).
pub fn watch_window(hwnd: isize) -> bool {
    #[cfg(windows)]
    {
        win::watch(hwnd)
    }
    #[cfg(not(windows))]
    {
        let _ = hwnd;
        false
    }
}

/// Windows' reading of the input message of the press egui just reported:
/// (its origin, the button press's when it differs from the release's).
fn take_origin(device: Device) -> (Origin, Option<Origin>) {
    #[cfg(windows)]
    {
        let max = PRESS_MATCH.as_millis() as u64;
        match device {
            Device::Mouse => {
                let up = win::take(&win::LAST_UP, max);
                let down = win::take(&win::LAST_DOWN, max);
                match (up, down) {
                    (Some(up), Some(down)) if up != down => (up, Some(down)),
                    (Some(up), _) => (up, None),
                    (None, _) => (Origin::NotSeen, None),
                }
            }
            Device::Keyboard => (win::take(&win::LAST_KEY, max).unwrap_or(Origin::NotSeen), None),
            Device::Unknown => (Origin::NotSeen, None),
        }
    }
    #[cfg(not(windows))]
    {
        let _ = device;
        (Origin::NotRead, None)
    }
}

#[cfg(windows)]
mod win {
    use super::Origin;
    use std::sync::atomic::{AtomicIsize, AtomicU64, Ordering};
    use std::sync::OnceLock;
    use std::time::Instant;
    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::RemoteDesktop as rd;
    use windows_sys::Win32::UI::Input::{GetCurrentInputMessageSource, INPUT_MESSAGE_SOURCE};
    use windows_sys::Win32::UI::WindowsAndMessaging as wm;

    pub const WTS_CLIENT_PROTOCOL_TYPE: rd::WTS_INFO_CLASS = rd::WTSClientProtocolType;
    pub const WTS_CONNECT_STATE: rd::WTS_INFO_CLASS = rd::WTSConnectState;

    /// One value of this process's session (`T`: what Windows returns for it).
    pub fn query_session<T: Copy>(class: rd::WTS_INFO_CLASS) -> Option<T> {
        let mut buf: windows_sys::core::PWSTR = std::ptr::null_mut();
        let mut bytes: u32 = 0;
        // SAFETY: out-parameters of our own; the buffer is freed with WTSFreeMemory.
        let ok = unsafe { rd::WTSQuerySessionInformationW(rd::WTS_CURRENT_SERVER_HANDLE, rd::WTS_CURRENT_SESSION, class, &mut buf, &mut bytes) };
        if ok == 0 || buf.is_null() {
            return None;
        }
        let value = (bytes as usize >= std::mem::size_of::<T>())
            // SAFETY: Windows wrote at least size_of::<T>() bytes there.
            .then(|| unsafe { std::ptr::read_unaligned(buf as *const T) });
        unsafe { rd::WTSFreeMemory(buf as *mut std::ffi::c_void) };
        value
    }

    /// The watched window and the procedure it had.
    static WATCHED: AtomicIsize = AtomicIsize::new(0);
    static PREV: AtomicIsize = AtomicIsize::new(0);
    /// The last left-button press and release, and Enter / Space key-down:
    /// (milliseconds since START + 1) << 8 | Origin::code; 0 = none, or taken.
    pub static LAST_DOWN: AtomicU64 = AtomicU64::new(0);
    pub static LAST_UP: AtomicU64 = AtomicU64::new(0);
    pub static LAST_KEY: AtomicU64 = AtomicU64::new(0);
    static START: OnceLock<Instant> = OnceLock::new();

    const VK_RETURN: usize = 0x0D;
    const VK_SPACE: usize = 0x20;

    fn now_ms() -> u64 {
        START.get_or_init(Instant::now).elapsed().as_millis() as u64
    }

    /// The slot's origin if it holds one at most `max_ms` old; empties it.
    pub fn take(slot: &AtomicU64, max_ms: u64) -> Option<Origin> {
        let v = slot.swap(0, Ordering::AcqRel);
        if v == 0 {
            return None;
        }
        let at = (v >> 8).saturating_sub(1);
        (now_ms().saturating_sub(at) <= max_ms).then(|| Origin::from_code((v & 0xFF) as u8))
    }

    fn note(slot: &AtomicU64) {
        let mut src = INPUT_MESSAGE_SOURCE { deviceType: 0, originId: 0 };
        // SAFETY: an out-parameter; called while this thread handles the message.
        let ok = unsafe { GetCurrentInputMessageSource(&mut src) } != 0;
        let origin = Origin::from_origin_id(ok.then_some(src.originId));
        slot.store(((now_ms() + 1) << 8) | origin.code() as u64, Ordering::Release);
    }

    unsafe extern "system" fn watch_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        match msg {
            wm::WM_LBUTTONDOWN => note(&LAST_DOWN),
            wm::WM_LBUTTONUP => note(&LAST_UP),
            wm::WM_KEYDOWN if wparam == VK_RETURN || wparam == VK_SPACE => note(&LAST_KEY),
            _ => {}
        }
        // SAFETY: PREV holds the procedure GetWindowLongPtrW returned for this
        // window, set before this one was put in front of it.
        let prev: wm::WNDPROC = std::mem::transmute(PREV.load(Ordering::Acquire));
        wm::CallWindowProcW(prev, hwnd, msg, wparam, lparam)
    }

    /// Put the watch in front of `hwnd`'s procedure (see `super::watch_window`).
    pub fn watch(hwnd: HWND) -> bool {
        START.get_or_init(Instant::now);
        match WATCHED.compare_exchange(0, hwnd, Ordering::AcqRel, Ordering::Acquire) {
            Ok(_) => {}
            // This window is watched already; another one never is.
            Err(watched) => return watched == hwnd,
        }
        // SAFETY: plain window-long calls on a window of this thread. PREV is
        // set first: no message of this thread's windows is handled between.
        unsafe {
            let prev = wm::GetWindowLongPtrW(hwnd, wm::GWLP_WNDPROC);
            if prev == 0 {
                WATCHED.store(0, Ordering::Release);
                return false;
            }
            PREV.store(prev, Ordering::Release);
            let ours: unsafe extern "system" fn(HWND, u32, WPARAM, LPARAM) -> LRESULT = watch_proc;
            if wm::SetWindowLongPtrW(hwnd, wm::GWLP_WNDPROC, ours as usize as isize) != prev {
                // Not what was read a moment ago: put it back as it was.
                wm::SetWindowLongPtrW(hwnd, wm::GWLP_WNDPROC, prev);
                WATCHED.store(0, Ordering::Release);
                return false;
            }
        }
        log::info!("[started-by] watching the window's input messages (mouse button, Enter, Space) for where Windows says they came from");
        true
    }

    /// The window's own procedure back (tests).
    #[cfg(test)]
    pub fn unwatch() {
        let hwnd = WATCHED.swap(0, Ordering::AcqRel);
        if hwnd != 0 {
            unsafe { wm::SetWindowLongPtrW(hwnd, wm::GWLP_WNDPROC, PREV.load(Ordering::Acquire)) };
        }
    }

    #[cfg(test)]
    pub fn watched() -> HWND {
        WATCHED.load(Ordering::Acquire)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// record/last/status_lines/restore share LAST.
    static SERIAL: Mutex<()> = Mutex::new(());

    fn press(device: Device, origin: Origin, session: Session) -> Press {
        Press { device, origin, press_origin: None, session }
    }

    fn rdp(id: u32) -> Session {
        Session { id: Some(id), kind: SessionKind::Rdp, state: Some(0) }
    }

    #[test]
    fn a_control_says_which_control_how_it_was_pressed_and_where() {
        let s = Source::Control {
            control: "Server tab: Cycle button".to_string(),
            press: press(Device::Mouse, Origin::Hardware, rdp(2)),
        };
        let d = s.describe();
        assert!(d.starts_with("Server tab: Cycle button -- mouse click; hardware input"), "{d}");
        assert!(d.ends_with("Windows session 2 (RDP, active)"), "{d}");

        let k = press(Device::Keyboard, Origin::Injected, Session { id: Some(1), kind: SessionKind::Console, state: Some(4) });
        let d = k.describe();
        assert!(d.contains("keyboard (Enter or Space"), "{d}");
        assert!(d.contains("INJECTED input (SendInput"), "{d}");
        assert!(d.ends_with("Windows session 1 (console, DISCONNECTED)"), "{d}");

        let mixed = Press { press_origin: Some(Origin::Injected), ..press(Device::Mouse, Origin::Hardware, rdp(2)) };
        assert!(mixed.describe().contains("(its button press: INJECTED input"), "{}", mixed.describe());
        let unknown = press(Device::Unknown, Origin::NotSeen, Session { id: None, kind: SessionKind::Unknown, state: None });
        assert_eq!(unknown.describe(), "pressed (mouse or keyboard not known); no Windows input message seen for this press; Windows session unknown");
    }

    #[test]
    fn sessions_read_as_console_rdp_or_services() {
        assert_eq!(SessionKind::from_protocol(Some(0)), SessionKind::Console);
        assert_eq!(SessionKind::from_protocol(Some(2)), SessionKind::Rdp);
        assert_eq!(SessionKind::from_protocol(Some(1)), SessionKind::OtherRemote);
        assert_eq!(SessionKind::from_protocol(None), SessionKind::Unknown);
        let services = Session { id: Some(0), kind: SessionKind::Console, state: Some(0) };
        assert_eq!(services.describe(), "Windows session 0 (services: no desktop anyone sees)");
        let console = Session { id: Some(1), kind: SessionKind::Console, state: Some(0) };
        assert_eq!(console.describe(), "Windows session 1 (console, active)");
        assert_eq!(Session { state: Some(77), ..rdp(3) }.describe(), "Windows session 3 (RDP)");
    }

    #[test]
    fn windows_input_origins_map_to_what_the_line_says() {
        assert_eq!(Origin::from_origin_id(Some(1)), Origin::Hardware);
        assert_eq!(Origin::from_origin_id(Some(2)), Origin::Injected);
        assert_eq!(Origin::from_origin_id(Some(4)), Origin::System);
        assert_eq!(Origin::from_origin_id(Some(0)), Origin::Unavailable);
        assert_eq!(Origin::from_origin_id(None), Origin::Failed);
        for o in [
            Origin::Hardware,
            Origin::Injected,
            Origin::System,
            Origin::Unavailable,
            Origin::Failed,
            Origin::NotSeen,
            Origin::NotRead,
        ] {
            assert_eq!(Origin::from_code(o.code()), o);
        }
        // Only injected input says so in capitals.
        assert!(Origin::Injected.describe().contains("INJECTED"));
        assert!(!Origin::Hardware.describe().to_lowercase().contains("inject"));
    }

    #[test]
    fn every_source_but_a_control_names_itself() {
        let cases = [
            (Source::RestartPolicy { rule: "x".into() }, "the restart policy: x"),
            (Source::Heartbeat { why: "auto-Cycle #1/3 after exit code 1".into() }, "the heartbeat: auto-Cycle #1/3 after exit code 1"),
            (Source::BootInstance, "the boot instance: the Start-at-boot task, at Windows start"),
            (Source::SelfUpdateResume { first: String::new() }, "the resume after a launcher self-update (what started that Cycle was not recorded: an older launcher)"),
            (Source::SelfUpdateResume { first: "the restart policy: y".into() }, "the resume after a launcher self-update, of a Cycle started by the restart policy: y"),
            (Source::Takeover { asked: "viewer: Take over here -- mouse click".into() }, "a takeover from the boot instance, asked for by viewer: Take over here -- mouse click"),
            (Source::TakeoverRequest { body: "1792800000 window pid 42".into() }, "a takeover request (.icraft_takeover_request): '1792800000 window pid 42'"),
            (Source::Cli, "the command line (icraft serve)"),
            (Source::LauncherExit { what: "sync".into() }, "this launcher's exit for its successor (sync) while its server still ran"),
        ];
        for (s, want) in cases {
            assert_eq!(s.describe(), want);
        }
        assert!(Source::Game.describe().starts_with("the game itself: the JVM exited 0 with no stop from this launcher"));
    }

    #[test]
    fn a_request_says_its_reason_and_its_writer_when_it_names_one() {
        let s = Source::request("1792800000 deploy", false);
        assert_eq!(s, Source::RequestFile { reason: "deploy".into(), by: None, after_gave_up: false });
        assert_eq!(
            s.describe(),
            "a request file (.icraft_cycle_request), reason 'deploy', the writer not named (request_cycle.ps1, or a file put there over the share)"
        );
        let body = request_body(1792800000, "internal launcher update", "AI tab: Cycle now -- mouse click; hardware input; Windows session 2 (RDP, active)");
        assert_eq!(body, "1792800000 internal launcher update | by=AI tab: Cycle now -- mouse click; hardware input; Windows session 2 (RDP, active)\n");
        let s = Source::request(&body, true);
        let d = s.describe();
        assert!(d.starts_with("a request file (.icraft_cycle_request), reason 'internal launcher update', written by AI tab: Cycle now -- mouse click"), "{d}");
        assert!(d.ends_with("; the start after the heartbeat gave up"), "{d}");
        // No stamp, no reason, junk around it.
        assert_eq!(parse_request("1792800000"), ("(none given)".to_string(), None));
        assert_eq!(parse_request("  hello there "), ("hello there".to_string(), None));
        assert_eq!(parse_request("1792800000 x |by=  "), ("x".to_string(), None));
        assert_eq!(parse_request("1792800000 a\tb\r\nc | by=v\x07w"), ("a b c".to_string(), Some("v w".to_string())));
    }

    #[test]
    fn long_text_is_cut_to_one_short_line() {
        let long = "y".repeat(1000);
        let c = clean(&long);
        assert_eq!(c.chars().count(), TEXT_MAX + 3);
        assert!(c.ends_with("..."));
        assert_eq!(clean("a\nb\rc\u{0}d"), "a b c d");
    }

    #[test]
    fn the_policy_names_the_rule_that_fired_with_its_readings() {
        use crate::restart_policy::{Decision, Policy};
        let p = Policy::default();
        let empty = Source::policy(Decision::RestartEmpty, &p, Duration::from_secs(4 * 3600), Duration::from_secs(300), "0");
        assert_eq!(
            empty.describe(),
            format!(
                "the restart policy: an empty server past its uptime (up 4h00m of {}, empty for 5m of {}), no warnings",
                crate::restart_policy::fmt_span(p.empty_after),
                crate::restart_policy::fmt_span(p.empty_debounce)
            )
        );
        let busy = Source::policy(Decision::RestartBusy, &p, Duration::from_secs(12 * 3600), Duration::ZERO, "3");
        let d = busy.describe();
        assert!(d.starts_with("the restart policy: the ceiling with players on (up 12h00m of"), "{d}");
        assert!(d.contains("players 3"), "{d}");
        assert!(d.ends_with("in-game countdown"), "{d}");
    }

    #[test]
    fn the_status_file_carries_the_last_of_each_and_a_new_launcher_takes_them_over() {
        let _g = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        *LAST.lock().unwrap() = [None, None, None];
        assert_eq!(status_lines(), "last_cycle_by=\nlast_stop_by=\nlast_serve_by=\n");
        record(Action::Cycle, &Source::BootInstance);
        record(Action::Stop, &Source::Game);
        let lines = status_lines();
        let (at, text) = last(Action::Cycle).unwrap();
        assert!(at > 1_700_000_000);
        assert_eq!(text, "the boot instance: the Start-at-boot task, at Windows start");
        assert!(lines.starts_with(&format!("last_cycle_by={at} the boot instance")), "{lines}");
        assert!(lines.contains("last_stop_by="), "{lines}");
        assert!(lines.ends_with("last_serve_by=\n"), "{lines}");

        // The next launcher reads the old status file: it takes over what it
        // has not recorded itself, and nothing it has.
        let old = format!("# icraft-gui status\nwritten_unix=1\n{lines}");
        *LAST.lock().unwrap() = [None, None, None];
        record(Action::Stop, &Source::Cli);
        restore(&old);
        assert_eq!(last(Action::Cycle), Some((at, text)));
        assert_eq!(last(Action::Stop).unwrap().1, "the command line (icraft serve)");
        assert_eq!(last(Action::Serve), None);
        // An older launcher's file (no keys) and junk change nothing.
        *LAST.lock().unwrap() = [None, None, None];
        restore("written_unix=1\nlast_cycle_by=\nlast_stop_by=notanumber x\nlast_serve_by=12\n");
        assert_eq!(status_lines(), "last_cycle_by=\nlast_stop_by=\nlast_serve_by=\n");
    }

    #[cfg(windows)]
    mod window {
        use super::super::*;
        use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
        use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
        use windows_sys::Win32::UI::WindowsAndMessaging as wm;
        use std::sync::atomic::{AtomicU32, Ordering};

        /// Messages the window's own procedure received.
        static OWN: AtomicU32 = AtomicU32::new(0);

        unsafe extern "system" fn own_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
            if msg == wm::WM_LBUTTONUP || msg == wm::WM_KEYDOWN {
                OWN.fetch_add(1, Ordering::SeqCst);
            }
            wm::DefWindowProcW(hwnd, msg, wparam, lparam)
        }

        fn wide(s: &str) -> Vec<u16> {
            s.encode_utf16().chain(std::iter::once(0)).collect()
        }

        /// A plain window of this thread, with WS_EX_NOACTIVATE + TOOLWINDOW +
        /// TOPMOST: it takes no focus and has no taskbar button. Windows' own
        /// STATIC class (no class to register), with `own_proc` as "its own"
        /// procedure.
        pub fn make_window(name: &str, x: i32, y: i32) -> HWND {
            let class = wide("STATIC");
            let title = wide(name);
            unsafe {
                let module = GetModuleHandleW(std::ptr::null());
                let hwnd = wm::CreateWindowExW(
                    wm::WS_EX_NOACTIVATE | wm::WS_EX_TOOLWINDOW | wm::WS_EX_TOPMOST,
                    class.as_ptr(),
                    title.as_ptr(),
                    wm::WS_POPUP | wm::WS_VISIBLE,
                    x,
                    y,
                    40,
                    40,
                    0,
                    0,
                    module,
                    std::ptr::null(),
                );
                let own: unsafe extern "system" fn(HWND, u32, WPARAM, LPARAM) -> LRESULT = own_proc;
                if hwnd != 0 {
                    wm::SetWindowLongPtrW(hwnd, wm::GWLP_WNDPROC, own as usize as isize);
                }
                hwnd
            }
        }

        /// The watch stands in front of the window's procedure, records the
        /// mouse button and Enter, and hands every message on. (A message SENT
        /// to the window is not an input message: Windows names no source.)
        #[test]
        fn the_watch_records_and_passes_every_message_on() {
            let _g = super::SERIAL.lock().unwrap_or_else(|e| e.into_inner());
            let hwnd = make_window("icraft_started_by_test", -32000, -32000);
            assert_ne!(hwnd, 0, "CreateWindowExW failed");
            assert!(watch_window(hwnd), "the watch did not take the test window");
            assert_eq!(win::watched(), hwnd);
            // Every frame calls it: the same window again says yes, another no.
            assert!(watch_window(hwnd));
            assert!(!watch_window(hwnd + 4));
            OWN.store(0, Ordering::SeqCst);
            unsafe {
                wm::SendMessageW(hwnd, wm::WM_LBUTTONDOWN, 0, 0);
                wm::SendMessageW(hwnd, wm::WM_LBUTTONUP, 0, 0);
                wm::SendMessageW(hwnd, wm::WM_KEYDOWN, 0x0D, 0);
            }
            assert_eq!(OWN.load(Ordering::SeqCst), 2, "the window's own procedure did not get the messages");
            let (origin, _) = take_origin(Device::Mouse);
            assert!(matches!(origin, Origin::Unavailable | Origin::Failed), "a sent message read as {origin:?}");
            let (key, _) = take_origin(Device::Keyboard);
            assert!(matches!(key, Origin::Unavailable | Origin::Failed), "a sent key read as {key:?}");
            // Taken: the next press does not reuse them.
            assert_eq!(take_origin(Device::Mouse).0, Origin::NotSeen);
            assert_eq!(take_origin(Device::Keyboard).0, Origin::NotSeen);
            // Too old to belong to a press.
            win::LAST_UP.store(1 << 8 | 1, Ordering::SeqCst);
            std::thread::sleep(PRESS_MATCH + Duration::from_millis(100));
            assert_eq!(take_origin(Device::Mouse).0, Origin::NotSeen);
            win::unwatch();
            unsafe { wm::DestroyWindow(hwnd) };
        }

        /// By hand, on a desktop (it moves the mouse for a moment and clicks a
        /// 40-pixel window of its own that takes no focus; the cursor is put
        /// back): `cargo test -p icraft-core started_by -- --ignored`. A click
        /// made with SendInput must read as INJECTED.
        #[test]
        #[ignore]
        fn a_click_made_with_sendinput_reads_as_injected() {
            use windows_sys::Win32::Foundation::POINT;
            use windows_sys::Win32::UI::Input::KeyboardAndMouse as km;
            let _g = super::SERIAL.lock().unwrap_or_else(|e| e.into_inner());
            let hwnd = make_window("icraft_started_by_click", 8, 8);
            assert!(watch_window(hwnd));
            let mut was = POINT { x: 0, y: 0 };
            unsafe {
                wm::GetCursorPos(&mut was);
                let at = POINT { x: 28, y: 28 };
                assert_eq!(wm::WindowFromPoint(at), hwnd, "something covers the test window: no click sent");
                wm::SetCursorPos(at.x, at.y);
                let click = |flags| km::INPUT {
                    r#type: km::INPUT_MOUSE,
                    Anonymous: km::INPUT_0 { mi: km::MOUSEINPUT { dx: 0, dy: 0, mouseData: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
                };
                let inputs = [click(km::MOUSEEVENTF_LEFTDOWN), click(km::MOUSEEVENTF_LEFTUP)];
                km::SendInput(2, inputs.as_ptr(), std::mem::size_of::<km::INPUT>() as i32);
                wm::SetCursorPos(was.x, was.y);
                // The window's messages arrive through this thread's queue.
                let until = std::time::Instant::now() + Duration::from_millis(800);
                let mut msg: wm::MSG = std::mem::zeroed();
                while std::time::Instant::now() < until {
                    while wm::PeekMessageW(&mut msg, 0, 0, 0, wm::PM_REMOVE) != 0 {
                        wm::TranslateMessage(&msg);
                        wm::DispatchMessageW(&msg);
                    }
                    std::thread::sleep(Duration::from_millis(10));
                }
            }
            let (origin, press) = take_origin(Device::Mouse);
            win::unwatch();
            unsafe { wm::DestroyWindow(hwnd) };
            assert_eq!(origin, Origin::Injected, "the release read as {origin:?} (press {press:?})");
            assert_eq!(press, None);
        }
    }
}
