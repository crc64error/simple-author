//! Scripture-reference highlighting (visual only — no verse lookup, no
//! export impact). Active only when the current writing mode's
//! `scripture_highlight` flag is set (currently Sermon mode only).
//!
//! Matches against an explicit list of book names/abbreviations, never a
//! generic "capitalized word + number" pattern — deliberately, to avoid
//! false positives like "Point 2" or "Verse 1".

use regex::Regex;
use std::sync::OnceLock;

/// Book names and common abbreviations. Numbered books use a `[123]? ?`
/// prefix (optional digit, optional space) ported to the plain `(?:[123]\s?)?`
/// form here.
const BOOKS: &[&str] = &[
    "Genesis", "Gen", "Exodus", "Exod", "Ex", "Leviticus", "Lev", "Numbers", "Num",
    "Deuteronomy", "Deut", "Joshua", "Josh", "Judges", "Judg", "Ruth",
    "Samuel", "Sam", "Kings", "Kgs", "Chronicles", "Chron", "Chr",
    "Ezra", "Nehemiah", "Neh", "Esther", "Esth", "Job", "Psalm", "Psalms", "Ps", "Pss",
    "Proverbs", "Prov", "Ecclesiastes", "Eccl", "Ecc", "Song of Solomon", "Song", "Isaiah", "Isa",
    "Jeremiah", "Jer", "Lamentations", "Lam", "Ezekiel", "Ezek", "Eze", "Daniel", "Dan",
    "Hosea", "Hos", "Joel", "Amos", "Obadiah", "Obad", "Jonah", "Micah", "Mic",
    "Nahum", "Nah", "Habakkuk", "Hab", "Zephaniah", "Zeph", "Haggai", "Hag",
    "Zechariah", "Zech", "Malachi", "Mal",
    "Matthew", "Matt", "Mt", "Mark", "Mk", "Luke", "Lk", "John", "Jn",
    "Acts", "Romans", "Rom", "Corinthians", "Cor", "Galatians", "Gal", "Ephesians", "Eph",
    "Philippians", "Phil", "Colossians", "Col", "Thessalonians", "Thess",
    "Timothy", "Tim", "Titus", "Philemon", "Phlm", "Hebrews", "Heb",
    "James", "Jas", "Peter", "Pet", "John", "Jude", "Revelation", "Rev",
];

/// Books that take an optional leading 1/2/3.
const NUMBERED: &[&str] = &[
    "Samuel", "Sam", "Kings", "Kgs", "Chronicles", "Chron", "Chr",
    "Corinthians", "Cor", "Thessalonians", "Thess", "Timothy", "Tim",
    "Peter", "Pet", "John", "Jn",
];

fn build_regex() -> Regex {
    let mut alts: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for &book in BOOKS {
        if !seen.insert(book) {
            continue;
        }
        let escaped = regex::escape(book);
        if NUMBERED.contains(&book) {
            alts.push(format!(r"(?:[123]\s?)?{escaped}\.?"));
        } else {
            alts.push(format!(r"{escaped}\.?"));
        }
    }
    // Longest-first so e.g. "Corinthians" is tried before a prefix match could
    // misfire (regex alternation is first-match, not longest-match).
    alts.sort_by_key(|a| std::cmp::Reverse(a.len()));

    let pattern = format!(
        r"\b(?:{})\s\d{{1,3}}(?::\d{{1,3}}(?:[-–]\d{{1,3}})?(?:,\s?\d{{1,3}}(?:[-–]\d{{1,3}})?)*)?\b",
        alts.join("|")
    );
    Regex::new(&pattern).expect("valid scripture regex")
}

pub fn regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(build_regex)
}

/// Byte ranges of every scripture reference found in `text`.
pub fn find_references(text: &str) -> Vec<(usize, usize)> {
    regex()
        .find_iter(text)
        .map(|m| (m.start(), m.end()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn matches(text: &str) -> Vec<&str> {
        regex().find_iter(text).map(|m| m.as_str()).collect()
    }

    #[test]
    fn matches_simple_references() {
        assert_eq!(matches("See John 3:16 for details."), vec!["John 3:16"]);
        assert_eq!(matches("Read Psalm 23 tonight."), vec!["Psalm 23"]);
    }

    #[test]
    fn matches_numbered_books_and_ranges() {
        assert_eq!(matches("1 Cor 13:4-7"), vec!["1 Cor 13:4-7"]);
        assert_eq!(matches("Rom. 8:28,31"), vec!["Rom. 8:28,31"]);
    }

    #[test]
    fn does_not_false_positive_on_generic_capitalized_numbers() {
        assert!(matches("See Point 2 and Verse 1 below.").is_empty());
    }
}
