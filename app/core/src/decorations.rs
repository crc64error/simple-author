//! Computes *semantic* highlight spans (byte ranges + a `SpanKind`) from the
//! plain-text document — headings, note/style blocks, emphasis, scripture
//! references, performance tags. No color/font decisions here; that's the
//! GUI layer's job (it maps `SpanKind` to the current theme). Spans may
//! overlap (e.g. `EmphasisText` inside a `NoteBody`) — the GUI layer merges
//! them into non-overlapping runs using its own priority order.

use crate::{notes, scripture, suno};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpanKind {
    SectionHeading,
    ChapterHeading,
    NoteTag,
    NoteBody,
    EmphasisMarker,
    EmphasisText,
    Scripture,
    StyleTag,
    StyleBody,
    PerformanceTag,
}

#[derive(Debug, Clone, Copy)]
pub struct Span {
    pub start: usize,
    pub end: usize,
    pub kind: SpanKind,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct DecorationOptions {
    pub scripture_highlight: bool,
    pub lyrics_mode: bool,
}

pub fn compute_spans(doc: &str, options: DecorationOptions) -> Vec<Span> {
    let mut spans = Vec::new();

    push_heading_spans(doc, &mut spans);

    let note_blocks = notes::find_note_blocks(doc);
    for b in &note_blocks {
        spans.push(Span { start: b.block_start, end: b.content_start, kind: SpanKind::NoteTag });
        spans.push(Span { start: b.content_start, end: b.content_end, kind: SpanKind::NoteBody });
        spans.push(Span { start: b.content_end, end: b.block_end, kind: SpanKind::NoteTag });
    }

    let mut style_blocks = Vec::new();
    if options.lyrics_mode {
        style_blocks = suno::find_style_blocks(doc);
        for b in &style_blocks {
            spans.push(Span { start: b.block_start, end: b.content_start, kind: SpanKind::StyleTag });
            spans.push(Span { start: b.content_start, end: b.content_end, kind: SpanKind::StyleBody });
            spans.push(Span { start: b.content_end, end: b.block_end, kind: SpanKind::StyleTag });
        }
    }

    push_emphasis_spans(doc, &mut spans);

    if options.scripture_highlight {
        for (start, end) in scripture::find_references(doc) {
            spans.push(Span { start, end, kind: SpanKind::Scripture });
        }
    }

    if options.lyrics_mode {
        push_performance_tag_spans(doc, &note_blocks, &style_blocks, &mut spans);
    }

    spans
}

fn push_heading_spans(doc: &str, spans: &mut Vec<Span>) {
    let mut offset = 0usize;
    for line in doc.split_inclusive('\n') {
        let bare = line.trim_end_matches('\n');
        if is_section_heading(bare) {
            spans.push(Span { start: offset, end: offset + line.len(), kind: SpanKind::SectionHeading });
        } else if is_chapter_heading(bare) {
            spans.push(Span { start: offset, end: offset + line.len(), kind: SpanKind::ChapterHeading });
        }
        offset += line.len();
    }
}

fn is_section_heading(line: &str) -> bool {
    line.strip_prefix("# ").is_some_and(|rest| !rest.starts_with('#'))
}

fn is_chapter_heading(line: &str) -> bool {
    line.strip_prefix("## ").is_some_and(|rest| !rest.starts_with('#'))
}

fn push_emphasis_spans(doc: &str, spans: &mut Vec<Span>) {
    for caps in crate::regex_cache::emphasis().captures_iter(doc) {
        let whole = caps.get(0).unwrap();
        let inner = caps.get(1).or_else(|| caps.get(2)).unwrap();

        spans.push(Span { start: whole.start(), end: inner.start(), kind: SpanKind::EmphasisMarker });
        spans.push(Span { start: inner.start(), end: inner.end(), kind: SpanKind::EmphasisText });
        spans.push(Span { start: inner.end(), end: whole.end(), kind: SpanKind::EmphasisMarker });
    }
}

fn push_performance_tag_spans(
    doc: &str,
    note_blocks: &[crate::block_scan::TaggedBlock],
    style_blocks: &[crate::block_scan::TaggedBlock],
    spans: &mut Vec<Span>,
) {
    let in_any_block = |pos: usize| {
        note_blocks.iter().any(|b| pos >= b.block_start && pos < b.block_end)
            || style_blocks.iter().any(|b| pos >= b.block_start && pos < b.block_end)
    };

    let mut offset = 0usize;
    for line in doc.split_inclusive('\n') {
        let bare = line.trim_end_matches('\n');
        if suno::is_performance_tag_line(bare) && !in_any_block(offset) {
            spans.push(Span { start: offset, end: offset + bare.len(), kind: SpanKind::PerformanceTag });
        }
        offset += line.len();
    }
}

/// Byte ranges the spellchecker should skip: `[Notes]` blocks (tag lines
/// included) and heading lines (`^#{1,3}\s`). Deliberately does NOT include
/// `[Style]` blocks — Suno style-prompt text is spellchecked.
pub fn spellcheck_skip_ranges(doc: &str) -> Vec<(usize, usize)> {
    let mut ranges: Vec<(usize, usize)> = notes::find_note_blocks(doc)
        .iter()
        .map(|b| (b.block_start, b.block_end))
        .collect();

    let mut offset = 0usize;
    for line in doc.split_inclusive('\n') {
        let bare = line.trim_end_matches('\n');
        let hash_len = bare.chars().take_while(|&c| c == '#').count();
        if (1..=3).contains(&hash_len) && bare[hash_len..].starts_with(char::is_whitespace) {
            ranges.push((offset, offset + line.len()));
        }
        offset += line.len();
    }

    ranges
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kinds_at(spans: &[Span], text: &str, needle: &str) -> Vec<SpanKind> {
        let start = text.find(needle).unwrap();
        let end = start + needle.len();
        spans
            .iter()
            .filter(|s| s.start == start && s.end == end)
            .map(|s| s.kind)
            .collect()
    }

    #[test]
    fn detects_section_and_chapter_headings() {
        let doc = "# Sec\n## Ch\n### not a heading\n";
        let spans = compute_spans(doc, DecorationOptions::default());
        assert!(kinds_at(&spans, doc, "# Sec\n").contains(&SpanKind::SectionHeading));
        assert!(kinds_at(&spans, doc, "## Ch\n").contains(&SpanKind::ChapterHeading));
        assert!(spans.iter().all(|s| doc[s.start..s.end].trim() != "### not a heading"));
    }

    #[test]
    fn note_block_produces_tag_and_body_spans() {
        let doc = "[Notes]\nsecret\n[/Notes]\n";
        let spans = compute_spans(doc, DecorationOptions::default());
        assert!(kinds_at(&spans, doc, "[Notes]\n").contains(&SpanKind::NoteTag));
        assert!(kinds_at(&spans, doc, "secret\n").contains(&SpanKind::NoteBody));
        assert!(kinds_at(&spans, doc, "[/Notes]\n").contains(&SpanKind::NoteTag));
    }

    #[test]
    fn emphasis_splits_markers_from_text() {
        let doc = "A *great* day.";
        let spans = compute_spans(doc, DecorationOptions::default());
        assert!(kinds_at(&spans, doc, "great").contains(&SpanKind::EmphasisText));
        let marker_count = spans.iter().filter(|s| s.kind == SpanKind::EmphasisMarker).count();
        assert_eq!(marker_count, 2);
    }

    #[test]
    fn scripture_only_highlighted_when_enabled() {
        let doc = "See John 3:16.";
        let off = compute_spans(doc, DecorationOptions::default());
        assert!(off.iter().all(|s| s.kind != SpanKind::Scripture));

        let on = compute_spans(doc, DecorationOptions { scripture_highlight: true, ..Default::default() });
        assert!(kinds_at(&on, doc, "John 3:16").contains(&SpanKind::Scripture));
    }

    #[test]
    fn style_blocks_and_performance_tags_only_in_lyrics_mode() {
        let doc = "[Style]\nupbeat\n[/Style]\n\n[building vocals]\nLyrics here\n";
        let off = compute_spans(doc, DecorationOptions::default());
        assert!(off.iter().all(|s| !matches!(s.kind, SpanKind::StyleTag | SpanKind::StyleBody | SpanKind::PerformanceTag)));

        let on = compute_spans(doc, DecorationOptions { lyrics_mode: true, ..Default::default() });
        assert!(kinds_at(&on, doc, "upbeat\n").contains(&SpanKind::StyleBody));
        assert!(kinds_at(&on, doc, "[building vocals]").contains(&SpanKind::PerformanceTag));
    }

    #[test]
    fn spellcheck_skip_ranges_cover_notes_and_headings_not_style() {
        let doc = "# Heading\nBody text.\n[Notes]\nscratch\n[/Notes]\n[Style]\nprompt\n[/Style]\n";
        let ranges = spellcheck_skip_ranges(doc);
        let covers = |needle: &str| {
            let pos = doc.find(needle).unwrap();
            ranges.iter().any(|&(s, e)| pos >= s && pos < e)
        };
        assert!(covers("# Heading"));
        assert!(covers("scratch"));
        assert!(!covers("Body text"));
        assert!(!covers("prompt")); // Style blocks are NOT skipped
    }
}
