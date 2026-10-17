//! Turns `simple_writer_core::decorations::Span`s (+ spellcheck error ranges)
//! into an egui `LayoutJob`, for use as a `TextEdit`'s custom `layouter`.
//!
//! egui's `TextFormat` has no "bold" — only font size/color/background/
//! italics/underline — so headings are distinguished by size+color rather
//! than weight (CM6 used `font-weight: 600`, which has no cheap egui
//! equivalent without shipping a bold font variant; left as later polish).
//! The spellcheck "wavy underline" is approximated with a plain straight
//! underline (`TextFormat::underline` is a `Stroke`, not a wave style).

use crate::theme::Theme;
use egui::text::{LayoutJob, TextFormat};
use egui::{Color32, FontId};
use simple_writer_core::decorations::{Span, SpanKind};

pub fn build_layout_job(
    doc: &str,
    theme: &Theme,
    base_font_size: f32,
    spans: &[Span],
    spell_errors: &[(usize, usize)],
) -> LayoutJob {
    let mut boundaries: Vec<usize> = vec![0, doc.len()];
    for s in spans {
        boundaries.push(s.start);
        boundaries.push(s.end);
    }
    for &(start, end) in spell_errors {
        boundaries.push(start);
        boundaries.push(end);
    }
    boundaries.retain(|&b| doc.is_char_boundary(b));
    boundaries.sort_unstable();
    boundaries.dedup();

    // `wrap.max_width` is left at its default here — the caller (the
    // TextEdit's `layouter` closure) sets it to the real wrap width it's
    // given before handing the job to `ui.fonts(|f| f.layout_job(job))`.
    let mut job = LayoutJob::default();

    for window in boundaries.windows(2) {
        let (start, end) = (window[0], window[1]);
        if start >= end {
            continue;
        }
        let covering: Vec<&Span> = spans
            .iter()
            .filter(|s| s.start <= start && s.end >= end)
            .collect();
        let misspelled = spell_errors.iter().any(|&(s, e)| s <= start && e >= end);

        let format = resolve_format(theme, base_font_size, &covering, misspelled);
        job.append(&doc[start..end], 0.0, format);
    }

    job
}

fn resolve_format(theme: &Theme, base_size: f32, covering: &[&Span], misspelled: bool) -> TextFormat {
    let mut color = theme.fg;
    let mut size = base_size;
    let mut italics = false;
    let mut background = Color32::TRANSPARENT;

    // Foreground: first match in priority order wins.
    'fg: for kind in [
        SpanKind::SectionHeading,
        SpanKind::ChapterHeading,
        SpanKind::NoteTag,
        SpanKind::Scripture,
        SpanKind::EmphasisText,
        SpanKind::EmphasisMarker,
        SpanKind::PerformanceTag,
        SpanKind::NoteBody,
    ] {
        if covering.iter().any(|s| s.kind == kind) {
            match kind {
                SpanKind::SectionHeading => {
                    color = theme.section;
                    size = base_size * 1.55;
                }
                SpanKind::ChapterHeading => {
                    color = theme.chapter;
                    size = base_size * 1.2;
                }
                SpanKind::NoteTag => {
                    color = theme.notes;
                    italics = true;
                }
                SpanKind::Scripture => color = theme.section,
                SpanKind::EmphasisText => {
                    color = theme.emphasis;
                    italics = true;
                }
                SpanKind::EmphasisMarker => color = theme.fg.gamma_multiply(0.45),
                SpanKind::PerformanceTag => {
                    color = theme.accent;
                    italics = true;
                }
                SpanKind::NoteBody => color = theme.notes_text,
                _ => {}
            }
            break 'fg;
        }
    }

    // Background: Notes vs Style tint (independent of the foreground choice above).
    if covering.iter().any(|s| matches!(s.kind, SpanKind::NoteTag | SpanKind::NoteBody)) {
        background = theme.notes_bg;
    } else if covering.iter().any(|s| matches!(s.kind, SpanKind::StyleTag | SpanKind::StyleBody)) {
        background = theme.style_bg;
    }

    let underline = if misspelled {
        egui::Stroke::new(1.5_f32, theme.spell_error)
    } else {
        egui::Stroke::NONE
    };

    TextFormat {
        font_id: FontId::proportional(size),
        color,
        background,
        italics,
        underline,
        ..Default::default()
    }
}
