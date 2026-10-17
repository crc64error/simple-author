//! Lazily-compiled regexes shared across modules.

use regex::Regex;
use std::sync::OnceLock;

macro_rules! cached_regex_fn {
    ($name:ident, $pattern:expr) => {
        pub fn $name() -> &'static Regex {
            static RE: OnceLock<Regex> = OnceLock::new();
            RE.get_or_init(|| Regex::new($pattern).expect("valid regex"))
        }
    };
}

// 3 or more consecutive newlines.
cached_regex_fn!(newline_run, r"\n{3,}");

// *italic* or _italic_, matched per line (the `[^*\n]`/`[^_\n]` classes can't cross lines,
// so this is safe to run against a whole multi-line doc, not just one line at a time).
cached_regex_fn!(emphasis, r"\*([^*\n]+)\*|_([^_\n]+)_");

// A word: Latin letters incl. the À-ÿ accented range, with one optional internal
// apostrophe-joined segment (don't, O'Brien).
cached_regex_fn!(word, r"[a-zA-ZÀ-ÿ]+(?:'[a-zA-ZÀ-ÿ]+)?");

// A line that is only a single bracket tag, e.g. `[Chorus]`, `[building vocals]`.
cached_regex_fn!(bracket_only_line, r"^\[[^\[\]]*\]$");
