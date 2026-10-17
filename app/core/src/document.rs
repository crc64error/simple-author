//! Heading-driven document structure: outline, section/chapter scoping,
//! word/line/stanza counts. All offsets are byte offsets into the `&str`.
//!
//! Heading rules (strict, start-of-line only):
//! - `# ` (single hash, space, not followed by another `#`) = **Section**.
//! - `## ` (two hashes, space, not followed by a third `#`) = **Chapter**.
//! - `###` and deeper is never treated as a heading anywhere in this module.

use crate::notes::strip_notes;
use crate::regex_cache::bracket_only_line;

// ---------------------------------------------------------------------------
// Heading detection
// ---------------------------------------------------------------------------

/// `# Foo` -> `Some("Foo")`. Rejects `## Foo` (the `(?!#)` lookahead in the
/// original regex, restructured here as an explicit next-char check since
/// Rust's `regex` crate has no lookaround support).
fn section_heading_text(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("# ")?;
    (!rest.starts_with('#')).then(|| rest.trim_end())
}

/// `## Foo` -> `Some("Foo")`. Rejects `### Foo`.
fn chapter_heading_text(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("## ")?;
    (!rest.starts_with('#')).then(|| rest.trim_end())
}

/// Mirrors `/^#{1,3}\s/` — no leading-whitespace tolerance, anchored to the
/// true start of the line, requiring exactly one or more hashes (1-3) then
/// any single whitespace char right after.
fn is_heading_line(line: &str) -> bool {
    let hashes = line.chars().take_while(|&c| c == '#').count();
    (1..=3).contains(&hashes) && line[hashes..].starts_with(char::is_whitespace)
}

// ---------------------------------------------------------------------------
// stripMarkup / countWords
// ---------------------------------------------------------------------------

/// Strips heading markers and emphasis markers (keeping inner text), and
/// turns em/en dashes and hyphens into spaces, ready for word-splitting.
pub fn strip_markup(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for (i, line) in text.split('\n').enumerate() {
        if i > 0 {
            out.push('\n');
        }
        let without_heading = strip_leading_heading_marker(line);
        out.push_str(&without_heading);
    }

    let de_emphasized = crate::regex_cache::emphasis().replace_all(&out, |caps: &regex::Captures| {
        caps.get(1)
            .or_else(|| caps.get(2))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default()
    });

    de_emphasized
        .chars()
        .map(|c| if matches!(c, '—' | '–' | '-') { ' ' } else { c })
        .collect::<String>()
        .trim()
        .to_string()
}

/// Mirrors `/^#{1,3}\s+/` — a run of 1-3 `#` at the very start of the line,
/// immediately followed by whitespace, strips the hashes *and* all of that
/// whitespace. A run of 4+ hashes, or hashes with no whitespace after them,
/// is left untouched (this is deliberately looser than the heading-highlight
/// detection elsewhere: word counting doesn't care about heading "levels").
fn strip_leading_heading_marker(line: &str) -> String {
    let hash_len = line.chars().take_while(|&c| c == '#').count();
    if !(1..=3).contains(&hash_len) {
        return line.to_string();
    }
    let rest = &line[hash_len..];
    let ws_len = rest.len() - rest.trim_start().len();
    if ws_len == 0 {
        return line.to_string();
    }
    rest[ws_len..].to_string()
}

pub fn count_words(text: &str) -> usize {
    strip_markup(text)
        .split_whitespace()
        .filter(|s| !s.is_empty())
        .count()
}

/// Word count with `[Notes]` content excluded first — the scope every caller
/// in the app actually wants (book/section/chapter stats never count notes).
pub fn count_words_no_notes(text: &str) -> usize {
    count_words(&strip_notes(text))
}

// ---------------------------------------------------------------------------
// Section/chapter regions (for cursor-scoped word counts)
// ---------------------------------------------------------------------------

pub struct Region {
    pub title: Option<String>,
    pub start: usize,
    pub end: usize,
}

enum Level {
    Section,
    Chapter,
}

fn find_regions(doc: &str, level: Level) -> Vec<Region> {
    let detect = |line: &str| -> Option<Option<String>> {
        let text = match level {
            Level::Section => section_heading_text(line)?,
            Level::Chapter => chapter_heading_text(line)?,
        };
        Some(if text.is_empty() {
            None
        } else {
            Some(text.to_string())
        })
    };

    let mut regions: Vec<Region> = Vec::new();
    let mut offset = 0usize;
    for line in doc.split_inclusive('\n') {
        let bare = line.trim_end_matches('\n');
        if let Some(title) = detect(bare) {
            if let Some(last) = regions.last_mut() {
                last.end = offset;
            }
            regions.push(Region {
                title,
                start: offset,
                end: doc.len(),
            });
        }
        offset += line.len();
    }
    if let Some(last) = regions.last_mut() {
        last.end = doc.len();
    }
    regions
}

/// The last region whose `start <= cursor` (regions are contiguous and
/// non-overlapping, so this is exactly "the region containing the cursor").
fn region_at(regions: &[Region], cursor: usize) -> Option<&Region> {
    regions.iter().filter(|r| r.start <= cursor).last()
}

pub struct ScopedText {
    pub text: String,
    pub title: Option<String>,
}

/// Returns the section-scoped and chapter-scoped text/title at `cursor`,
/// falling back to the whole document if no sections exist, and the
/// chapter falling back to the section text, then the whole document.
pub struct RegionTextsAt {
    pub section: ScopedText,
    pub chapter: ScopedText,
}

pub fn region_texts_at(doc: &str, cursor: usize) -> RegionTextsAt {
    let sections = find_regions(doc, Level::Section);
    let chapters = find_regions(doc, Level::Chapter);

    let section = match region_at(&sections, cursor) {
        Some(r) => ScopedText {
            text: doc[r.start..r.end].to_string(),
            title: r.title.clone(),
        },
        None => ScopedText {
            text: doc.to_string(),
            title: None,
        },
    };

    let chapter = match region_at(&chapters, cursor) {
        Some(r) => ScopedText {
            text: doc[r.start..r.end].to_string(),
            title: r.title.clone(),
        },
        None => ScopedText {
            text: section.text.clone(),
            title: None,
        },
    };

    RegionTextsAt { section, chapter }
}

// ---------------------------------------------------------------------------
// Outline sidebar
// ---------------------------------------------------------------------------

pub struct OutlineChapter {
    pub title: String,
    pub start: usize,
}

pub struct OutlineSection {
    pub title: String,
    pub start: usize,
    pub chapters: Vec<OutlineChapter>,
}

pub fn build_outline(doc: &str) -> Vec<OutlineSection> {
    let mut outline: Vec<OutlineSection> = Vec::new();
    let mut offset = 0usize;

    for line in doc.split_inclusive('\n') {
        let bare = line.trim_end_matches('\n');
        if let Some(text) = section_heading_text(bare) {
            let title = if text.is_empty() {
                "Untitled Section".to_string()
            } else {
                text.to_string()
            };
            outline.push(OutlineSection {
                title,
                start: offset,
                chapters: Vec::new(),
            });
        } else if let Some(text) = chapter_heading_text(bare) {
            if let Some(section) = outline.last_mut() {
                let title = if text.is_empty() {
                    "Untitled Chapter".to_string()
                } else {
                    text.to_string()
                };
                section.chapters.push(OutlineChapter {
                    title,
                    start: offset,
                });
            }
        }
        offset += line.len();
    }

    outline
}

/// (section index, chapter index within that section) of whichever
/// section/chapter contains `cursor` — the last one whose `start <= cursor`.
pub fn active_outline_indices(
    outline: &[OutlineSection],
    cursor: usize,
) -> Option<(usize, Option<usize>)> {
    let section_idx = outline
        .iter()
        .enumerate()
        .filter(|(_, s)| s.start <= cursor)
        .map(|(i, _)| i)
        .last()?;

    let chapter_idx = outline[section_idx]
        .chapters
        .iter()
        .enumerate()
        .filter(|(_, c)| c.start <= cursor)
        .map(|(i, _)| i)
        .last();

    Some((section_idx, chapter_idx))
}

// ---------------------------------------------------------------------------
// Line/stanza counting (Lyrics/Poetry modes)
// ---------------------------------------------------------------------------

/// Blanks out heading lines and bracket-only lines (`[Notes]`, `[Style]`,
/// `[building vocals]`, ...); everything else is trimmed and kept.
fn normalize_content_line(line: &str) -> String {
    let trimmed = line.trim();
    if is_heading_line(line) || bracket_only_line().is_match(trimmed) {
        String::new()
    } else {
        trimmed.to_string()
    }
}

fn content_lines(text: &str) -> Vec<String> {
    text.split('\n').map(normalize_content_line).collect()
}

pub fn count_lines(text: &str) -> usize {
    content_lines(&strip_notes(text))
        .into_iter()
        .filter(|l| !l.is_empty())
        .count()
}

pub fn count_stanzas(text: &str) -> usize {
    let lines = content_lines(&strip_notes(text));
    let mut stanzas = 0;
    let mut in_stanza = false;
    for line in lines {
        if line.is_empty() {
            in_stanza = false;
        } else if !in_stanza {
            stanzas += 1;
            in_stanza = true;
        }
    }
    stanzas
}

/// Line count of the stanza containing `cursor` (0 if the cursor's own line
/// is blank). Operates on the raw document (not notes-stripped) since the
/// cursor offset must map to the live buffer.
pub fn stanza_lines_at(doc: &str, cursor: usize) -> usize {
    let lines: Vec<&str> = doc.split('\n').collect();

    let mut offset = 0usize;
    let mut cursor_line = lines.len() - 1;
    for (i, line) in lines.iter().enumerate() {
        let end = offset + line.len();
        if cursor <= end {
            cursor_line = i;
            break;
        }
        offset = end + 1; // account for the '\n' that split() consumed
    }

    let normalized: Vec<String> = lines.iter().map(|l| normalize_content_line(l)).collect();
    if normalized[cursor_line].is_empty() {
        return 0;
    }

    let mut start = cursor_line;
    while start > 0 && !normalized[start - 1].is_empty() {
        start -= 1;
    }
    let mut end = cursor_line;
    while end + 1 < normalized.len() && !normalized[end + 1].is_empty() {
        end += 1;
    }
    end - start + 1
}

pub fn speaking_minutes(words: usize) -> usize {
    ((words as f64) / 130.0).round() as usize
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_markup_removes_headings_and_emphasis_and_dashes() {
        let out = strip_markup("# Title\nA *great* well-known _book_—truly.");
        assert_eq!(out, "Title\nA great well known book truly.");
    }

    #[test]
    fn count_words_excludes_notes() {
        // "Ch" (heading text, markers stripped but the words themselves still
        // count) + "One two three." = 4 words; the Notes block's 3 words don't count.
        let doc = "# Ch\nOne two three.\n\n[Notes]\nfour five six\n[/Notes]\n";
        assert_eq!(count_words_no_notes(doc), 4);
    }

    #[test]
    fn section_and_chapter_scoping_falls_back_sensibly() {
        let doc = "# Sec1\n## Ch1\nAlpha beta.\n## Ch2\nGamma.\n# Sec2\nDelta epsilon zeta.\n";
        let cursor = doc.find("Gamma").unwrap();
        let scoped = region_texts_at(doc, cursor);
        assert_eq!(scoped.chapter.title.as_deref(), Some("Ch2"));
        assert_eq!(scoped.section.title.as_deref(), Some("Sec1"));

        let no_headings = "just plain text, no headings at all";
        let scoped2 = region_texts_at(no_headings, 5);
        assert_eq!(scoped2.section.text, no_headings);
        assert_eq!(scoped2.chapter.text, no_headings);
    }

    #[test]
    fn outline_nests_chapters_under_sections() {
        let doc = "# Sec1\n## Ch1\n## Ch2\n# Sec2\n";
        let outline = build_outline(doc);
        assert_eq!(outline.len(), 2);
        assert_eq!(outline[0].title, "Sec1");
        assert_eq!(outline[0].chapters.len(), 2);
        assert_eq!(outline[1].chapters.len(), 0);
    }

    #[test]
    fn count_lines_excludes_headings_notes_and_bracket_tags() {
        let doc = "# Song\n## Verse 1\nFirst line\n[building vocals]\nSecond line\n\n[Notes]\nscratch\n[/Notes]\n";
        assert_eq!(count_lines(doc), 2);
    }

    #[test]
    fn count_stanzas_counts_blank_line_delimited_runs() {
        let doc = "Line one\nLine two\n\nLine three\n\n\nLine four\n";
        assert_eq!(count_stanzas(doc), 3);
    }

    #[test]
    fn speaking_minutes_rounds_at_130_wpm() {
        assert_eq!(speaking_minutes(0), 0);
        assert_eq!(speaking_minutes(65), 1);
        assert_eq!(speaking_minutes(1300), 10);
    }
}
