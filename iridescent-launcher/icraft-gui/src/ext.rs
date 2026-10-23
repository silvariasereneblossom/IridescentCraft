//! The extension point: what a build that embeds this launcher can add.
//!
//! `icraft_gui::run(extension)` starts the launcher (the window, or the boot
//! instance with `--boot`). The launcher's own binary passes
//! [`none`], which adds nothing. Another build passes its own
//! implementation; every method has a default that does nothing, so the
//! launcher behaves exactly as without one unless a method says otherwise.
//!
//! What an extension can do:
//!   - name itself after the window title ([`Extension::title_suffix`]);
//!   - start threads of its own in the process that runs the server folder,
//!     the window that holds the lock or the boot instance
//!     ([`Extension::on_owner`]);
//!   - add top-level tabs ([`Extension::tabs`], [`Extension::tab_ui`]), drawn
//!     whichever launcher runs the folder;
//!   - draw below a Customizer page ([`Extension::page_ui`]);
//!   - show one badge in the status row ([`Extension::status_badge`]);
//!   - update itself from a channel of its own ([`Extension::own_updates`]):
//!     the Cycle then applies only a `.new` staged beside the running exe,
//!     never the launcher the pack's sync stages in the server folder, and
//!     the window hides its launcher update buttons.

use std::path::Path;
use std::sync::OnceLock;

/// Where a tab or panel is drawn.
pub struct Here<'a> {
    /// The server folder the window shows.
    pub server_dir: &'a Path,
    /// This window runs that folder (holds its lock); false while another
    /// launcher (the boot instance, another window) runs it.
    pub runs_server: bool,
}

/// The colour of a badge.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Health {
    Good,
    Busy,
    Bad,
}

/// One badge in the status row: `label: value`.
#[derive(Clone, Debug)]
pub struct Badge {
    pub label: String,
    pub value: String,
    pub health: Health,
}

pub trait Extension: Send + Sync + 'static {
    /// Appended to the window title (default: nothing).
    fn title_suffix(&self) -> String {
        String::new()
    }

    /// Called once in the process that runs `dir`, after the launcher's own
    /// threads are started: the window that took the lock, or the boot
    /// instance. Start long-running work on threads of its own here.
    fn on_owner(&self, _dir: &Path) {}

    /// Labels of extra top-level tabs, after Server and Customizer.
    fn tabs(&self) -> Vec<String> {
        Vec::new()
    }

    /// Draw extra tab `index` (an index into [`Extension::tabs`]).
    fn tab_ui(&self, _index: usize, _ui: &mut egui::Ui, _here: &Here) {}

    /// Draw below the Customizer page named `page` (`tab-customizer`,
    /// `tab-customizer-worldgen`, `tab-customizer-regenerate`). Only in the
    /// window that runs the server folder, like the page itself.
    fn page_ui(&self, _page: &str, _ui: &mut egui::Ui, _here: &Here) {}

    /// A badge for the status row, or none.
    fn status_badge(&self) -> Option<Badge> {
        None
    }

    /// True when this build updates itself from a channel of its own: the
    /// launcher binary the pack's sync stages in the server folder is then
    /// never applied (see the module comment).
    fn own_updates(&self) -> bool {
        false
    }
}

/// The launcher itself: adds nothing.
struct NoExtension;

impl Extension for NoExtension {}

/// The extension of the launcher's own binary: nothing added.
pub fn none() -> Box<dyn Extension> {
    Box::new(NoExtension)
}

static EXTENSION: OnceLock<Box<dyn Extension>> = OnceLock::new();

/// Set once, by `run`.
pub(crate) fn install(extension: Box<dyn Extension>) {
    let _ = EXTENSION.set(extension);
}

/// The installed extension (none before `run`).
pub(crate) fn ext() -> &'static dyn Extension {
    static NONE: NoExtension = NoExtension;
    EXTENSION.get().map_or(&NONE as &dyn Extension, |e| e.as_ref())
}
