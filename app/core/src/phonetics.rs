//! Offline syllable counting and rhyme lookup, built on the CMU Pronouncing
//! Dictionary. The dictionary is loaded once (`Phonetics::load`) from the
//! `dicts/cmudict.dict` text format (`word phoneme1 phoneme2 ...`).

use crate::regex_cache::word as word_regex;
use std::collections::HashMap;

pub struct Phonetics {
    /// word -> first-seen pronunciation (space-joined phonemes)
    dict: HashMap<String, String>,
    rhyme_index: HashMap<String, Vec<String>>,
    slant_index: HashMap<String, Vec<String>>,
}

impl Phonetics {
    /// Parses the CMU dict text format. Skips malformed lines, alternate
    /// pronunciations (`word(2) ...` — the first/default pronunciation wins),
    /// and anything that isn't a lowercase-letters-and-apostrophes word.
    pub fn load(cmudict_text: &str) -> Self {
        let mut dict: HashMap<String, String> = HashMap::new();

        for line in cmudict_text.lines() {
            let Some((word_token, phonemes)) = line.split_once(' ') else {
                continue;
            };
            if word_token.ends_with(')') {
                continue; // alternate pronunciation, e.g. "word(2)"
            }
            let lower = word_token.to_ascii_lowercase();
            if !lower.chars().all(|c| c.is_ascii_lowercase() || c == '\'') {
                continue;
            }
            dict.entry(lower).or_insert_with(|| phonemes.trim().to_string());
        }

        let mut rhyme_index: HashMap<String, Vec<String>> = HashMap::new();
        let mut slant_index: HashMap<String, Vec<String>> = HashMap::new();
        for (w, phonemes) in &dict {
            if w.len() < 2 {
                continue;
            }
            if let Some(key) = rhyme_key(phonemes) {
                rhyme_index.entry(key).or_default().push(w.clone());
            }
            if let Some(key) = slant_key(phonemes) {
                slant_index.entry(key).or_default().push(w.clone());
            }
        }

        Self { dict, rhyme_index, slant_index }
    }

    pub fn is_known(&self, word: &str) -> bool {
        self.dict.contains_key(&word.to_ascii_lowercase())
    }

    pub fn syllable_count(&self, word: &str) -> usize {
        match self.dict.get(&word.to_ascii_lowercase()) {
            Some(phonemes) => syllables_from_phonemes(phonemes),
            None => syllable_heuristic(word),
        }
    }

    pub fn syllables_in_line(&self, line: &str) -> usize {
        word_regex()
            .find_iter(line)
            .map(|m| self.syllable_count(m.as_str()))
            .sum()
    }

    /// `None` if the word isn't in the dictionary. `isRealWord` is typically
    /// "not misspelled" — rhyme candidates are filtered through it.
    pub fn lookup_rhymes(
        &self,
        word: &str,
        is_real_word: impl Fn(&str) -> bool,
        limit: usize,
    ) -> Option<RhymeResult> {
        let lower = word.to_ascii_lowercase();
        let phonemes = self.dict.get(&lower)?;

        let rkey = rhyme_key(phonemes);
        let skey = slant_key(phonemes);

        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        seen.insert(lower.clone());

        let perfect = rkey
            .as_ref()
            .map(|k| self.rhyme_index.get(k))
            .flatten()
            .map(|candidates| pick(candidates, &lower, &is_real_word, &mut seen, limit))
            .unwrap_or_default();

        let slant = skey
            .as_ref()
            .map(|k| self.slant_index.get(k))
            .flatten()
            .map(|candidates| pick(candidates, &lower, &is_real_word, &mut seen, limit))
            .unwrap_or_default();

        if perfect.is_empty() && slant.is_empty() {
            None
        } else {
            Some(RhymeResult { perfect, slant })
        }
    }
}

pub struct RhymeResult {
    pub perfect: Vec<String>,
    pub slant: Vec<String>,
}

fn pick(
    candidates: &[String],
    query: &str,
    is_real_word: &impl Fn(&str) -> bool,
    seen: &mut std::collections::HashSet<String>,
    limit: usize,
) -> Vec<String> {
    let mut deduped: Vec<&String> = candidates
        .iter()
        .filter(|c| c.len() >= 3)
        .filter(|c| !seen.contains(c.as_str()))
        .filter(|c| !(c.ends_with(query) || query.ends_with(c.as_str())))
        .filter(|c| is_real_word(c))
        .collect();
    deduped.sort_by(|a, b| a.len().cmp(&b.len()).then_with(|| a.cmp(b)));
    deduped.dedup();

    let mut out = Vec::new();
    for c in deduped {
        if out.len() >= limit {
            break;
        }
        seen.insert(c.clone());
        out.push(c.clone());
    }
    out
}

/// Syllable count = number of stress-digit characters in the phoneme string
/// (CMU vowel phonemes are stress-marked 0/1/2, e.g. `AH0`).
fn syllables_from_phonemes(phonemes: &str) -> usize {
    phonemes.chars().filter(|c| c.is_ascii_digit()).count()
}

/// Fallback for out-of-dictionary words (names, invented words): count vowel
/// groups, then apply the classic silent-e rule.
pub fn syllable_heuristic(word: &str) -> usize {
    let lower: String = word
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_lowercase() || "àáâãäåèéêëìíîïòóôõöùúûüý".contains(*c))
        .collect();
    if lower.is_empty() {
        return 0;
    }

    let is_vowel = |c: char| "aeiouyàáâãäåèéêëìíîïòóôõöùúûüý".contains(c);
    let mut groups = 0usize;
    let mut in_group = false;
    for c in lower.chars() {
        if is_vowel(c) {
            if !in_group {
                groups += 1;
                in_group = true;
            }
        } else {
            in_group = false;
        }
    }

    let chars: Vec<char> = lower.chars().collect();
    let mut count = groups;
    if chars.len() > 2 && *chars.last().unwrap() == 'e' && !lower.ends_with("le") {
        let before_e = chars[chars.len() - 2];
        if !is_vowel(before_e) {
            count = count.saturating_sub(1);
        }
    }

    count.max(1)
}

/// From the last primary-stressed vowel (`...1`) to the end of the
/// pronunciation; falls back to the last secondary-stressed vowel (`...2`),
/// then the last vowel with any stress digit at all. `None` if there's no
/// stress-marked vowel whatsoever.
fn rhyme_key(phonemes: &str) -> Option<String> {
    let parts: Vec<&str> = phonemes.split_whitespace().collect();
    find_stress_tail(&parts, '1')
        .or_else(|| find_stress_tail(&parts, '2'))
        .or_else(|| find_stress_tail_any_digit(&parts))
}

/// Same as `rhyme_key` but drops the first phoneme (the stressed vowel
/// itself), so words sharing only the consonant tail bucket together.
fn slant_key(phonemes: &str) -> Option<String> {
    let key = rhyme_key(phonemes)?;
    let mut it = key.split_whitespace();
    it.next();
    let rest: Vec<&str> = it.collect();
    if rest.is_empty() {
        None
    } else {
        Some(rest.join(" "))
    }
}

fn find_stress_tail(parts: &[&str], digit: char) -> Option<String> {
    let idx = parts.iter().rposition(|p| p.ends_with(digit))?;
    Some(parts[idx..].join(" "))
}

fn find_stress_tail_any_digit(parts: &[&str]) -> Option<String> {
    let idx = parts
        .iter()
        .rposition(|p| p.chars().last().is_some_and(|c| c.is_ascii_digit()))?;
    Some(parts[idx..].join(" "))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_dict() -> &'static str {
        "CAT K AE1 T\n\
MAT M AE1 T\n\
HAT(2) HH AE2 T\n\
MOON M UW1 N\n\
STONE S T OW1 N\n\
LINE L AY1 N\n\
WATER W AO1 T ER0\n\
BUTTER B AH1 T ER0\n\
LATER L EY1 T ER0\n\
CATS K AE1 T S\n\
SAT S AE1 T\n\
"
    }

    #[test]
    fn loads_and_skips_alternate_pronunciations() {
        let p = Phonetics::load(sample_dict());
        assert!(p.is_known("cat"));
        assert!(!p.is_known("hat")); // only an alternate "(2)" entry exists
    }

    #[test]
    fn syllable_count_uses_dictionary_first() {
        let p = Phonetics::load(sample_dict());
        assert_eq!(p.syllable_count("cat"), 1);
        assert_eq!(p.syllable_count("zzzznotaword"), syllable_heuristic("zzzznotaword"));
    }

    #[test]
    fn heuristic_applies_silent_e_rule() {
        assert_eq!(syllable_heuristic("cake"), 1);
        assert_eq!(syllable_heuristic("little"), 2); // ends in "le", no decrement
        assert_eq!(syllable_heuristic("store"), 1);
    }

    #[test]
    fn perfect_rhymes_share_stressed_vowel_tail() {
        let p = Phonetics::load(sample_dict());
        let result = p.lookup_rhymes("cat", |_| true, 14).unwrap();
        assert!(result.perfect.contains(&"mat".to_string()));
    }

    #[test]
    fn trivial_suffix_rhymes_are_excluded() {
        let p = Phonetics::load(sample_dict());
        let result = p.lookup_rhymes("cat", |_| true, 14).unwrap();
        assert!(!result.perfect.contains(&"cats".to_string()));
    }

    #[test]
    fn slant_rhymes_bucket_by_consonant_tail_after_a_different_vowel() {
        let p = Phonetics::load(sample_dict());
        let result = p.lookup_rhymes("water", |_| true, 14).unwrap();
        assert!(result.slant.contains(&"butter".to_string()) || result.slant.contains(&"later".to_string()));
    }

    #[test]
    fn rhyme_filtering_respects_is_real_word() {
        let p = Phonetics::load(sample_dict());
        let result = p.lookup_rhymes("cat", |w| w != "mat", 14).unwrap();
        assert!(!result.perfect.contains(&"mat".to_string()));
        assert!(result.perfect.contains(&"sat".to_string()));
    }
}
