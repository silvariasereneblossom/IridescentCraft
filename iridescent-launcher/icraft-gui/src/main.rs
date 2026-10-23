//! `icraft-gui` — the IridescentCraft server launcher (see `lib.rs`).

#![cfg_attr(all(not(debug_assertions), windows), windows_subsystem = "windows")]

fn main() -> Result<(), eframe::Error> {
    icraft_gui::run(icraft_gui::ext::none())
}
