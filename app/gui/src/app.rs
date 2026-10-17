//! Phase 3 (editing MVP) + phase 4 (decorations). No tabs, no native menu,
//! no outline sidebar, no invisibles/rendered-mode/syllable-gutter yet
//! (those need the overlay-painting approach described in the rewrite plan,
//! not just `layouter` ranges) — this proves out headings/notes/italics/
//! spellcheck/scripture/Suno styling and the 4 themes.

use crate::decorate::build_layout_job;
use crate::file_ops;
use crate::theme::{self, ThemeId};
use simple_writer_core::decorations::{compute_spans, DecorationOptions};
use simple_writer_core::modes::{compute_stats, get_mode, WritingModeId, MODES};
use simple_writer_core::spellcheck::Spellchecker;
use std::path::PathBuf;

/// The editor column is a fixed reading width, centered, regardless of
/// window size — mirrors `themes.ts`'s `editorTheme()` (`max-width: 720px`).
const EDITOR_COLUMN_WIDTH: f32 = 720.0;
const EDITOR_FONT_SIZE: f32 = 20.0;

const EN_AFF: &str = include_str!("../../core/assets/dicts/en.aff");
const EN_DIC: &str = include_str!("../../core/assets/dicts/en.dic");
const PT_DIC: &str = include_str!("../../core/assets/dicts/pt.dic");

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
    theme_id: ThemeId,
    pending_action: Option<PendingAction>,
    spellchecker: Spellchecker,
}

impl Default for EditorApp {
    fn default() -> Self {
        let english = Spellchecker::load_english(EN_AFF, EN_DIC);
        Self {
            doc: get_mode(WritingModeId::Book).blank_document.to_string(),
            file_path: None,
            saved_content: None,
            cursor_byte: 0,
            mode: WritingModeId::Book,
            theme_id: ThemeId::Forest,
            pending_action: None,
            spellchecker: Spellchecker::new(english, PT_DIC),
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
    /// confirmation returns in the tabs phase).
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

    fn spell_errors(&self) -> Vec<(usize, usize)> {
        let skip = simple_writer_core::decorations::spellcheck_skip_ranges(&self.doc);
        self.spellchecker
            .find_misspellings(&self.doc)
            .filter(|&(start, end)| !skip.iter().any(|&(s, e)| start >= s && end <= e))
            .collect()
    }
}

impl eframe::App for EditorApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        let theme = theme::get(self.theme_id);
        apply_theme_visuals(ctx, &theme);

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

                egui::ComboBox::from_id_salt("theme")
                    .selected_text(theme.label)
                    .show_ui(ui, |ui| {
                        for t in theme::themes() {
                            ui.selectable_value(&mut self.theme_id, t.id, t.label);
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
                            let spell_errors = self.spell_errors();
                            let decoration_options = DecorationOptions {
                                scripture_highlight: get_mode(self.mode).scripture_highlight,
                                lyrics_mode: self.mode == WritingModeId::Lyrics,
                            };

                            let mut layouter = |ui: &egui::Ui, buf: &dyn egui::TextBuffer, wrap_width: f32| {
                                let text = buf.as_str();
                                let spans = compute_spans(text, decoration_options);
                                let mut job = build_layout_job(text, &theme, EDITOR_FONT_SIZE, &spans, &spell_errors);
                                job.wrap.max_width = wrap_width;
                                ui.fonts(|f| f.layout_job(job))
                            };

                            let output = egui::TextEdit::multiline(&mut self.doc)
                                .frame(false)
                                .desired_width(width)
                                // Let the widget grow to fit the document rather than
                                // clamping rows — the ScrollArea around it is what
                                // handles anything taller than the viewport.
                                .desired_rows(1)
                                .layouter(&mut layouter)
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

fn apply_theme_visuals(ctx: &egui::Context, theme: &theme::Theme) {
    let mut visuals = if theme.id == ThemeId::Parchment {
        egui::Visuals::light()
    } else {
        egui::Visuals::dark()
    };
    visuals.panel_fill = theme.bg;
    visuals.window_fill = theme.bg;
    visuals.override_text_color = Some(theme.fg);
    visuals.selection.bg_fill = theme.selection;
    ctx.set_visuals(visuals);
}

/// egui's cursor is a character index; our core crate's APIs take byte
/// offsets. Converts between the two for a given doc snapshot.
fn char_index_to_byte_offset(doc: &str, char_index: usize) -> usize {
    doc.char_indices()
        .nth(char_index)
        .map(|(b, _)| b)
        .unwrap_or(doc.len())
}
