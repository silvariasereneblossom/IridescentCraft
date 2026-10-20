//! The boot instance's rights (decision 177 (b), ruled 2026-10-20).
//!
//! An S4U task's process gets a FULL administrator token even at "least
//! privilege": elevated, no split token (measured on Server 2025 runners,
//! 2026-10-20, and so did the JVM it started). The launcher window runs with
//! the UAC-filtered half of the operator's token instead (measured on the box:
//! TokenElevationTypeLimited). The operator ruled (planning chat, ~13:57 EDT
//! 10-20): "Restrict the token first (Recommended)". So before the boot
//! instance touches the server folder it reads its own token and, when that
//! token carries administrator rights, starts itself again under a restricted
//! copy made to match the filtered one:
//!
//!   - BUILTIN\Administrators (S-1-5-32-544) and "Local account and member of
//!     Administrators group" (S-1-5-114) deny-only, as UAC leaves them;
//!   - every privilege removed except SeChangeNotify and SeIncreaseWorkingSet:
//!     the two a filtered token keeps on Windows Server (measured 2026-10-20,
//!     `whoami /priv` of a UAC-filtered administrator on Server 2025; a client
//!     edition's filtered token also keeps SeShutdown, SeUndock and SeTimeZone,
//!     which on Server only Administrators hold), so never more than the window;
//!   - medium integrity (S-1-16-8192);
//!   - the account itself as the owner of what it creates, and a default DACL
//!     of the account and SYSTEM: an elevated token names BUILTIN\Administrators
//!     there, which a deny-only SID can no longer use.
//!
//! Everything the restarted process starts (the JVM, a self-update relaunch)
//! inherits that token. No password and no privilege the process did not hold:
//! a restricted copy of the caller's own primary token is the one token
//! CreateProcessAsUser takes from an ordinary process (Microsoft, "Restricted
//! Tokens").
//!
//! Plain Win32 calls (advapi32 / kernel32), declared here: the structures are
//! the documented ones and nothing else is needed.

use anyhow::{anyhow, Result};
use std::ffi::OsString;
use std::path::Path;

/// The integrity level RIDs (the last sub-authority of S-1-16-x).
pub const MEDIUM_RID: u32 = 0x2000;
pub const HIGH_RID: u32 = 0x3000;

/// The LUIDs of the privileges a UAC-filtered token keeps on Windows Server
/// (fixed values: SE_CHANGE_NOTIFY 23, SE_INC_WORKING_SET 33).
pub const FILTERED_PRIVILEGES: [u32; 2] = [23, 33];

const GENERIC_ALL: u32 = 0x1000_0000;
const SE_GROUP_ENABLED: u32 = 0x4;
const SE_GROUP_USE_FOR_DENY_ONLY: u32 = 0x10;
const SE_GROUP_INTEGRITY: u32 = 0x20;

/// A SID as bytes: revision 1, the authority, the sub-authorities.
pub fn sid_bytes(authority: u8, subs: &[u32]) -> Vec<u8> {
    let mut v = vec![1u8, subs.len() as u8, 0, 0, 0, 0, 0, authority];
    for s in subs {
        v.extend_from_slice(&s.to_le_bytes());
    }
    v
}

/// `S-1-5-32-544`, for log lines.
pub fn sid_string(sid: &[u8]) -> String {
    if sid.len() < 8 {
        return "S-?".to_string();
    }
    let authority = sid[2..8].iter().fold(0u64, |a, b| (a << 8) | *b as u64);
    let mut s = format!("S-{}-{authority}", sid[0]);
    for chunk in sid[8..].chunks_exact(4) {
        s.push_str(&format!("-{}", u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]])));
    }
    s
}

pub fn administrators_sid() -> Vec<u8> {
    sid_bytes(5, &[32, 544])
}

pub fn local_admin_account_sid() -> Vec<u8> {
    sid_bytes(5, &[114])
}

pub fn medium_integrity_sid() -> Vec<u8> {
    sid_bytes(16, &[MEDIUM_RID])
}

pub fn system_sid() -> Vec<u8> {
    sid_bytes(5, &[18])
}

/// An ACL granting GENERIC_ALL to each SID, as Windows lays it out (revision
/// 2; ACCESS_ALLOWED_ACE entries).
pub fn acl_bytes(sids: &[&[u8]]) -> Vec<u8> {
    let size: usize = 8 + sids.iter().map(|s| 8 + s.len()).sum::<usize>();
    let mut v = Vec::with_capacity(size);
    v.extend_from_slice(&[2u8, 0]);
    v.extend_from_slice(&(size as u16).to_le_bytes());
    v.extend_from_slice(&(sids.len() as u16).to_le_bytes());
    v.extend_from_slice(&[0u8, 0]);
    for sid in sids {
        v.extend_from_slice(&[0u8, 0]); // ACCESS_ALLOWED_ACE_TYPE, no flags
        v.extend_from_slice(&((8 + sid.len()) as u16).to_le_bytes());
        v.extend_from_slice(&GENERIC_ALL.to_le_bytes());
        v.extend_from_slice(sid);
    }
    v
}

/// The privileges to take out of a token holding `present` (LUID low parts).
pub fn privileges_to_delete(present: &[u32]) -> Vec<u32> {
    present.iter().copied().filter(|p| !FILTERED_PRIVILEGES.contains(p)).collect()
}

/// The command line for `exe args`: the program in quotes, each argument
/// quoted as the MSVC runtime reads it back.
pub fn command_line(exe: &Path, args: &[OsString]) -> String {
    let mut line = format!("\"{}\"", exe.display());
    for a in args {
        line.push(' ');
        line.push_str(&quote_arg(&a.to_string_lossy()));
    }
    line
}

fn quote_arg(a: &str) -> String {
    if !a.is_empty() && !a.contains([' ', '\t', '\n', '\u{b}', '"']) {
        return a.to_string();
    }
    let mut out = String::from("\"");
    let mut backslashes = 0usize;
    for c in a.chars() {
        match c {
            '\\' => backslashes += 1,
            '"' => {
                out.push_str(&"\\".repeat(backslashes * 2 + 1));
                out.push('"');
                backslashes = 0;
            }
            _ => {
                out.push_str(&"\\".repeat(backslashes));
                out.push(c);
                backslashes = 0;
            }
        }
    }
    out.push_str(&"\\".repeat(backslashes * 2));
    out.push('"');
    out
}

/// What BUILTIN\Administrators is in a token.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Admins {
    Enabled,
    DenyOnly,
    /// Present but neither enabled nor deny-only (should not happen).
    Disabled,
    Absent,
}

/// What a token allows, read from it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Summary {
    pub integrity_rid: u32,
    pub admins: Admins,
    /// LUID low parts of the privileges the token holds.
    pub privileges: Vec<u32>,
    pub owner_is_user: bool,
    pub elevated: bool,
}

impl Summary {
    /// Rights beyond the window's filtered token: an enabled Administrators
    /// group, or an integrity level above medium.
    pub fn has_admin_rights(&self) -> bool {
        self.admins == Admins::Enabled || self.integrity_rid > MEDIUM_RID
    }

    fn integrity_name(&self) -> String {
        match self.integrity_rid {
            0 => "untrusted".to_string(),
            0x1000 => "low".to_string(),
            MEDIUM_RID => "medium".to_string(),
            0x2100 => "medium plus".to_string(),
            HIGH_RID => "high".to_string(),
            0x4000 => "system".to_string(),
            r => format!("0x{r:x}"),
        }
    }

    /// "medium integrity, Administrators deny-only, 5 privileges, owner the account".
    pub fn describe(&self) -> String {
        let admins = match self.admins {
            Admins::Enabled => "Administrators ENABLED",
            Admins::DenyOnly => "Administrators deny-only",
            Admins::Disabled => "Administrators disabled",
            Admins::Absent => "not an administrator",
        };
        format!(
            "{} integrity, {admins}, {} privileges, owner {}{}",
            self.integrity_name(),
            self.privileges.len(),
            if self.owner_is_user { "the account" } else { "a group (Administrators)" },
            if self.elevated { ", elevated" } else { "" }
        )
    }

    /// For the status file: "medium, Administrators deny-only".
    pub fn short(&self) -> String {
        let admins = match self.admins {
            Admins::Enabled => "Administrators enabled",
            Admins::DenyOnly => "Administrators deny-only",
            Admins::Disabled => "Administrators disabled",
            Admins::Absent => "no Administrators",
        };
        format!("{}, {admins}", self.integrity_name())
    }
}

/// This process's token.
pub fn current() -> Result<Summary> {
    imp::current()
}

/// A restricted copy of this process's token (see the module doc), read back.
/// Nothing is started with it: for tests and probes.
pub fn restricted_summary() -> Result<Summary> {
    imp::restricted_summary()
}

/// Start `exe args` in `dir` under the restricted copy of this process's
/// token, with this process's environment. Returns its pid.
pub fn spawn_restricted(exe: &Path, args: &[OsString], dir: &Path) -> Result<u32> {
    imp::spawn_restricted(exe, args, dir, false).map(|(pid, _)| pid)
}

/// [`spawn_restricted`] and wait for it: its exit code (tests).
pub fn run_restricted(exe: &Path, args: &[OsString], dir: &Path) -> Result<u32> {
    imp::spawn_restricted(exe, args, dir, true).map(|(_, code)| code)
}

#[cfg(windows)]
mod imp {
    use super::*;
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;

    type Handle = isize;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct SidAndAttributes {
        sid: *mut c_void,
        attributes: u32,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct Luid {
        low: u32,
        high: i32,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct LuidAndAttributes {
        luid: Luid,
        attributes: u32,
    }

    #[repr(C)]
    struct StartupInfoW {
        cb: u32,
        reserved: *mut u16,
        desktop: *mut u16,
        title: *mut u16,
        x: u32,
        y: u32,
        x_size: u32,
        y_size: u32,
        x_count_chars: u32,
        y_count_chars: u32,
        fill_attribute: u32,
        flags: u32,
        show_window: u16,
        cb_reserved2: u16,
        reserved2: *mut u8,
        std_input: Handle,
        std_output: Handle,
        std_error: Handle,
    }

    #[repr(C)]
    struct ProcessInformation {
        process: Handle,
        thread: Handle,
        process_id: u32,
        thread_id: u32,
    }

    #[link(name = "advapi32")]
    extern "system" {
        fn OpenProcessToken(process: Handle, access: u32, token: *mut Handle) -> i32;
        fn GetTokenInformation(token: Handle, class: i32, info: *mut c_void, len: u32, ret: *mut u32) -> i32;
        fn SetTokenInformation(token: Handle, class: i32, info: *const c_void, len: u32) -> i32;
        fn CreateRestrictedToken(
            existing: Handle,
            flags: u32,
            disable_count: u32,
            disable: *const SidAndAttributes,
            delete_count: u32,
            delete: *const LuidAndAttributes,
            restrict_count: u32,
            restrict: *const SidAndAttributes,
            new: *mut Handle,
        ) -> i32;
        fn CreateProcessAsUserW(
            token: Handle,
            app: *const u16,
            cmd: *mut u16,
            process_attributes: *const c_void,
            thread_attributes: *const c_void,
            inherit: i32,
            flags: u32,
            env: *const c_void,
            dir: *const u16,
            startup: *const StartupInfoW,
            info: *mut ProcessInformation,
        ) -> i32;
        fn GetLengthSid(sid: *const c_void) -> u32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentProcess() -> Handle;
        fn CloseHandle(h: Handle) -> i32;
        fn WaitForSingleObject(h: Handle, ms: u32) -> u32;
        fn GetExitCodeProcess(h: Handle, code: *mut u32) -> i32;
    }

    const TOKEN_ASSIGN_PRIMARY: u32 = 0x1;
    const TOKEN_DUPLICATE: u32 = 0x2;
    const TOKEN_QUERY: u32 = 0x8;
    const TOKEN_ADJUST_DEFAULT: u32 = 0x80;
    const TOKEN_USER: i32 = 1;
    const TOKEN_GROUPS: i32 = 2;
    const TOKEN_PRIVILEGES: i32 = 3;
    const TOKEN_OWNER: i32 = 4;
    const TOKEN_DEFAULT_DACL: i32 = 6;
    const TOKEN_ELEVATION: i32 = 20;
    const TOKEN_INTEGRITY_LEVEL: i32 = 25;
    const INFINITE: u32 = 0xFFFF_FFFF;

    struct Owned(Handle);

    impl Drop for Owned {
        fn drop(&mut self) {
            // SAFETY: a handle this module opened and nothing else closes.
            unsafe { CloseHandle(self.0) };
        }
    }

    fn os_err(what: &str) -> anyhow::Error {
        anyhow!("{what}: {}", std::io::Error::last_os_error())
    }

    fn wide(s: &std::ffi::OsStr) -> Vec<u16> {
        s.encode_wide().chain(std::iter::once(0)).collect()
    }

    fn own_token(access: u32) -> Result<Owned> {
        let mut h: Handle = 0;
        // SAFETY: our own process pseudo-handle and an out-parameter.
        if unsafe { OpenProcessToken(GetCurrentProcess(), access, &mut h) } == 0 {
            return Err(os_err("OpenProcessToken"));
        }
        Ok(Owned(h))
    }

    /// The token information `class`, in an 8-byte-aligned buffer.
    fn info(token: &Owned, class: i32) -> Result<Vec<u64>> {
        let mut len = 0u32;
        // SAFETY: a size query (null buffer, length 0).
        unsafe { GetTokenInformation(token.0, class, std::ptr::null_mut(), 0, &mut len) };
        if len == 0 {
            return Err(os_err("GetTokenInformation (size)"));
        }
        let mut buf = vec![0u64; (len as usize + 7) / 8];
        // SAFETY: the buffer holds `len` bytes.
        if unsafe { GetTokenInformation(token.0, class, buf.as_mut_ptr() as *mut c_void, len, &mut len) } == 0 {
            return Err(os_err("GetTokenInformation"));
        }
        Ok(buf)
    }

    /// The bytes of the SID `p` points at (inside a buffer still alive).
    fn sid_at(p: *const c_void) -> Vec<u8> {
        if p.is_null() {
            return Vec::new();
        }
        // SAFETY: Windows returned a valid SID pointer into a live buffer.
        unsafe {
            let n = GetLengthSid(p) as usize;
            std::slice::from_raw_parts(p as *const u8, n).to_vec()
        }
    }

    /// (SID bytes, attributes) of the token's groups.
    fn groups(token: &Owned) -> Result<Vec<(Vec<u8>, u32)>> {
        let buf = info(token, TOKEN_GROUPS)?;
        let base = buf.as_ptr() as *const u8;
        // SAFETY: TOKEN_GROUPS: a count, then the array at the structure's alignment.
        unsafe {
            let count = *(base as *const u32) as usize;
            let first = base.add(std::mem::align_of::<SidAndAttributes>()) as *const SidAndAttributes;
            Ok((0..count)
                .map(|i| {
                    let g = *first.add(i);
                    (sid_at(g.sid), g.attributes)
                })
                .collect())
        }
    }

    fn privileges(token: &Owned) -> Result<Vec<Luid>> {
        let buf = info(token, TOKEN_PRIVILEGES)?;
        let base = buf.as_ptr() as *const u8;
        // SAFETY: TOKEN_PRIVILEGES: a count, then LUID_AND_ATTRIBUTES (4-byte aligned).
        unsafe {
            let count = *(base as *const u32) as usize;
            let first = base.add(4) as *const LuidAndAttributes;
            Ok((0..count).map(|i| std::ptr::read_unaligned(first.add(i)).luid).collect())
        }
    }

    /// The SID a one-pointer structure (TOKEN_USER, TOKEN_OWNER, TOKEN_MANDATORY_LABEL) names.
    fn first_sid(token: &Owned, class: i32) -> Result<Vec<u8>> {
        let buf = info(token, class)?;
        // SAFETY: the structure starts with a SID pointer into the same buffer.
        let p = unsafe { *(buf.as_ptr() as *const *const c_void) };
        Ok(sid_at(p))
    }

    fn summarize(token: &Owned) -> Result<Summary> {
        let admins_sid = administrators_sid();
        let admins = match groups(token)?.into_iter().find(|(s, _)| *s == admins_sid) {
            None => Admins::Absent,
            Some((_, a)) if a & SE_GROUP_USE_FOR_DENY_ONLY != 0 => Admins::DenyOnly,
            Some((_, a)) if a & SE_GROUP_ENABLED != 0 => Admins::Enabled,
            Some(_) => Admins::Disabled,
        };
        let label = first_sid(token, TOKEN_INTEGRITY_LEVEL)?;
        let integrity_rid = label.len().checked_sub(4).map_or(0, |i| u32::from_le_bytes([label[i], label[i + 1], label[i + 2], label[i + 3]]));
        let user = first_sid(token, TOKEN_USER)?;
        let owner = first_sid(token, TOKEN_OWNER)?;
        let elevated = info(token, TOKEN_ELEVATION).map(|b| b[0] as u32 != 0).unwrap_or(false);
        Ok(Summary {
            integrity_rid,
            admins,
            privileges: privileges(token)?.into_iter().map(|l| l.low).collect(),
            owner_is_user: owner == user,
            elevated,
        })
    }

    pub fn current() -> Result<Summary> {
        summarize(&own_token(TOKEN_QUERY)?)
    }

    fn set(token: &Owned, class: i32, data: *const c_void, len: usize, what: &str) -> Result<()> {
        // SAFETY: `data` points at a structure of `len` bytes that outlives the call.
        if unsafe { SetTokenInformation(token.0, class, data, len as u32) } == 0 {
            return Err(os_err(what));
        }
        Ok(())
    }

    fn restricted() -> Result<Owned> {
        let token = own_token(TOKEN_QUERY | TOKEN_DUPLICATE | TOKEN_ASSIGN_PRIMARY | TOKEN_ADJUST_DEFAULT)?;
        let present = groups(&token)?;
        let mut deny: Vec<Vec<u8>> = Vec::new();
        for sid in [administrators_sid(), local_admin_account_sid()] {
            if present.iter().any(|(s, _)| *s == sid) {
                deny.push(sid);
            }
        }
        let disable: Vec<SidAndAttributes> =
            deny.iter().map(|s| SidAndAttributes { sid: s.as_ptr() as *mut c_void, attributes: 0 }).collect();
        let delete: Vec<LuidAndAttributes> = privileges(&token)?
            .into_iter()
            .filter(|l| l.high != 0 || !FILTERED_PRIVILEGES.contains(&l.low))
            .map(|luid| LuidAndAttributes { luid, attributes: 0 })
            .collect();
        let mut new: Handle = 0;
        // SAFETY: arrays of the given lengths, alive for the call; an out-parameter.
        let ok = unsafe {
            CreateRestrictedToken(
                token.0,
                0,
                disable.len() as u32,
                disable.as_ptr(),
                delete.len() as u32,
                delete.as_ptr(),
                0,
                std::ptr::null(),
                &mut new,
            )
        };
        if ok == 0 {
            return Err(os_err("CreateRestrictedToken"));
        }
        let new = Owned(new);

        // Medium integrity (lowering it needs no privilege).
        let medium = medium_integrity_sid();
        let label = SidAndAttributes { sid: medium.as_ptr() as *mut c_void, attributes: SE_GROUP_INTEGRITY };
        set(&new, TOKEN_INTEGRITY_LEVEL, &label as *const _ as *const c_void, std::mem::size_of::<SidAndAttributes>() + medium.len(), "SetTokenInformation (integrity)")?;

        // The account owns what it creates, and the default DACL is the account and SYSTEM.
        let user = first_sid(&token, TOKEN_USER)?;
        let owner: *const c_void = user.as_ptr() as *const c_void;
        set(&new, TOKEN_OWNER, &owner as *const _ as *const c_void, std::mem::size_of::<*const c_void>(), "SetTokenInformation (owner)")?;
        let acl = acl_bytes(&[&user, &system_sid()]);
        let mut aligned = vec![0u32; (acl.len() + 3) / 4];
        // SAFETY: `aligned` has room for every byte of `acl`.
        unsafe { std::ptr::copy_nonoverlapping(acl.as_ptr(), aligned.as_mut_ptr() as *mut u8, acl.len()) };
        let dacl: *const c_void = aligned.as_ptr() as *const c_void;
        set(&new, TOKEN_DEFAULT_DACL, &dacl as *const _ as *const c_void, std::mem::size_of::<*const c_void>(), "SetTokenInformation (default DACL)")?;
        Ok(new)
    }

    pub fn restricted_summary() -> Result<Summary> {
        summarize(&restricted()?)
    }

    pub fn spawn_restricted(exe: &Path, args: &[OsString], dir: &Path, wait: bool) -> Result<(u32, u32)> {
        let token = restricted()?;
        let app = wide(exe.as_os_str());
        let mut cmd = wide(std::ffi::OsStr::new(&command_line(exe, args)));
        let cwd = wide(dir.as_os_str());
        // SAFETY: plain old data; every field zero is a valid STARTUPINFOW / PROCESS_INFORMATION.
        let mut si: StartupInfoW = unsafe { std::mem::zeroed() };
        si.cb = std::mem::size_of::<StartupInfoW>() as u32;
        let mut pi: ProcessInformation = unsafe { std::mem::zeroed() };
        // SAFETY: NUL-terminated strings and structures alive for the call; a
        // null environment hands on this process's own.
        let ok = unsafe {
            CreateProcessAsUserW(
                token.0,
                app.as_ptr(),
                cmd.as_mut_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                0,
                0,
                std::ptr::null(),
                cwd.as_ptr(),
                &si,
                &mut pi,
            )
        };
        if ok == 0 {
            return Err(os_err("CreateProcessAsUserW"));
        }
        let process = Owned(pi.process);
        let _thread = Owned(pi.thread);
        let mut code = 0u32;
        if wait {
            // SAFETY: a process handle we own.
            unsafe {
                WaitForSingleObject(process.0, INFINITE);
                GetExitCodeProcess(process.0, &mut code);
            }
        }
        Ok((pi.process_id, code))
    }
}

#[cfg(not(windows))]
mod imp {
    use super::*;

    pub fn current() -> Result<Summary> {
        Err(anyhow!("tokens are a Windows thing"))
    }
    pub fn restricted_summary() -> Result<Summary> {
        Err(anyhow!("tokens are a Windows thing"))
    }
    pub fn spawn_restricted(_exe: &Path, _args: &[OsString], _dir: &Path, _wait: bool) -> Result<(u32, u32)> {
        Err(anyhow!("tokens are a Windows thing"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sids_are_laid_out_as_windows_lays_them_out() {
        assert_eq!(administrators_sid(), vec![1, 2, 0, 0, 0, 0, 0, 5, 32, 0, 0, 0, 0x20, 2, 0, 0]);
        assert_eq!(sid_string(&administrators_sid()), "S-1-5-32-544");
        assert_eq!(sid_string(&medium_integrity_sid()), "S-1-16-8192");
        assert_eq!(sid_string(&local_admin_account_sid()), "S-1-5-114");
        assert_eq!(sid_string(&system_sid()), "S-1-5-18");
    }

    #[test]
    fn the_default_dacl_names_the_account_and_system() {
        let user = sid_bytes(5, &[21, 1, 2, 3, 1001]);
        let acl = acl_bytes(&[&user, &system_sid()]);
        let size = u16::from_le_bytes([acl[2], acl[3]]) as usize;
        assert_eq!(size, acl.len());
        assert_eq!(acl.len() % 4, 0);
        assert_eq!(acl[0], 2);
        assert_eq!(u16::from_le_bytes([acl[4], acl[5]]), 2);
        // First ACE: allowed, GENERIC_ALL, the account.
        assert_eq!(acl[8], 0);
        let ace = u16::from_le_bytes([acl[10], acl[11]]) as usize;
        assert_eq!(ace, 8 + user.len());
        assert_eq!(u32::from_le_bytes([acl[12], acl[13], acl[14], acl[15]]), 0x1000_0000);
        assert_eq!(&acl[16..16 + user.len()], &user[..]);
        assert_eq!(&acl[8 + ace + 8..], &system_sid()[..]);
    }

    #[test]
    fn only_the_filtered_tokens_five_privileges_stay() {
        // SeDebug 20, SeBackup 17, SeChangeNotify 23, SeShutdown 19, SeImpersonate 29, SeIncreaseWorkingSet 33.
        assert_eq!(privileges_to_delete(&[20, 17, 23, 19, 29, 33]), vec![20, 17, 19, 29]);
        assert!(privileges_to_delete(&FILTERED_PRIVILEGES).is_empty());
    }

    #[test]
    fn arguments_reach_the_restarted_process_as_they_were() {
        let exe = Path::new(r"C:\Users\op\Desktop\IridescentCraft Dedicated Server\icraft-gui.exe");
        let args: Vec<OsString> = vec!["--boot".into(), r"C:\Users\op\Desktop\IridescentCraft Dedicated Server".into()];
        assert_eq!(
            command_line(exe, &args),
            r#""C:\Users\op\Desktop\IridescentCraft Dedicated Server\icraft-gui.exe" --boot "C:\Users\op\Desktop\IridescentCraft Dedicated Server""#
        );
        // A trailing backslash matters only inside quotes.
        assert_eq!(quote_arg(r"C:\dir\"), r"C:\dir\");
        assert_eq!(quote_arg(r"C:\with space\"), r#""C:\with space\\""#);
        assert_eq!(quote_arg(r#"say "hi""#), r#""say \"hi\"""#);
        assert_eq!(quote_arg(""), r#""""#);
        assert_eq!(quote_arg("plain"), "plain");
    }

    #[test]
    fn a_summary_says_whether_the_rights_are_beyond_the_windows() {
        let filtered = Summary { integrity_rid: MEDIUM_RID, admins: Admins::DenyOnly, privileges: FILTERED_PRIVILEGES.to_vec(), owner_is_user: true, elevated: false };
        assert!(!filtered.has_admin_rights());
        assert_eq!(filtered.describe(), "medium integrity, Administrators deny-only, 2 privileges, owner the account");
        assert_eq!(filtered.short(), "medium, Administrators deny-only");
        let s4u = Summary { integrity_rid: HIGH_RID, admins: Admins::Enabled, privileges: vec![1; 24], owner_is_user: false, elevated: true };
        assert!(s4u.has_admin_rights());
        assert!(s4u.describe().starts_with("high integrity, Administrators ENABLED, 24 privileges"));
        // Deny-only but still high (a runas /trustlevel token): not the window's either.
        let trust = Summary { integrity_rid: HIGH_RID, admins: Admins::DenyOnly, ..filtered.clone() };
        assert!(trust.has_admin_rights());
        let standard = Summary { admins: Admins::Absent, ..filtered };
        assert!(!standard.has_admin_rights());
    }

    #[cfg(windows)]
    #[test]
    fn this_process_token_can_be_read() {
        let s = current().unwrap();
        assert!(s.integrity_rid > 0);
    }

    #[cfg(windows)]
    #[test]
    fn a_restricted_copy_of_this_token_has_the_windows_rights() {
        let me = current().unwrap();
        let r = restricted_summary().unwrap();
        assert!(r.integrity_rid <= MEDIUM_RID, "{}", r.describe());
        assert_ne!(r.admins, Admins::Enabled, "{}", r.describe());
        if me.admins != Admins::Absent {
            assert_eq!(r.admins, Admins::DenyOnly, "{}", r.describe());
        }
        assert!(r.privileges.iter().all(|p| FILTERED_PRIVILEGES.contains(p)), "{:?}", r.privileges);
        assert!(r.owner_is_user, "{}", r.describe());
        assert!(!r.has_admin_rights());
    }

    #[cfg(windows)]
    #[test]
    fn a_process_started_restricted_is_medium_and_not_an_administrator() {
        let dir = std::env::temp_dir().join(format!("icraft-token-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let out = dir.join("groups.txt");
        let cmd = std::path::PathBuf::from(std::env::var("ComSpec").unwrap_or_else(|_| r"C:\Windows\System32\cmd.exe".to_string()));
        // cmd.exe reads its own command line (no MSVC escapes): one word per argument.
        let args: Vec<OsString> = ["/c", "whoami", "/groups", "/fo", "csv", ">"]
            .iter()
            .map(OsString::from)
            .chain(std::iter::once(out.clone().into_os_string()))
            .collect();
        let code = run_restricted(&cmd, &args, &dir).unwrap();
        assert_eq!(code, 0);
        let text = std::fs::read_to_string(&out).unwrap();
        // The integrity label line names S-1-16-8192 (medium) whatever the language.
        assert!(text.contains("S-1-16-8192"), "{text}");
        assert!(!text.contains("S-1-16-12288"), "{text}");
        // Administrators, when the account is one, carries the deny-only attribute
        // (its attribute text is localized; the enabled form would say "Enabled group").
        if let Some(line) = text.lines().find(|l| l.contains("S-1-5-32-544")) {
            assert!(!line.contains("Enabled group"), "{line}");
        }
        let _ = std::fs::remove_dir_all(&dir);
    }
}
