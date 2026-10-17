//! Live spellcheck: English via a real Hunspell-format dictionary (`zspell`,
//! backed by the bundled `en.aff`/`en.dic`), Portuguese as a flat exact-match
//! allow-list (not a real Hunspell check — no Portuguese suggestions, it only
//! suppresses false-positive flags), plus a persistent user dictionary.
//!
//! Word tokenization (`crate::regex_cache::word`) is Latin letters including
//! the À-ÿ accented range, with one optional internal apostrophe-joined
//! segment (handles `don't`, `O'Brien`).

use crate::regex_cache::word as word_regex;
use std::collections::HashSet;

pub struct Spellchecker {
    english: Option<zspell::Dictionary>,
    portuguese_words: HashSet<String>,
    user_dict: HashSet<String>,
}

impl Spellchecker {
    /// `english` is `None` if the `.aff`/`.dic` files failed to load — in that
    /// case `is_valid_word` always returns `true` (nothing gets flagged),
    /// mirroring the original app's silent-degrade behavior.
    pub fn new(english: Option<zspell::Dictionary>, portuguese_dic_text: &str) -> Self {
        Self {
            english,
            portuguese_words: parse_portuguese_wordlist(portuguese_dic_text),
            user_dict: HashSet::new(),
        }
    }

    pub fn load_english(aff_text: &str, dic_text: &str) -> Option<zspell::Dictionary> {
        zspell::builder()
            .config_str(aff_text)
            .dict_str(dic_text)
            .build()
            .ok()
    }

    pub fn set_user_dictionary(&mut self, words: impl IntoIterator<Item = String>) {
        self.user_dict = words.into_iter().map(|w| w.to_ascii_lowercase()).collect();
    }

    pub fn user_dictionary_sorted(&self) -> Vec<String> {
        let mut v: Vec<String> = self.user_dict.iter().cloned().collect();
        v.sort();
        v
    }

    pub fn add_to_user_dictionary(&mut self, word: &str) {
        self.user_dict.insert(word.to_ascii_lowercase());
    }

    pub fn remove_from_user_dictionary(&mut self, word: &str) {
        self.user_dict.remove(&word.to_ascii_lowercase());
    }

    pub fn is_in_user_dictionary(&self, word: &str) -> bool {
        self.user_dict.contains(&word.to_ascii_lowercase())
    }

    /// 1. English not ready -> always valid.
    /// 2. &lt;2 chars, or starts with a digit -> always valid.
    /// 3. In the user dictionary -> valid.
    /// 4. English dictionary says correct -> valid.
    /// 5. In the Portuguese allow-list -> valid.
    /// 6. Otherwise -> misspelled.
    pub fn is_valid_word(&self, word: &str) -> bool {
        let Some(english) = &self.english else {
            return true;
        };

        let lower = word.to_ascii_lowercase();
        if lower.chars().count() < 2 {
            return true;
        }
        if lower.chars().next().is_some_and(|c| c.is_ascii_digit()) {
            return true;
        }
        if self.user_dict.contains(&lower) {
            return true;
        }
        if english.check_word(&lower) {
            return true;
        }
        self.portuguese_words.contains(&lower)
    }

    /// Up to `limit` suggestions, empty if the word is valid or English isn't ready.
    pub fn suggestions(&self, word: &str, limit: usize) -> Vec<String> {
        let Some(english) = &self.english else {
            return Vec::new();
        };
        if self.is_valid_word(word) {
            return Vec::new();
        }
        english
            .entry(word)
            .suggest()
            .unwrap_or_default()
            .into_iter()
            .take(limit)
            .map(str::to_string)
            .collect()
    }

    /// Byte ranges of every misspelled word in `text`. Callers should skip
    /// `[Notes]` lines and heading lines themselves (this module doesn't know
    /// about document structure) — matching the original, which never
    /// spellchecks inside Notes or on `^#{1,3}\s` lines, but DOES check
    /// inside `[Style]` blocks.
    pub fn find_misspellings<'a>(&'a self, text: &'a str) -> impl Iterator<Item = (usize, usize)> + 'a {
        word_regex()
            .find_iter(text)
            .filter(|m| !self.is_valid_word(m.as_str()))
            .map(|m| (m.start(), m.end()))
    }
}

/// Each line after the header: everything before the first `/` (the
/// Hunspell flag separator), lowercased.
fn parse_portuguese_wordlist(dic_text: &str) -> HashSet<String> {
    dic_text
        .lines()
        .skip(1)
        .filter_map(|line| line.split('/').next())
        .map(|w| w.trim().to_ascii_lowercase())
        .filter(|w| !w.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_aff() -> &'static str {
        "SET UTF-8\n"
    }
    fn sample_dic() -> &'static str {
        "3\nhello\nworld\ncat\n"
    }

    #[test]
    fn short_words_and_digit_leading_words_are_always_valid() {
        let english = Spellchecker::load_english(sample_aff(), sample_dic());
        let sc = Spellchecker::new(english, "");
        assert!(sc.is_valid_word("a"));
        assert!(sc.is_valid_word("I"));
        assert!(sc.is_valid_word("3rd"));
    }

    #[test]
    fn dictionary_word_is_valid_unknown_word_is_not() {
        let english = Spellchecker::load_english(sample_aff(), sample_dic());
        let sc = Spellchecker::new(english, "");
        assert!(sc.is_valid_word("hello"));
        assert!(!sc.is_valid_word("zzqxnotaword"));
    }

    #[test]
    fn user_dictionary_overrides_misspelling() {
        let english = Spellchecker::load_english(sample_aff(), sample_dic());
        let mut sc = Spellchecker::new(english, "");
        assert!(!sc.is_valid_word("frobnicate"));
        sc.add_to_user_dictionary("frobnicate");
        assert!(sc.is_valid_word("frobnicate"));
        sc.remove_from_user_dictionary("frobnicate");
        assert!(!sc.is_valid_word("frobnicate"));
    }

    #[test]
    fn portuguese_allowlist_suppresses_false_positives_with_no_suggestions() {
        let english = Spellchecker::load_english(sample_aff(), sample_dic());
        let sc = Spellchecker::new(english, "1\nobrigado/ABC\n");
        assert!(sc.is_valid_word("obrigado"));
        assert!(sc.suggestions("obrigado", 6).is_empty()); // valid -> no suggestions
    }

    #[test]
    fn missing_english_dictionary_never_flags_anything() {
        let sc = Spellchecker::new(None, "");
        assert!(sc.is_valid_word("zzqxnotaword"));
        assert!(sc.suggestions("zzqxnotaword", 6).is_empty());
    }
}
