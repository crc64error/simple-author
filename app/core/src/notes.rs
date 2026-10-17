//! `[Notes]` ... `[/Notes]` blocks: private author notes embedded directly in
//! the manuscript text. The tags must be the *entire* trimmed line content,
//! case-insensitively. Save always keeps them; only Export and the various
//! word/line counts strip them.

use crate::block_scan::{find_tagged_blocks, strip_ranges, TaggedBlock};

fn is_open(line: &str) -> bool {
    line.eq_ignore_ascii_case("[Notes]")
}

fn is_close(line: &str) -> bool {
    line.eq_ignore_ascii_case("[/Notes]")
}

pub fn find_note_blocks(doc: &str) -> Vec<TaggedBlock> {
    find_tagged_blocks(doc, is_open, is_close)
}

/// Whether a line starting at byte offset `line_from` falls inside any note block
/// (strictly between the tag lines — the tag lines themselves are also "in" the
/// block for styling purposes, since `block_start..block_end` spans them too).
pub fn is_line_in_notes(blocks: &[TaggedBlock], line_from: usize) -> bool {
    blocks
        .iter()
        .any(|b| line_from >= b.block_start && line_from < b.block_end)
}

pub fn strip_notes(doc: &str) -> String {
    let blocks = find_note_blocks(doc);
    strip_ranges(doc, blocks.iter().map(|b| (b.block_start, b.block_end)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_a_notes_block_and_collapses_blank_lines() {
        let doc = "Chapter text.\n\n[Notes]\nRemember to check this later.\n[/Notes]\n\nMore text.\n";
        assert_eq!(strip_notes(doc), "Chapter text.\n\nMore text.");
    }

    #[test]
    fn unclosed_block_is_never_stripped() {
        let doc = "Text.\n[Notes]\nnever closed\n";
        assert_eq!(strip_notes(doc), doc.trim_end());
    }

    #[test]
    fn tag_detection_is_case_insensitive_but_whole_line() {
        let doc = "[notes]\nhidden\n[/NOTES]\nvisible\n";
        assert_eq!(strip_notes(doc), "visible");
    }

    #[test]
    fn is_line_in_notes_covers_the_tag_lines_themselves() {
        let doc = "[Notes]\nx\n[/Notes]\n";
        let blocks = find_note_blocks(doc);
        let open_tag_start = 0;
        let close_tag_start = doc.find("[/Notes]").unwrap();
        assert!(is_line_in_notes(&blocks, open_tag_start));
        assert!(is_line_in_notes(&blocks, close_tag_start));
    }
}
