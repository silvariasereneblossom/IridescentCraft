//! Console mode tweaks. Currently a single concern: disable Windows
//! QuickEdit Mode at launcher startup.
//!
//! Why this matters: a stock Windows console window has QuickEdit
//! enabled by default. If the operator clicks anywhere inside the cmd
//! window (or the window's titlebar steals focus during a drag), the
//! console enters select mode, which BLOCKS any process writing to
//! stdout. The Forge server's log writes back up, the JVM stalls, and
//! to all appearances "the server hung". Pressing Enter exits select
//! mode and the server resumes.
//!
//! This is the single most common Windows-server-stalls failure mode
//! and the reason the user reported "pressing Enter fixed it".
//!
//! Fix: clear ENABLE_QUICK_EDIT_MODE on the input handle at startup.
//! Per MSDN, ENABLE_EXTENDED_FLAGS must be set in the same SetConsoleMode
//! call or the QuickEdit bit change is silently ignored. Other flags
//! (line-input, echo) are left untouched so the operator can still
//! type at the console.
//!
//! No-op on non-Windows and on Windows processes with no console
//! attached (windows_subsystem = "windows", e.g. icraft-gui.exe).

#[cfg(windows)]
pub fn disable_quickedit_mode() {
    use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
    use windows_sys::Win32::System::Console::{
        GetConsoleMode, GetStdHandle, SetConsoleMode, ENABLE_EXTENDED_FLAGS,
        ENABLE_QUICK_EDIT_MODE, STD_INPUT_HANDLE,
    };
    unsafe {
        // windows-sys models HANDLE as `isize` (not a pointer), so compare
        // numerically: 0 is the null handle, -1 is INVALID_HANDLE_VALUE.
        let h = GetStdHandle(STD_INPUT_HANDLE);
        if h == 0 || h == INVALID_HANDLE_VALUE {
            return;
        }
        let mut mode: u32 = 0;
        if GetConsoleMode(h, &mut mode) == 0 {
            // Not attached to a real console (GUI subsystem, redirected
            // stdin, etc.). Nothing to disable.
            return;
        }
        let new_mode = (mode & !ENABLE_QUICK_EDIT_MODE) | ENABLE_EXTENDED_FLAGS;
        if SetConsoleMode(h, new_mode) != 0 {
            log::debug!(
                "[console] QuickEdit disabled (mode 0x{mode:x} -> 0x{new_mode:x})"
            );
        }
    }
}

#[cfg(not(windows))]
pub fn disable_quickedit_mode() {
    // Linux/macOS terminals don't have an equivalent freeze-on-click
    // feature. No-op.
}
