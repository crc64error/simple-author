//! Native file dialogs + plain-text file I/O. Mirrors `platform.ts`:
//! manuscripts are always plain UTF-8 text, `.md`/`.txt`/`.sw` are all
//! accepted/offered extensions for the same content — no proprietary format.

use std::path::{Path, PathBuf};

const MANUSCRIPT_EXTENSIONS: &[&str] = &["md", "txt", "sw"];

pub fn open_manuscript_dialog() -> Option<(PathBuf, String)> {
    let path = rfd::FileDialog::new()
        .add_filter("Manuscript", MANUSCRIPT_EXTENSIONS)
        .pick_file()?;
    let text = std::fs::read_to_string(&path).ok()?;
    Some((path, text))
}

/// Writes directly to `current_path` if given (silent overwrite save);
/// otherwise prompts a native save dialog. Returns the path written to, or
/// `None` if the dialog was cancelled or the write failed.
pub fn save_manuscript(content: &str, current_path: Option<&Path>) -> Option<PathBuf> {
    match current_path {
        Some(path) => {
            std::fs::write(path, content).ok()?;
            Some(path.to_path_buf())
        }
        None => save_manuscript_as(content, None),
    }
}

/// Always prompts the save dialog, regardless of any existing path.
pub fn save_manuscript_as(content: &str, current_path: Option<&Path>) -> Option<PathBuf> {
    let default_name = current_path
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "manuscript.md".to_string());

    let mut dialog = rfd::FileDialog::new()
        .add_filter("Manuscript", MANUSCRIPT_EXTENSIONS)
        .set_file_name(&default_name);
    if let Some(parent) = current_path.and_then(|p| p.parent()) {
        dialog = dialog.set_directory(parent);
    }

    let path = dialog.save_file()?;
    std::fs::write(&path, content).ok()?;
    Some(path)
}

pub fn window_title(path: Option<&Path>) -> String {
    match path.and_then(|p| p.file_name()) {
        Some(name) => format!("{} — Simple Author", name.to_string_lossy()),
        None => "Simple Author".to_string(),
    }
}
