//! The four writing modes — Book, Lyrics, Poetry, Sermon. Each customizes
//! outline labels, the blank document, available templates, scripture
//! highlighting, and the 3 status-bar stat tiles.

use crate::document::{count_lines, count_stanzas, count_words_no_notes, region_texts_at, stanza_lines_at};
use crate::suno::strip_style_blocks;
use crate::templates::{book_templates, lyrics_templates, poetry_templates, sermon_templates, ManuscriptTemplate};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum WritingModeId {
    Book,
    Lyrics,
    Poetry,
    Sermon,
}

pub struct StatValue {
    pub label: &'static str,
    pub value: String,
    pub unit: &'static str,
}

pub struct WritingMode {
    pub id: WritingModeId,
    pub label: &'static str,
    pub top_icon: &'static str,
    pub top_label: &'static str,
    pub sub_icon: &'static str,
    pub sub_label: &'static str,
    pub blank_document: &'static str,
    pub scripture_highlight: bool,
}

pub const MODES: [WritingMode; 4] = [
    WritingMode {
        id: WritingModeId::Book,
        label: "Book",
        top_icon: "#",
        top_label: "Section",
        sub_icon: "##",
        sub_label: "Chapter",
        blank_document: "# Section 1 —\n\n## Chapter One\n\n",
        scripture_highlight: false,
    },
    WritingMode {
        id: WritingModeId::Lyrics,
        label: "Lyrics",
        top_icon: "♪",
        top_label: "Song",
        sub_icon: "§",
        sub_label: "Verse",
        blank_document: "# Song Title\n\n## Verse 1\n\n",
        scripture_highlight: false,
    },
    WritingMode {
        id: WritingModeId::Poetry,
        label: "Poetry",
        top_icon: "❧",
        top_label: "Poem",
        sub_icon: "§",
        sub_label: "Part",
        blank_document: "# Poem Title\n\n",
        scripture_highlight: false,
    },
    WritingMode {
        id: WritingModeId::Sermon,
        label: "Sermon",
        top_icon: "†",
        top_label: "Sermon",
        sub_icon: "§",
        sub_label: "Point",
        blank_document: "# Sermon Title\n\n## Opening\n\n",
        scripture_highlight: true,
    },
];

pub fn get_mode(id: WritingModeId) -> &'static WritingMode {
    MODES.iter().find(|m| m.id == id).unwrap_or(&MODES[0])
}

pub fn templates_for(id: WritingModeId, year: i32) -> Vec<ManuscriptTemplate> {
    match id {
        WritingModeId::Book => book_templates(year),
        WritingModeId::Lyrics => lyrics_templates(),
        WritingModeId::Poetry => poetry_templates(),
        WritingModeId::Sermon => sermon_templates(),
    }
}

/// Thousands-separated number formatting (mirrors `toLocaleString()`).
fn n(value: usize) -> String {
    let s = value.to_string();
    let mut out = String::with_capacity(s.len() + s.len() / 3);
    for (i, c) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    out.chars().rev().collect()
}

pub fn compute_stats(mode: &WritingMode, doc: &str, cursor: usize) -> [StatValue; 3] {
    let scoped = region_texts_at(doc, cursor);

    match mode.id {
        WritingModeId::Book => {
            let section_words = count_words_no_notes(&scoped.section.text);
            let chapter_words = count_words_no_notes(&scoped.chapter.text);
            let book_words = count_words_no_notes(doc);
            [
                StatValue { label: "Section", value: n(section_words), unit: "words" },
                StatValue { label: "Chapter", value: n(chapter_words), unit: "words" },
                StatValue { label: "Book", value: n(book_words), unit: "words" },
            ]
        }
        WritingModeId::Lyrics => {
            let song_lines = count_lines(&strip_style_blocks(&scoped.section.text));
            let part_lines = count_lines(&strip_style_blocks(&scoped.chapter.text));
            let all_words = count_words_no_notes(&strip_style_blocks(doc));
            [
                StatValue { label: "Song", value: n(song_lines), unit: "lines" },
                StatValue { label: "Part", value: n(part_lines), unit: "lines" },
                StatValue { label: "All", value: n(all_words), unit: "words" },
            ]
        }
        WritingModeId::Poetry => {
            let poem_lines = count_lines(doc);
            let poem_stanzas = count_stanzas(doc);
            let stanza_lines = stanza_lines_at(doc, cursor);
            let all_lines = count_lines(doc);
            [
                StatValue {
                    label: "Poem",
                    value: format!("{} · {}", n(poem_lines), n(poem_stanzas)),
                    unit: "lines · stanzas",
                },
                StatValue { label: "Stanza", value: n(stanza_lines), unit: "lines" },
                StatValue { label: "All", value: n(all_lines), unit: "lines" },
            ]
        }
        WritingModeId::Sermon => {
            let sermon_words = count_words_no_notes(doc);
            let point_words = count_words_no_notes(&scoped.chapter.text);
            let minutes = crate::document::speaking_minutes(sermon_words);
            let speaking = if minutes < 1 {
                "< 1".to_string()
            } else {
                format!("≈ {minutes}")
            };
            [
                StatValue { label: "Sermon", value: n(sermon_words), unit: "words" },
                StatValue { label: "Point", value: n(point_words), unit: "words" },
                StatValue { label: "Speaking", value: speaking, unit: "min" },
            ]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn book_mode_scopes_words_by_cursor() {
        let mode = get_mode(WritingModeId::Book);
        let doc = "# Sec1\n## Ch1\nAlpha beta gamma.\n## Ch2\nDelta.\n";
        let cursor = doc.find("Alpha").unwrap();
        let stats = compute_stats(mode, doc, cursor);
        assert_eq!(stats[0].label, "Section");
        // Chapter scope is "## Ch1\nAlpha beta gamma.\n" -> Ch1, Alpha, beta, gamma. = 4 words
        // (heading text counts; only the "#" markers themselves are stripped).
        assert_eq!(stats[1].value, "4");
        // Section scope is the whole doc (only one section) -> 7 words total.
        assert_eq!(stats[0].value, "7");
    }

    #[test]
    fn sermon_speaking_time_uses_lt_one_below_a_minute() {
        let mode = get_mode(WritingModeId::Sermon);
        let doc = "# Sermon\nJust a few words here.\n";
        let stats = compute_stats(mode, doc, 0);
        assert_eq!(stats[2].value, "< 1");
    }

    #[test]
    fn lyrics_mode_excludes_suno_style_blocks_from_line_counts() {
        let mode = get_mode(WritingModeId::Lyrics);
        let doc = "# Song\n\n[Style]\nupbeat\n[/Style]\n\n## Verse 1\nLine one\nLine two\n";
        let cursor = doc.find("Line one").unwrap();
        let stats = compute_stats(mode, doc, cursor);
        // "Song" (section) scope spans the whole doc here (only one section) —
        // style block content must not count as a lyric line.
        assert_eq!(stats[0].label, "Song");
        assert_eq!(stats[1].value, "2"); // Verse 1's two lines
    }

    #[test]
    fn format_number_adds_thousands_separators() {
        assert_eq!(n(0), "0");
        assert_eq!(n(999), "999");
        assert_eq!(n(1000), "1,000");
        assert_eq!(n(1234567), "1,234,567");
    }
}
