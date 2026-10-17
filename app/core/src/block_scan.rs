//! Shared line-scanning logic for tag-delimited blocks (`[Notes]`...`[/Notes]`,
//! `[Style]`...`[/Style]`). A block opens on a line whose trimmed text matches
//! `is_open` and closes on the next line whose trimmed text matches `is_close`.
//! An unclosed open tag produces no block (mirrors the TS `notes.ts`/`suno.ts`
//! behavior exactly: `blockStart` just stays set and nothing is ever emitted).
//!
//! All offsets are **byte offsets** into the UTF-8 `&str` (not UTF-16 code
//! units, unlike the original TS, which never mattered there since it never
//! left single-byte ASCII tag lines, but matters here if we want offsets that
//! are safe to slice with).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TaggedBlock {
    /// Byte offset of the start of the opening tag's line.
    pub block_start: usize,
    /// Byte offset of the end of the closing tag's line (including its newline, if any).
    pub block_end: usize,
    /// Byte offset of the start of the line right after the opening tag.
    pub content_start: usize,
    /// Byte offset of the start of the closing tag's line (i.e. end of content).
    pub content_end: usize,
}

pub fn find_tagged_blocks(
    doc: &str,
    is_open: impl Fn(&str) -> bool,
    is_close: impl Fn(&str) -> bool,
) -> Vec<TaggedBlock> {
    let mut blocks = Vec::new();
    let mut offset = 0usize;
    let mut open_start: Option<usize> = None;
    let mut content_start = 0usize;

    for line in doc.split_inclusive('\n') {
        let line_start = offset;
        let trimmed = line.trim_end_matches('\n').trim();

        if open_start.is_none() {
            if is_open(trimmed) {
                open_start = Some(line_start);
                content_start = line_start + line.len();
            }
        } else if is_close(trimmed) {
            let block_start = open_start.take().unwrap();
            blocks.push(TaggedBlock {
                block_start,
                content_start,
                content_end: line_start,
                block_end: line_start + line.len(),
            });
        }

        offset += line.len();
    }

    blocks
}

/// Removes every `[start, end)` byte range in `blocks` from `doc`, then
/// collapses 3+ consecutive newlines down to 2 and trims trailing whitespace.
/// Mirrors `stripNotes`/`stripStyleBlocks` exactly.
pub fn strip_ranges(doc: &str, ranges: impl Iterator<Item = (usize, usize)>) -> String {
    let mut ranges: Vec<(usize, usize)> = ranges.collect();
    ranges.sort_unstable();

    let mut out = String::with_capacity(doc.len());
    let mut cursor = 0usize;
    for (start, end) in ranges {
        if start > cursor {
            out.push_str(&doc[cursor..start]);
        }
        cursor = cursor.max(end);
    }
    if cursor < doc.len() {
        out.push_str(&doc[cursor..]);
    }

    collapse_blank_lines(&out)
}

fn collapse_blank_lines(text: &str) -> String {
    crate::regex_cache::newline_run()
        .replace_all(text, "\n\n")
        .trim_end()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn is_open_notes(line: &str) -> bool {
        line.eq_ignore_ascii_case("[Notes]")
    }
    fn is_close_notes(line: &str) -> bool {
        line.eq_ignore_ascii_case("[/Notes]")
    }

    #[test]
    fn finds_a_simple_block() {
        let doc = "before\n[Notes]\nsecret\n[/Notes]\nafter\n";
        let blocks = find_tagged_blocks(doc, is_open_notes, is_close_notes);
        assert_eq!(blocks.len(), 1);
        let b = blocks[0];
        assert_eq!(&doc[b.block_start..b.block_end], "[Notes]\nsecret\n[/Notes]\n");
        assert_eq!(&doc[b.content_start..b.content_end], "secret\n");
    }

    #[test]
    fn unclosed_block_is_ignored() {
        let doc = "before\n[Notes]\nsecret, never closed\n";
        let blocks = find_tagged_blocks(doc, is_open_notes, is_close_notes);
        assert!(blocks.is_empty());
    }

    #[test]
    fn tag_must_be_the_whole_trimmed_line() {
        let doc = "[Notes] trailing text\nstill not a tag\n[/Notes]\n";
        let blocks = find_tagged_blocks(doc, is_open_notes, is_close_notes);
        assert!(blocks.is_empty());
    }

    #[test]
    fn strip_ranges_collapses_blank_lines_and_trims() {
        let doc = "keep\n\n[Notes]\nx\n[/Notes]\n\nkeep2\n\n\n";
        let blocks = find_tagged_blocks(doc, is_open_notes, is_close_notes);
        let stripped = strip_ranges(
            doc,
            blocks.iter().map(|b| (b.block_start, b.block_end)),
        );
        assert_eq!(stripped, "keep\n\nkeep2");
    }
}
