//! Synonym lookup from a bundled MyThes-format thesaurus data file
//! (`th_en_US_v2.dat`): a header line (encoding, skipped), then entries of
//! `word|meaningCount` followed by exactly `meaningCount` lines each
//! `(partOfSpeech)|syn1|syn2|...`, where individual synonyms may carry a
//! parenthetical annotation like `city (generic term)` or `(similar term)`.

use std::collections::HashMap;

const MAX_WORDS_PER_GROUP: usize = 12;

pub struct Thesaurus {
    raw: String,
    /// headword -> byte offset of its "word|count" header line in `raw`.
    index: HashMap<String, usize>,
}

pub struct SynonymGroup {
    pub pos: String,
    pub words: Vec<String>,
}

pub struct LookupResult {
    pub headword: String,
    pub groups: Vec<SynonymGroup>,
}

impl Thesaurus {
    /// Builds the headword index by walking the file once, skipping over
    /// each entry's meaning lines using its declared count (meaning content
    /// is re-read from `raw` on lookup, not stored in the index).
    pub fn load(raw: String) -> Self {
        let mut index = HashMap::new();
        let mut lines = raw.split('\n').peekable();
        lines.next(); // encoding header line

        let mut offset = raw.find('\n').map(|i| i + 1).unwrap_or(raw.len());

        while let Some(header) = lines.next() {
            let header_offset = offset;
            offset += header.len() + 1;

            let Some((word, count_str)) = header.rsplit_once('|') else {
                continue;
            };
            let Ok(count) = count_str.trim().parse::<usize>() else {
                continue;
            };

            index.entry(word.to_ascii_lowercase()).or_insert(header_offset);

            for _ in 0..count {
                match lines.next() {
                    Some(meaning_line) => offset += meaning_line.len() + 1,
                    None => break,
                }
            }
        }

        Self { raw, index }
    }

    pub fn lookup(&self, word: &str) -> Option<LookupResult> {
        let lower = word.to_ascii_lowercase();
        let (headword_offset, found_via) = self
            .index
            .get(&lower)
            .map(|&o| (o, lower.clone()))
            .or_else(|| lookup_candidates(&lower).into_iter().find_map(|c| {
                self.index.get(&c).map(|&o| (o, c))
            }))?;

        let header = self.raw[headword_offset..].lines().next()?;
        let (headword, count_str) = header.rsplit_once('|')?;
        let count: usize = count_str.trim().parse().ok()?;

        let mut rest = &self.raw[headword_offset + header.len() + 1..];
        let mut groups = Vec::new();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        seen.insert(found_via);
        seen.insert(headword.to_ascii_lowercase());

        for _ in 0..count {
            let Some(line) = rest.lines().next() else { break };
            rest = &rest[line.len().min(rest.len())..];
            rest = rest.strip_prefix('\n').unwrap_or(rest);

            let mut parts = line.split('|');
            let Some(pos_raw) = parts.next() else { continue };
            let pos = pos_raw.trim_matches(|c| c == '(' || c == ')').to_string();

            let mut words = Vec::new();
            for syn in parts {
                if let Some(cleaned) = clean_synonym(syn) {
                    let key = cleaned.to_ascii_lowercase();
                    if seen.insert(key) && words.len() < MAX_WORDS_PER_GROUP {
                        words.push(cleaned);
                    }
                }
            }

            if !words.is_empty() {
                groups.push(SynonymGroup { pos, words });
            }
        }

        if groups.is_empty() {
            None
        } else {
            Some(LookupResult {
                headword: headword.to_string(),
                groups,
            })
        }
    }
}

/// `"wood"` -> kept as-is. `"city (generic term)"` -> discarded (only
/// `(similar term)` annotations are kept, with the annotation stripped;
/// every other annotation type — generic/hypernym/related/antonym terms — is
/// discarded entirely).
fn clean_synonym(entry: &str) -> Option<String> {
    let entry = entry.trim();
    match entry.find('(') {
        None => Some(entry.to_string()),
        Some(paren_idx) => {
            let annotation = &entry[paren_idx..];
            if annotation.trim() == "(similar term)" {
                Some(entry[..paren_idx].trim().to_string())
            } else {
                None
            }
        }
    }
}

/// A small hand-written inflection stemmer, tried in order, first index hit
/// wins. Not a general stemmer — deliberately mirrors the original's
/// specific (and imperfect) heuristics.
fn lookup_candidates(word: &str) -> Vec<String> {
    let mut candidates = Vec::new();

    if let Some(stem) = word.strip_suffix("ies") {
        candidates.push(format!("{stem}y"));
    }
    if let Some(stem) = word.strip_suffix("es") {
        candidates.push(stem.to_string());
    }
    if let Some(stem) = word.strip_suffix('s') {
        candidates.push(stem.to_string());
    }
    if let Some(stem) = word.strip_suffix("ed") {
        candidates.push(stem.to_string());
        if let Some(stem2) = stem.strip_suffix('d') {
            candidates.push(stem2.to_string());
        }
        if ends_in_doubled_consonant(stem) {
            candidates.push(stem[..stem.len() - 1].to_string());
        }
    }
    if word.len() > 4 {
        if let Some(stem) = word.strip_suffix("ing") {
            candidates.push(stem.to_string());
            candidates.push(format!("{stem}e"));
            if ends_in_doubled_consonant(stem) {
                candidates.push(stem[..stem.len() - 1].to_string());
            }
        }
    }

    candidates
}

fn ends_in_doubled_consonant(s: &str) -> bool {
    let chars: Vec<char> = s.chars().collect();
    chars.len() >= 2
        && chars[chars.len() - 1] == chars[chars.len() - 2]
        && !"aeiou".contains(chars[chars.len() - 1])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> String {
        "UTF-8\n\
wood|2\n\
(noun)|forest|woodland|city (generic term)\n\
(adj)|wooden|(similar term)\n\
stop|1\n\
(verb)|halt|cease\n\
fade|1\n\
(verb)|dim|vanish\n\
run|1\n\
(verb)|sprint|dash\n\
"
        .to_string()
    }

    #[test]
    fn looks_up_a_direct_headword() {
        let t = Thesaurus::load(sample());
        let r = t.lookup("wood").unwrap();
        assert_eq!(r.headword, "wood");
        assert_eq!(r.groups.len(), 2);
        assert_eq!(r.groups[0].pos, "noun");
        assert!(r.groups[0].words.contains(&"forest".to_string()));
        // "city (generic term)" is discarded entirely.
        assert!(!r.groups[0].words.iter().any(|w| w.contains("city")));
        // "(similar term)" is kept with the annotation stripped.
        assert!(r.groups[1].words.contains(&"wooden".to_string()));
    }

    #[test]
    fn stemmer_fallback_handles_doubled_consonants() {
        let t = Thesaurus::load(sample());
        assert!(t.lookup("stopped").is_some()); // ed + doubled-consonant strip -> "stop"
        assert!(t.lookup("running").is_some()); // ing + doubled-consonant strip -> "run"
        assert!(t.lookup("fading").is_some()); // ing + "e" -> "fade"
    }

    #[test]
    fn unknown_word_returns_none() {
        let t = Thesaurus::load(sample());
        assert!(t.lookup("zzqxnotaword").is_none());
    }
}
