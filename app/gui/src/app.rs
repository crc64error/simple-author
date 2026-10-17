//! Phase 3: a minimal single-document editing MVP. No tabs, no decorations,
//! no native menu yet (those are later phases) — this just proves out the
//! real editing loop: typing, Open/Save/Save As via native dialogs, and the
//! core crate's word/outline stats wired to the live cursor position.

use crate::file_ops;
use simple_writer_core::modes::{compute_stats, get_mode, MODES, WritingModeId};
use std::path::PathBuf;

/// The editor column is a fixed reading width, centered, regardless of
/// window size — mirrors `themes.ts`'s `editorTheme()` (`max-width: 720px`).
const EDITOR_COLUMN_WIDTH: f32 = 720.0;
const EDITOR_FONT_SIZE: f32 = 20.0;

enum PendingAction {
    New,
    Open,
}

pub struct EditorApp {
    doc: String,
    file_path: Option<PathBuf>,
    /// `None` means "never saved to a file" — dirty-tracking then falls back
    /// to the blank-template heuristic instead of a content diff.
    saved_content: Option<String>,
    cursor_byte: usize,
    mode: WritingModeId,
    pending_action: Option<PendingAction>,
}

impl Default for EditorApp {
    fn default() -> Self {
        Self {
            doc: get_mode(WritingModeId::Book).blank_document.to_string(),
            file_path: None,
            saved_content: None,
            cursor_byte: 0,
            mode: WritingModeId::Book,
            pending_action: None,
        }
    }
}

impl EditorApp {
    fn is_dirty(&self) -> bool {
        match &self.saved_content {
            Some(saved) => &self.doc != saved,
            None => {
                let trimmed = self.doc.trim();
                !trimmed.is_empty() && !MODES.iter().any(|m| m.blank_document.trim() == trimmed)
            }
        }
    }

    fn do_new(&mut self) {
        self.doc = get_mode(self.mode).blank_document.to_string();
        self.file_path = None;
        self.saved_content = None;
        self.cursor_byte = 0;
    }

    fn do_open(&mut self) {
        if let Some((path, text)) = file_ops::open_manuscript_dialog() {
            self.doc = text.clone();
            self.file_path = Some(path);
            self.saved_content = Some(text);
            self.cursor_byte = 0;
        }
    }

    fn do_save(&mut self, save_as: bool) {
        let result = if save_as {
            file_ops::save_manuscript_as(&self.doc, self.file_path.as_deref())
        } else {
            file_ops::save_manuscript(&self.doc, self.file_path.as_deref())
        };
        if let Some(path) = result {
            self.file_path = Some(path);
            self.saved_content = Some(self.doc.clone());
        }
    }

    /// Runs `action` immediately if the document isn't dirty; otherwise
    /// queues it behind a confirmation modal. Mirrors the TS tab-close
    /// confirm, simplified for the single-document MVP (full per-tab
    /// confirmation returns in phase 4).
    fn guarded(&mut self, action: PendingAction) {
        if self.is_dirty() {
            self.pending_action = Some(action);
        } else {
            self.run_action(action);
        }
    }

    fn run_action(&mut self, action: PendingAction) {
        match action {
            PendingAction::New => self.do_new(),
            PendingAction::Open => self.do_open(),
        }
    }
}

impl eframe::App for EditorApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // Cheap to call every frame; eframe/winit only actually touches the
        // native title bar when the string changes.
        let title = file_ops::window_title(self.file_path.as_deref());
        ctx.send_viewport_cmd(egui::ViewportCommand::Title(title));

        egui::TopBottomPanel::top("toolbar").show(ctx, |ui| {
            ui.horizontal(|ui| {
                if ui.button("New").clicked() {
                    self.guarded(PendingAction::New);
                }
                if ui.button("Open…").clicked() {
                    self.guarded(PendingAction::Open);
                }
                if ui.button("Save").clicked() {
                    self.do_save(false);
                }
                if ui.button("Save As…").clicked() {
                    self.do_save(true);
                }

                ui.separator();

                egui::ComboBox::from_id_salt("mode")
                    .selected_text(get_mode(self.mode).label)
                    .show_ui(ui, |ui| {
                        for m in &MODES {
                            ui.selectable_value(&mut self.mode, m.id, m.label);
                        }
                    });

                ui.separator();

                let name = self
                    .file_path
                    .as_ref()
                    .and_then(|p| p.file_name())
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Untitled".to_string());
                let label = if self.is_dirty() { format!("{name} •") } else { name };
                ui.label(label);
            });
        });

        egui::TopBottomPanel::bottom("status_bar").show(ctx, |ui| {
            ui.horizontal(|ui| {
                let mode = get_mode(self.mode);
                for stat in compute_stats(mode, &self.doc, self.cursor_byte) {
                    ui.label(format!("{}: {} {}", stat.label, stat.value, stat.unit));
                    ui.separator();
                }
            });
        });

        egui::CentralPanel::default().show(ctx, |ui| {
            ui.with_layout(egui::Layout::top_down(egui::Align::Center), |ui| {
                let width = EDITOR_COLUMN_WIDTH.min(ui.available_width());
                ui.allocate_ui_with_layout(
                    egui::vec2(width, ui.available_height()),
                    egui::Layout::top_down(egui::Align::Min),
                    |ui| {
                        egui::ScrollArea::vertical().auto_shrink(false).show(ui, |ui| {
                            let output = egui::TextEdit::multiline(&mut self.doc)
                                .font(egui::FontId::proportional(EDITOR_FONT_SIZE))
                                .frame(false)
                                .desired_width(width)
                                // Let the widget grow to fit the document rather than
                                // clamping rows — the ScrollArea around it is what
                                // handles anything taller than the viewport.
                                .desired_rows(1)
                                .show(ui);

                            if let Some(range) = output.cursor_range {
                                self.cursor_byte = char_index_to_byte_offset(&self.doc, range.primary.index);
                            }
                        });
                    },
                );
            });
        });

        if let Some(action) = self.pending_action.take() {
            let mut keep_open = true;
            let mut confirmed = false;
            egui::Window::new("Discard unsaved changes?")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, egui::vec2(0.0, 0.0))
                .show(ctx, |ui| {
                    ui.label("This document has changes that aren't saved to a file.");
                    ui.horizontal(|ui| {
                        if ui.button("Discard").clicked() {
                            confirmed = true;
                            keep_open = false;
                        }
                        if ui.button("Cancel").clicked() {
                            keep_open = false;
                        }
                    });
                });

            if confirmed {
                self.run_action(action);
            } else if keep_open {
                self.pending_action = Some(action);
            }
        }
    }
}

/// egui's cursor is a character index; our core crate's APIs take byte
/// offsets. Converts between the two for a given doc snapshot.
fn char_index_to_byte_offset(doc: &str, char_index: usize) -> usize {
    doc.char_indices()
        .nth(char_index)
        .map(|(b, _)| b)
        .unwrap_or(doc.len())
}
