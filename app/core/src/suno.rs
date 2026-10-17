//! `[Style]` ... `[/Style]` blocks (Suno AI-music prompt text) and the
//! Suno-specific lyrics export transform. Lyrics-mode-only feature.

use crate::block_scan::{find_tagged_blocks, strip_ranges, TaggedBlock};
use crate::regex_cache::bracket_only_line;

pub const SUNO_STYLE_LIMIT: usize = 1000;

fn is_open(line: &str) -> bool {
    line.eq_ignore_ascii_case("[Style]")
}

fn is_close(line: &str) -> bool {
    line.eq_ignore_ascii_case("[/Style]")
}

pub fn find_style_blocks(doc: &str) -> Vec<TaggedBlock> {
    find_tagged_blocks(doc, is_open, is_close)
}

pub fn strip_style_blocks(doc: &str) -> String {
    let blocks = find_style_blocks(doc);
    strip_ranges(doc, blocks.iter().map(|b| (b.block_start, b.block_end)))
}

/// Concatenated, trimmed content of every style block, joined by `\n`.
/// `None` if there are no style blocks at all (distinguished from "blocks
/// exist but are empty", which returns `Some("")`).
pub fn get_style_prompt(doc: &str) -> Option<String> {
    let blocks = find_style_blocks(doc);
    if blocks.is_empty() {
        return None;
    }
    let parts: Vec<&str> = blocks
        .iter()
        .map(|b| doc[b.content_start..b.content_end].trim())
        .filter(|s| !s.is_empty())
        .collect();
    Some(parts.join("\n"))
}

pub struct StyleCharCount {
    pub count: usize,
    pub over: bool,
}

/// `None` only when there are no style blocks in the document at all (so the
/// budget widget doesn't render).
pub fn style_char_count(doc: &str) -> Option<StyleCharCount> {
    let prompt = get_style_prompt(doc)?;
    let count = prompt.chars().count();
    Some(StyleCharCount {
        count,
        over: count > SUNO_STYLE_LIMIT,
    })
}

/// A line that is only `[anything without nested brackets]`, excluding the
/// `[Notes]`/`[/Notes]`/`[Style]`/`[/Style]` tags themselves — e.g.
/// `[Building vocals, female lead]`. Treated as a Suno performance direction.
pub fn is_performance_tag_line(line: &str) -> bool {
    let trimmed = line.trim();
    if !bracket_only_line().is_match(trimmed) {
        return false;
    }
    !matches!(
        trimmed.to_ascii_lowercase().as_str(),
        "[notes]" | "[/notes]" | "[style]" | "[/style]"
    )
}

/// Builds a paste-ready Suno lyrics block: strips style blocks then notes,
/// deletes every `# Section` heading outright, converts every `## Chapter`
/// heading into Suno's bracket tag syntax (`## Verse 1` -> `[Verse 1]`), and
/// collapses blank lines. Asymmetric by design — must stay that way.
pub fn build_suno_lyrics(doc: &str) -> String {
    let no_style = strip_style_blocks(doc);
    let no_notes = crate::notes::strip_notes(&no_style);

    let mut out = String::with_capacity(no_notes.len());
    for line in no_notes.split('\n') {
        if let Some(rest) = section_heading_text(line) {
            let _ = rest; // delete entirely, no trace
            continue;
        }
        if let Some(title) = chapter_heading_text(line) {
            out.push('[');
            out.push_str(title.trim_end());
            out.push(']');
        } else {
            out.push_str(line);
        }
        out.push('\n');
    }
    if out.ends_with('\n') {
        out.pop();
    }

    crate::regex_cache::newline_run()
        .replace_all(&out, "\n\n")
        .trim()
        .to_string()
}

/// `# Foo` (single hash, not `##`) -> `Some("Foo")`.
fn section_heading_text(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("# ")?;
    if rest.starts_with('#') {
        None
    } else {
        Some(rest)
    }
}

/// `## Foo` (exactly two hashes) -> `Some("Foo")`.
fn chapter_heading_text(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("## ")?;
    if rest.starts_with('#') {
        None
    } else {
        Some(rest)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn style_prompt_is_none_without_any_block() {
        assert_eq!(get_style_prompt("just lyrics\n"), None);
    }

    #[test]
    fn style_prompt_concatenates_blocks() {
        let doc = "[Style]\nupbeat pop\n[/Style]\n\n## Verse 1\n[Style]\nfemale vocal\n[/Style]\n";
        assert_eq!(
            get_style_prompt(doc),
            Some("upbeat pop\nfemale vocal".to_string())
        );
    }

    #[test]
    fn style_char_count_flags_over_limit() {
        let long = "x".repeat(1001);
        let doc = format!("[Style]\n{long}\n[/Style]\n");
        let c = style_char_count(&doc).unwrap();
        assert_eq!(c.count, 1001);
        assert!(c.over);
    }

    #[test]
    fn performance_tag_line_excludes_structural_tags() {
        assert!(is_performance_tag_line("[building vocals, female lead]"));
        assert!(!is_performance_tag_line("[Notes]"));
        assert!(!is_performance_tag_line("[Style]"));
        assert!(!is_performance_tag_line("[/Style]"));
    }

    #[test]
    fn build_suno_lyrics_deletes_sections_and_tags_chapters() {
        let doc = "# Song Title\n\n[Style]\nupbeat\n[/Style]\n\n## Verse 1\nFirst line\nSecond line\n\n## Chorus\nHey hey\n";
        let out = build_suno_lyrics(doc);
        assert_eq!(
            out,
            "[Verse 1]\nFirst line\nSecond line\n\n[Chorus]\nHey hey"
        );
    }

    #[test]
    fn build_suno_lyrics_strips_notes_too() {
        let doc = "## Verse 1\nLine one\n\n[Notes]\nscratch\n[/Notes]\n\n## Chorus\nLine two\n";
        let out = build_suno_lyrics(doc);
        assert_eq!(out, "[Verse 1]\nLine one\n\n[Chorus]\nLine two");
    }
}
